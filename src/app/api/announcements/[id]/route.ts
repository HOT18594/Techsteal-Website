import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { announcements } from "@/lib/schema";
import { ACCOUNT_DB_ERROR_MESSAGE, requireAdminAccount } from "@/lib/accounts";
import {
  isAnnouncementIcon,
  isAnnouncementPattern,
  isAnnouncementTone,
  sanitizeAnnouncementHref,
  sanitizeHexColor,
} from "@/lib/announcements";
import { logAudit } from "@/lib/audit";
import { parseRouteId } from "@/lib/route-ids";
import type { Account } from "@/types";

export const dynamic = "force-dynamic";

async function requireAdmin(): Promise<{ error: NextResponse } | { admin: Account }> {
  const gate = await requireAdminAccount();
  if (gate.status === "db_error") {
    return { error: NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 }) };
  }
  if (gate.status === "no") {
    return { error: NextResponse.json({ error: "Admins only." }, { status: 403 }) };
  }
  return { admin: gate.account };
}

function serializeAnnouncement(row: typeof announcements.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    tone: row.tone,
    pattern: row.pattern,
    accentColor: row.accentColor,
    icon: row.icon,
    vibrant: row.vibrant,
    linkLabel: row.linkLabel,
    linkHref: row.linkHref,
    active: row.active,
    authorName: row.authorName,
    createdAt: row.createdAt,
  };
}

// Admin: edit title/body/style and/or toggle active visibility.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;

  const id = parseRouteId((await params).id);
  if (id === null) return NextResponse.json({ error: "Invalid announcement id." }, { status: 400 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;

  const updates: Partial<
    Pick<
      typeof announcements.$inferInsert,
      "active" | "title" | "body" | "tone" | "pattern" | "accentColor" | "icon" | "vibrant" | "linkLabel" | "linkHref"
    >
  > = {};

  if (raw.active !== undefined) {
    if (typeof raw.active !== "boolean") {
      return NextResponse.json({ error: "Invalid active flag." }, { status: 400 });
    }
    updates.active = raw.active;
  }

  if (raw.title !== undefined) {
    if (typeof raw.title !== "string") {
      return NextResponse.json({ error: "Invalid title." }, { status: 400 });
    }
    const trimmed = raw.title.trim();
    if (trimmed.length < 3 || trimmed.length > 120) {
      return NextResponse.json(
        { error: "Title must be between 3 and 120 characters." },
        { status: 400 }
      );
    }
    updates.title = trimmed;
  }

  if (raw.body !== undefined) {
    if (typeof raw.body !== "string") {
      return NextResponse.json({ error: "Invalid announcement body." }, { status: 400 });
    }
    const trimmed = raw.body.trim();
    if (trimmed.length > 400) {
      return NextResponse.json(
        { error: "Body must be 400 characters or fewer." },
        { status: 400 }
      );
    }
    updates.body = trimmed;
  }

  if (raw.tone !== undefined) {
    if (!isAnnouncementTone(raw.tone)) {
      return NextResponse.json({ error: "Choose a valid announcement color theme." }, { status: 400 });
    }
    updates.tone = raw.tone;
  }

  if (raw.pattern !== undefined) {
    if (!isAnnouncementPattern(raw.pattern)) {
      return NextResponse.json({ error: "Choose a valid background pattern." }, { status: 400 });
    }
    updates.pattern = raw.pattern;
  }

  if (raw.accentColor !== undefined) {
    if (typeof raw.accentColor !== "string") {
      return NextResponse.json({ error: "Invalid accent color." }, { status: 400 });
    }
    const trimmed = raw.accentColor.trim();
    const cleaned = sanitizeHexColor(trimmed);
    if (trimmed && !cleaned) {
      return NextResponse.json({ error: "Custom color must be a 6-digit hex like #22c55e." }, { status: 400 });
    }
    updates.accentColor = cleaned;
  }

  if (raw.icon !== undefined) {
    if (typeof raw.icon !== "string") {
      return NextResponse.json({ error: "Invalid icon." }, { status: 400 });
    }
    const trimmed = raw.icon.trim();
    if (trimmed && !isAnnouncementIcon(trimmed)) {
      return NextResponse.json({ error: "Choose an icon from the list." }, { status: 400 });
    }
    updates.icon = trimmed;
  }

  if (raw.vibrant !== undefined) {
    if (typeof raw.vibrant !== "boolean") {
      return NextResponse.json({ error: "Invalid vibrant flag." }, { status: 400 });
    }
    updates.vibrant = raw.vibrant;
  }

  if (raw.linkHref !== undefined) {
    if (typeof raw.linkHref !== "string") {
      return NextResponse.json({ error: "Invalid link URL." }, { status: 400 });
    }
    const trimmed = raw.linkHref.trim();
    const cleaned = sanitizeAnnouncementHref(trimmed);
    if (trimmed && !cleaned) {
      return NextResponse.json(
        { error: "Link must be a relative path (like /join) or an http(s) URL." },
        { status: 400 }
      );
    }
    updates.linkHref = cleaned;
    if (!cleaned) updates.linkLabel = "";
  }

  if (raw.linkLabel !== undefined) {
    if (typeof raw.linkLabel !== "string") {
      return NextResponse.json({ error: "Invalid link label." }, { status: 400 });
    }
    updates.linkLabel = raw.linkLabel.trim().slice(0, 32);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const db = getDb();
  if (!db) return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });

  try {
    const [existing] = await db
      .select()
      .from(announcements)
      .where(eq(announcements.id, id))
      .limit(1);
    if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const [updated] = await db
      .update(announcements)
      .set(updates)
      .where(eq(announcements.id, id))
      .returning();
    if (!updated) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const contentChanged =
      (updates.title !== undefined && updates.title !== existing.title) ||
      (updates.body !== undefined && updates.body !== existing.body) ||
      (updates.tone !== undefined && updates.tone !== existing.tone) ||
      (updates.pattern !== undefined && updates.pattern !== existing.pattern) ||
      (updates.accentColor !== undefined && updates.accentColor !== existing.accentColor) ||
      (updates.icon !== undefined && updates.icon !== existing.icon) ||
      (updates.vibrant !== undefined && updates.vibrant !== existing.vibrant) ||
      (updates.linkLabel !== undefined && updates.linkLabel !== existing.linkLabel) ||
      (updates.linkHref !== undefined && updates.linkHref !== existing.linkHref);
    const activeChanged = updates.active !== undefined && updates.active !== existing.active;

    if (contentChanged) {
      await logAudit({
        actorId: guard.admin.id,
        actorName: guard.admin.username,
        action: "announcement_edit",
        targetId: String(updated.id),
        targetName: updated.title,
        detail: `${updated.tone}${updated.pattern !== "none" ? ` · ${updated.pattern}` : ""}`,
      });
    }

    if (activeChanged) {
      await logAudit({
        actorId: guard.admin.id,
        actorName: guard.admin.username,
        action: "announcement_toggle",
        targetId: String(updated.id),
        targetName: updated.title,
        detail: updated.active ? "shown" : "hidden",
      });
    }

    return NextResponse.json({
      ok: true,
      active: updated.active,
      announcement: serializeAnnouncement(updated),
    });
  } catch (err) {
    console.error("api/announcements PATCH: update failed", err);
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;

  const id = parseRouteId((await params).id);
  if (id === null) return NextResponse.json({ error: "Invalid announcement id." }, { status: 400 });

  const db = getDb();
  if (!db) return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });

  try {
    const [deleted] = await db
      .delete(announcements)
      .where(eq(announcements.id, id))
      .returning();
    if (!deleted) return NextResponse.json({ error: "Not found." }, { status: 404 });

    await logAudit({
      actorId: guard.admin.id,
      actorName: guard.admin.username,
      action: "announcement_delete",
      targetId: String(deleted.id),
      targetName: deleted.title,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("api/announcements DELETE: delete failed", err);
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
}
