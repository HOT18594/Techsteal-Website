import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { forumReplies, forumThreads } from "@/lib/schema";
import { fallbackThreads } from "@/lib/fallback-data";
import { getSessionUser } from "@/lib/auth";
import { findAccount, isAdminUser } from "@/lib/accounts";
import { isRateLimited } from "@/lib/rate-limit";
import { avatarInfoFor, resolveAuthorAvatars } from "@/lib/forum-avatars";

export const dynamic = "force-dynamic";

const CATEGORIES = ["General", "Announcements", "Ideas", "Builds", "Redstone", "Technical", "Off-topic"];

/** Parse a thread/reply id from a JSON body, rejecting null/""/0. */
function parseId(value: unknown): number | null {
  const id = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// List all threads — pinned first, then newest.
export async function GET() {
  const db = getDb();
  if (!db) return NextResponse.json(fallbackThreads);
  const rows = await db
    .select()
    .from(forumThreads)
    .orderBy(desc(forumThreads.pinned), desc(forumThreads.createdAt));
  const avatars = await resolveAuthorAvatars(rows);
  return NextResponse.json(
    rows.map((row) => {
      const info = avatarInfoFor(avatars, row);
      return {
        ...row,
        avatarUrl: info?.avatarUrl ?? null,
        color: info?.color ?? row.color,
      };
    })
  );
}

// Create a thread. The author is taken from the signed-in account — you
// must be logged in (via Discord) to post.
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in to post." }, { status: 401 });
  }

  if (isRateLimited(`forum:${user.id}`, 5, 60_000)) {
    return NextResponse.json(
      { error: "You're posting too fast — wait a moment." },
      { status: 429 }
    );
  }

  // A deleted/de-powered account (cookie still valid) must not keep posting.
  const account = getDb()
    ? await findAccount(user.id).catch(() => null)
    : undefined;
  if (getDb() && (!account || account.banned)) {
    return NextResponse.json(
      { error: "Your account no longer exists on this server." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  let category = typeof body.category === "string" ? body.category : "General";
  if (!CATEGORIES.includes(category)) category = "General";

  if (!title) {
    return NextResponse.json({ error: "A title is required." }, { status: 400 });
  }
  // Server-side caps (the client enforces these too, but the API must not
  // trust the client — otherwise a hammering client bloats the DB and every
  // future AI prompt that read thread content).
  if (title.length > 120) {
    return NextResponse.json({ error: "Titles can be at most 120 characters." }, { status: 400 });
  }
  if (content.length > 4000) {
    return NextResponse.json({ error: "Threads can be at most 4000 characters." }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    // No database configured yet — posting isn't possible. Return 503 (like
    // the thread-detail route) instead of a fake thread that dead-ends.
    return NextResponse.json(
      { error: "Posting needs the database — it isn't configured yet." },
      { status: 503 }
    );
  }

  // Author name comes from the live account, not the (up to 7-day-old)
  // session cookie, so renamed users post under their current name.
  const username = account?.username ?? user.username;
  const values = {
    title,
    content,
    author: username,
    authorId: user.id,
    category,
    avatar: username.slice(0, 1).toUpperCase(),
    tagClass: "tag-accent",
  };

  const [created] = await db
    .insert(forumThreads)
    .values({ ...values, last: new Date().toISOString() })
    .returning();
  const avatars = await resolveAuthorAvatars([created]);
  const info = avatarInfoFor(avatars, created);
  return NextResponse.json({ ...created, avatarUrl: info?.avatarUrl ?? null }, { status: 201 });
}

// Admin moderation: pin/unpin a thread.
// Body: { id, pinned }
export async function PATCH(request: NextRequest) {
  if (!(await isAdminUser())) {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const id = parseId(body?.id);
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const rows = await db
    .update(forumThreads)
    .set({ pinned: Boolean(body.pinned) })
    .where(eq(forumThreads.id, id))
    .returning();
  if (rows.length === 0) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }
  return NextResponse.json(rows[0]);
}

// Delete a thread. Admins can delete anything; members can delete their
// own threads (the schema has authorId for exactly this).
export async function DELETE(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const id = parseId(body?.id);
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const [thread] = await db
    .select({ authorId: forumThreads.authorId })
    .from(forumThreads)
    .where(eq(forumThreads.id, id))
    .limit(1);
  const isOwner = thread?.authorId === user.id && thread.authorId !== "";
  if (!isOwner && !(await isAdminUser())) {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const rows = await db.delete(forumThreads).where(eq(forumThreads.id, id)).returning();
  if (rows.length === 0) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }
  // Clean up its replies too.
  await db.delete(forumReplies).where(eq(forumReplies.threadId, id));
  return NextResponse.json({ ok: true });
}
