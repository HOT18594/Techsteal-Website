import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { forumReplies, forumThreads } from "@/lib/schema";
import { fallbackThreads } from "@/lib/fallback-data";
import { getSessionUser } from "@/lib/auth";
import { findAccount, isAdminUser } from "@/lib/accounts";
import { avatarInfoFor, resolveAuthorAvatars } from "@/lib/forum-avatars";

export const dynamic = "force-dynamic";

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

  // A deleted/de-powered account (cookie still valid) must not keep posting.
  if (getDb()) {
    const account = await findAccount(user.id).catch(() => null);
    if (!account) {
      return NextResponse.json(
        { error: "Your account no longer exists on this server." },
        { status: 403 }
      );
    }
  }

  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const category = typeof body.category === "string" ? body.category : "General";

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
  const values = {
    title,
    content,
    author: user.username,
    authorId: user.id,
    category,
    avatar: user.username.slice(0, 1).toUpperCase(),
    tagClass: "tag-accent",
  };

  if (!db) {
    // No database configured yet — nothing persists. Return an id so the
    // client can optimistically render the new thread.
    return NextResponse.json(
      {
        id: Date.now(),
        ...values,
        replies: 0,
        last: new Date().toISOString(),
        pinned: false,
      },
      { status: 201 }
    );
  }

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
  const id = Number(body?.id);
  if (!Number.isInteger(id)) {
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

// Admin moderation: delete a thread.
export async function DELETE(request: NextRequest) {
  if (!(await isAdminUser())) {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const rows = await db.delete(forumThreads).where(eq(forumThreads.id, id)).returning();
  if (rows.length === 0) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }
  // Clean up its replies too.
  await db.delete(forumReplies).where(eq(forumReplies.threadId, id));
  return NextResponse.json({ ok: true });
}
