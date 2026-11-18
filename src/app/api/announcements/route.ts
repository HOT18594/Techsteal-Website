import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { announcements } from "@/lib/schema";
import { ACCOUNT_DB_ERROR_MESSAGE, requireAdminAccount } from "@/lib/accounts";
import { logAudit } from "@/lib/audit";
import { isRateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const TONES = new Set(["info", "warning", "critical"]);

/** Shapes a row for the public bar — never the author id. */
function publicAnnouncement(row: typeof announcements.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    tone: row.tone,
    authorName: row.authorName,
    createdAt: row.createdAt,
  };
}

// Public: the live announcement bar reads this. Only active rows, newest
// first, capped so a backlog in the table can't bloat the response.
export async function GET(): Promise<NextResponse> {
  const db = getDb();
  if (!db) return NextResponse.json({ announcements: [] });
  try {
    const rows = await db
      .select()
      .from(announcements)
      .where(eq(announcements.active, true))
      .orderBy(desc(announcements.createdAt))
      .limit(5);
    return NextResponse.json({ announcements: rows.map(publicAnnouncement) });
  } catch (err) {
    // A broken table must not take the navbar down with it.
    console.error("api/announcements GET: query failed", err);
    return NextResponse.json({ announcements: [] });
  }
}

// Admin: publish an announcement.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const gate = await requireAdminAccount();
  if (gate.status === "db_error") {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
  if (gate.status === "no") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }
  const admin = gate.account;

  if (isRateLimited(`announce:${admin.id}`, 12, 60_000)) {
    return NextResponse.json({ error: "Slow down a little." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const rawTitle = typeof raw.title === "string" ? raw.title.trim() : "";
  if (rawTitle.length < 3 || rawTitle.length > 120) {
    return NextResponse.json(
      { error: "Give it a title between 3 and 120 characters." },
      { status: 400 }
    );
  }
  const rawBody = typeof raw.body === "string" ? raw.body.trim() : "";
  if (rawBody.length > 400) {
    return NextResponse.json(
      { error: "Announcement body must be 400 characters or fewer." },
      { status: 400 }
    );
  }
  const tone = typeof raw.tone === "string" && TONES.has(raw.tone) ? raw.tone : "info";

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }

  try {
    const [created] = await db
      .insert(announcements)
      .values({
        title: rawTitle,
        body: rawBody,
        tone,
        active: true,
        authorId: admin.id,
        authorName: admin.username,
      })
      .returning();

    await logAudit({
      actorId: admin.id,
      actorName: admin.username,
      action: "announcement_create",
      targetId: String(created.id),
      targetName: rawTitle,
      detail: tone,
    });

    return NextResponse.json({
      announcement: { ...publicAnnouncement(created), active: created.active },
    });
  } catch (err) {
    console.error("api/announcements POST: insert failed", err);
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
}
