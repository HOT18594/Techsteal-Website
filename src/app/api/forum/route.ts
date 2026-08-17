import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fallbackThreads } from "@/lib/fallback-data";
import { forumThreads } from "@/lib/schema";

export const dynamic = "force-dynamic";

const AVATAR_COLORS = [
  "avatar-1",
  "avatar-2",
  "avatar-3",
  "avatar-4",
  "avatar-5",
  "avatar-6",
  "avatar-7",
  "avatar-8",
];

const TAG_BY_CATEGORY: Record<string, string> = {
  Announcements: "tag-accent",
  Ideas: "tag-diamond",
  Builds: "tag-accent",
  Redstone: "tag-redstone",
  Technical: "tag-redstone",
  "Off-topic": "tag-emerald",
};

export async function GET() {
  const db = getDb();
  if (!db) return NextResponse.json(fallbackThreads);

  const rows = await db
    .select()
    .from(forumThreads)
    .orderBy(desc(forumThreads.pinned), desc(forumThreads.createdAt));
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const db = getDb();
  if (!db) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const author = typeof body?.author === "string" ? body.author.trim() : "";
  const category =
    typeof body?.category === "string" ? body.category.trim() : "General";

  if (!title || !author) {
    return NextResponse.json(
      { error: "title and author are required" },
      { status: 400 }
    );
  }

  const avatar = author.charAt(0).toUpperCase() || "P";
  const color =
    AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

  const [row] = await db
    .insert(forumThreads)
    .values({
      title,
      author,
      avatar,
      color,
      category,
      tagClass: TAG_BY_CATEGORY[category] ?? "tag-accent",
      replies: 0,
      last: "just now",
      pinned: false,
    })
    .returning();

  return NextResponse.json(row, { status: 201 });
}
