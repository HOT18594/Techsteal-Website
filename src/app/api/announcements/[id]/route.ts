import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { announcements } from "@/lib/schema";
import { checkAdmin, ACCOUNT_DB_ERROR_MESSAGE } from "@/lib/accounts";
import { getSessionUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

async function requireAdmin(): Promise<{ error: NextResponse } | { user: { id: string; username: string } }> {
  const verdict = await checkAdmin();
  if (verdict === "db_error") {
    return { error: NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 }) };
  }
  if (verdict === "no") {
    return { error: NextResponse.json({ error: "Admins only." }, { status: 403 }) };
  }
  const user = await getSessionUser();
  if (!user) return { error: NextResponse.json({ error: "Admins only." }, { status: 403 }) };
  return { user };
}

function parseId(raw: string): number | null {
  const id = Number.parseInt(raw, 10);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// Admin: show or hide an announcement without deleting it.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;

  const id = parseId((await params).id);
  if (id === null) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const active = body && typeof body === "object" ? (body as Record<string, unknown>).active : undefined;
  if (typeof active !== "boolean") {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const db = getDb();
  if (!db) return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });

  try {
    const [updated] = await db
      .update(announcements)
      .set({ active })
      .where(eq(announcements.id, id))
      .returning();
    if (!updated) return NextResponse.json({ error: "Not found." }, { status: 404 });

    await logAudit({
      actorId: guard.user.id,
      actorName: guard.user.username,
      action: "announcement_toggle",
      targetName: updated.title,
      detail: active ? "shown" : "hidden",
    });

    return NextResponse.json({ ok: true, active: updated.active });
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

  const id = parseId((await params).id);
  if (id === null) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const db = getDb();
  if (!db) return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });

  try {
    const [deleted] = await db
      .delete(announcements)
      .where(eq(announcements.id, id))
      .returning();
    if (!deleted) return NextResponse.json({ error: "Not found." }, { status: 404 });

    await logAudit({
      actorId: guard.user.id,
      actorName: guard.user.username,
      action: "announcement_delete",
      targetName: deleted.title,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("api/announcements DELETE: delete failed", err);
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
}
