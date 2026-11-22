import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { announcements } from "@/lib/schema";
import { ACCOUNT_DB_ERROR_MESSAGE, requireAdminAccount } from "@/lib/accounts";

export const dynamic = "force-dynamic";

// Admin view of the announcement table: every row, including hidden ones, so
// the panel can re-show or edit something it hid earlier.
export async function GET() {
  const gate = await requireAdminAccount();
  if (gate.status === "db_error") {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
  if (gate.status === "no") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

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
        pattern: row.pattern,
        accentColor: row.accentColor,
        icon: row.icon,
        vibrant: row.vibrant,
        linkLabel: row.linkLabel,
        linkHref: row.linkHref,
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
