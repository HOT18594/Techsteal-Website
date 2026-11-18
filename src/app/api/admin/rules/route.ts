import { NextRequest, NextResponse } from "next/server";
import { asc, count, eq, inArray } from "drizzle-orm";
import { ACCOUNT_DB_ERROR_MESSAGE, requireAdminAccount } from "@/lib/accounts";
import { logAudit } from "@/lib/audit";
import { getDb, type Db } from "@/lib/db";
import { fallbackRules } from "@/lib/fallback-data";
import { parseBodyId, parseRouteId } from "@/lib/route-ids";
import { ruleSections } from "@/lib/schema";
import type { Account } from "@/types";

export const dynamic = "force-dynamic";

const ICON_RE = /^fa-[a-z0-9-]+$/i;

async function requireAdminAndDb(): Promise<
  { error: NextResponse } | { admin: Account; db: Db }
> {
  const gate = await requireAdminAccount();
  if (gate.status === "db_error") {
    return { error: NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 }) };
  }
  if (gate.status === "no") {
    return { error: NextResponse.json({ error: "Admins only." }, { status: 403 }) };
  }
  const db = getDb();
  if (!db) {
    return { error: NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 }) };
  }
  return { admin: gate.account, db };
}

function validateSectionInput(raw: Record<string, unknown>):
  | { title: string; icon: string; rules: string[] }
  | { error: string } {
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (title.length < 2 || title.length > 80) {
    return { error: "Section title must be between 2 and 80 characters." };
  }

  const rawIcon =
    raw.icon === undefined || raw.icon === null || raw.icon === ""
      ? "fa-shield-halved"
      : typeof raw.icon === "string"
        ? raw.icon.trim()
        : "";
  if (!rawIcon || rawIcon.length > 60 || !ICON_RE.test(rawIcon)) {
    return { error: "Icon must be a Font Awesome icon name like fa-shield-halved." };
  }

  if (!Array.isArray(raw.rules)) {
    return { error: "Rules must be an array of text items." };
  }
  if (raw.rules.some((item) => typeof item !== "string")) {
    return { error: "Every rule must be plain text." };
  }
  const rules = (raw.rules as string[]).map((r) => r.trim()).filter(Boolean);
  if (rules.length === 0) {
    return { error: "Add at least one rule to the section." };
  }
  if (rules.length > 25) {
    return { error: "A section can have at most 25 rules." };
  }
  if (rules.some((r) => r.length < 2 || r.length > 300)) {
    return { error: "Each rule must be between 2 and 300 characters." };
  }

  return { title, icon: rawIcon, rules };
}

export async function GET() {
  const guard = await requireAdminAndDb();
  if ("error" in guard) return guard.error;

  try {
    const sections = await guard.db
      .select()
      .from(ruleSections)
      .orderBy(asc(ruleSections.id));
    const usingFallback = sections.length === 0;
    return NextResponse.json({
      sections,
      usingFallback,
      fallback: fallbackRules,
    });
  } catch (err) {
    console.error("api/admin/rules GET: query failed", err);
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireAdminAndDb();
  if ("error" in guard) return guard.error;
  const { admin, db } = guard;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;

  if (raw.action === "seed_defaults") {
    try {
      const [{ n }] = await db.select({ n: count() }).from(ruleSections);
      if (Number(n) > 0 && raw.force !== true) {
        return NextResponse.json(
          { error: "Rule sections already exist in the database." },
          { status: 409 }
        );
      }

      await db.insert(ruleSections).values(
        fallbackRules.map((s) => ({
          icon: s.icon,
          title: s.title,
          rules: s.rules,
        }))
      );

      await logAudit({
        actorId: admin.id,
        actorName: admin.username,
        action: "rule_create",
        detail: "Seeded default rule sections",
      });

      const sections = await db
        .select()
        .from(ruleSections)
        .orderBy(asc(ruleSections.id));
      return NextResponse.json({ ok: true, sections });
    } catch (err) {
      console.error("api/admin/rules POST seed_defaults: failed", err);
      return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
    }
  }

  const parsed = validateSectionInput(raw);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const [section] = await db
      .insert(ruleSections)
      .values({
        title: parsed.title,
        icon: parsed.icon,
        rules: parsed.rules,
      })
      .returning();

    await logAudit({
      actorId: admin.id,
      actorName: admin.username,
      action: "rule_create",
      targetId: String(section.id),
      targetName: section.title,
    });

    return NextResponse.json({ section });
  } catch (err) {
    console.error("api/admin/rules POST: insert failed", err);
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
}

export async function PUT(request: NextRequest) {
  const guard = await requireAdminAndDb();
  if ("error" in guard) return guard.error;
  const { admin, db } = guard;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;

  if (raw.action === "swap") {
    const idA = parseBodyId(raw.idA);
    const idB = parseBodyId(raw.idB);
    if (!idA || !idB || idA === idB) {
      return NextResponse.json(
        { error: "Provide two distinct rule section IDs to reorder." },
        { status: 400 }
      );
    }

    try {
      const swapped = await db.transaction(async (tx) => {
        const rows = await tx
          .select()
          .from(ruleSections)
          .where(inArray(ruleSections.id, [idA, idB]))
          .orderBy(asc(ruleSections.id))
          .for("update");
        if (rows.length !== 2) return null;
        const [first, second] = rows;
        await tx
          .update(ruleSections)
          .set({ icon: second.icon, title: second.title, rules: second.rules })
          .where(eq(ruleSections.id, first.id));
        await tx
          .update(ruleSections)
          .set({ icon: first.icon, title: first.title, rules: first.rules })
          .where(eq(ruleSections.id, second.id));
        return { firstTitle: first.title, secondTitle: second.title };
      });

      if (!swapped) {
        return NextResponse.json(
          { error: "One or both rule sections were not found." },
          { status: 404 }
        );
      }

      await logAudit({
        actorId: admin.id,
        actorName: admin.username,
        action: "rule_reorder",
        detail: `Swapped "${swapped.firstTitle}" and "${swapped.secondTitle}"`,
      });

      return NextResponse.json({ ok: true });
    } catch (err) {
      console.error("api/admin/rules PUT swap: failed", err);
      return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
    }
  }

  const id = parseBodyId(raw.id);
  if (!id) {
    return NextResponse.json({ error: "Valid section id is required." }, { status: 400 });
  }

  const parsed = validateSectionInput(raw);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const [updated] = await db
      .update(ruleSections)
      .set({
        title: parsed.title,
        icon: parsed.icon,
        rules: parsed.rules,
      })
      .where(eq(ruleSections.id, id))
      .returning();
    if (!updated) {
      return NextResponse.json({ error: "Rule section not found." }, { status: 404 });
    }

    await logAudit({
      actorId: admin.id,
      actorName: admin.username,
      action: "rule_update",
      targetId: String(updated.id),
      targetName: updated.title,
    });

    return NextResponse.json({ section: updated });
  } catch (err) {
    console.error("api/admin/rules PUT: update failed", err);
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requireAdminAndDb();
  if ("error" in guard) return guard.error;
  const { admin, db } = guard;

  const body = await request.json().catch(() => null);
  const rawId =
    body && typeof body === "object"
      ? (body as Record<string, unknown>).id
      : undefined;
  const id = parseBodyId(rawId) ?? parseRouteId(request.nextUrl.searchParams.get("id"));
  if (!id) {
    return NextResponse.json({ error: "Valid section id is required." }, { status: 400 });
  }

  try {
    const [deleted] = await db
      .delete(ruleSections)
      .where(eq(ruleSections.id, id))
      .returning();
    if (!deleted) {
      return NextResponse.json({ error: "Rule section not found." }, { status: 404 });
    }

    await logAudit({
      actorId: admin.id,
      actorName: admin.username,
      action: "rule_delete",
      targetId: String(deleted.id),
      targetName: deleted.title,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("api/admin/rules DELETE: failed", err);
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
}
