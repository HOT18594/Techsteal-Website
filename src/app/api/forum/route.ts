import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { forumThreads } from "@/lib/schema";
import { fallbackThreads } from "@/lib/fallback-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  if (!db) return NextResponse.json(fallbackThreads);
  const rows = await db.select().from(forumThreads).orderBy(desc(forumThreads.createdAt));
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const author = typeof body.author === "string" ? body.author.trim() : "";
  const category = typeof body.category === "string" ? body.category : "General";

  if (!title || !author) {
    return NextResponse.json(
      { error: "Both a title and your name are required." },
      { status: 400 }
    );
  }

  const db = getDb();
  const values = {
    title,
    author,
    category,
    avatar: author.slice(0, 1).toUpperCase(),
    tagClass: "tag-accent",
  };

  if (!db) {
    // No database configured yet — demo only, nothing persists. Return an
    // id so the client can optimistically render the new thread.
    return NextResponse.json(
      { id: Date.now(), ...values, replies: 0, last: "just now", pinned: false },
      { status: 201 }
    );
  }

  const [created] = await db
    .insert(forumThreads)
    .values(values)
    .returning();
  return NextResponse.json(created, { status: 201 });
}