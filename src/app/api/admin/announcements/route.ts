import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { announcements } from "@/lib/schema";
import { checkAdmin, ACCOUNT_DB_ERROR_MESSAGE } from "@/lib/accounts";

export const dynamic = "force-dynamic";

// Admin view of the announcement table: every row, including hidden ones, so
// the panel can re-show something it hid earlier. The public endpoint only
// ever returns active rows.
export async function GET() {
  const verdict = await checkAdmin();
  if (verdict === "db_error") {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
  if (verdict === "no") return NextResponse.json({ error: "Admins only." }, { status: 403 });

  const db = getDb();
  if (!db) return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });

  try {
    const rows = await db
      .select()
      .from(announcements)
      .orderBy(desc(announcements.createdAt))
      .limit(60);
    return NextResponse.json({
      announcements: rows.map((row) => ({
        id: row.id,
        title: row.title,
        body: row.body,
        tone: row.tone,
        active: row.active,
        authorName: row.authorName,
        createdAt: row.createdAt,
      })),
    });
  } catch (err) {
    console.error("api/admin/announcements: query failed", err);
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
}
