import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { forumReplies, forumThreads } from "@/lib/schema";
import { getSessionUser } from "@/lib/auth";
import { findAccount, isAdminUser } from "@/lib/accounts";
import { isRateLimited } from "@/lib/rate-limit";
import { avatarInfoFor, resolveAuthorAvatars } from "@/lib/forum-avatars";

export const dynamic = "force-dynamic";

/** Parse a reply id from a JSON body, rejecting null/""/0. */
function parseReplyId(value: unknown): number | null {
  const id =
    typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Thread detail: thread + its replies (pinned comments first, then oldest).
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const threadId = Number(id);
  if (!Number.isInteger(threadId)) {
    return NextResponse.json({ error: "Invalid thread id" }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const threads = await db
    .select()
    .from(forumThreads)
    .where(eq(forumThreads.id, threadId))
    .limit(1);
  if (threads.length === 0) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const replies = await db
    .select()
    .from(forumReplies)
    .where(eq(forumReplies.threadId, threadId))
    .orderBy(desc(forumReplies.pinned), asc(forumReplies.createdAt));

  const avatars = await resolveAuthorAvatars([threads[0], ...replies]);
  const enrich = (row: { authorId?: string | null; author?: string | null; color: string }) => {
    const info = avatarInfoFor(avatars, row);
    return { avatarUrl: info?.avatarUrl ?? null, color: info?.color ?? row.color };
  };

  return NextResponse.json({
    thread: { ...threads[0], ...enrich(threads[0]) },
    replies: replies.map((r) => ({ ...r, ...enrich(r) })),
  });
}

// Reply to a thread (must be signed in).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in to reply." }, { status: 401 });
  }

  const { id } = await params;
  const threadId = Number(id);
  if (!Number.isInteger(threadId)) {
    return NextResponse.json({ error: "Invalid thread id" }, { status: 400 });
  }

  if (isRateLimited(`reply:${user.id}`, 10, 60_000)) {
    return NextResponse.json(
      { error: "You're replying too fast — wait a moment." },
      { status: 429 }
    );
  }

  // A deleted/de-powered account (cookie still valid) must not keep replying.
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
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "A reply can't be empty." }, { status: 400 });
  }
  if (content.length > 4000) {
    return NextResponse.json({ error: "Replies can be at most 4000 characters." }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const threads = await db
    .select()
    .from(forumThreads)
    .where(eq(forumThreads.id, threadId))
    .limit(1);
  if (threads.length === 0) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const username = account?.username ?? user.username;
  const [reply] = await db
    .insert(forumReplies)
    .values({
      threadId,
      content,
      author: username,
      authorId: user.id,
      avatar: username.slice(0, 1).toUpperCase(),
      color: "avatar-2",
    })
    .returning();

  // Atomic increment — a plain `replies + 1` read from `threads[0]` would
  // lose a count when two replies land at once (both read 5, both write 6).
  // `last` mirrors the same moment as the new reply's timestamp.
  await db
    .update(forumThreads)
    .set({ replies: sql`${forumThreads.replies} + 1`, last: new Date().toISOString() })
    .where(eq(forumThreads.id, threadId));

  const avatars = await resolveAuthorAvatars([reply]);
  const info = avatarInfoFor(avatars, reply);
  return NextResponse.json({ ...reply, avatarUrl: info?.avatarUrl ?? null }, { status: 201 });
}

// Admin moderation: pin/unpin a comment (reply).
// Body: { replyId, pinned }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminUser())) {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  const { id } = await params;
  const threadId = Number(id);
  if (!Number.isInteger(threadId)) {
    return NextResponse.json({ error: "Invalid thread id" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const replyId = parseReplyId(body?.replyId);
  if (!replyId) {
    return NextResponse.json({ error: "replyId is required" }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  // Scope by threadId too — the reply must belong to THIS thread's URL.
  const rows = await db
    .update(forumReplies)
    .set({ pinned: Boolean(body.pinned) })
    .where(and(eq(forumReplies.id, replyId), eq(forumReplies.threadId, threadId)))
    .returning();
  if (rows.length === 0) {
    return NextResponse.json({ error: "Reply not found" }, { status: 404 });
  }

  const avatars = await resolveAuthorAvatars([rows[0]]);
  const info = avatarInfoFor(avatars, rows[0]);
  return NextResponse.json({ ...rows[0], avatarUrl: info?.avatarUrl ?? null });
}

// Delete a reply. Admins can delete any reply in this thread; members can
// delete their own. Body: { replyId }
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const { id } = await params;
  const threadId = Number(id);
  if (!Number.isInteger(threadId)) {
    return NextResponse.json({ error: "Invalid thread id" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const replyId = parseReplyId(body?.replyId);
  if (!replyId) {
    return NextResponse.json({ error: "replyId is required" }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  // Ownership check, scoped to this thread's URL.
  const [reply] = await db
    .select({ authorId: forumReplies.authorId })
    .from(forumReplies)
    .where(and(eq(forumReplies.id, replyId), eq(forumReplies.threadId, threadId)))
    .limit(1);
  const isOwner = reply?.authorId === user.id && reply.authorId !== "";
  if (!isOwner && !(await isAdminUser())) {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }
  if (!reply) {
    return NextResponse.json({ error: "Reply not found" }, { status: 404 });
  }

  const rows = await db
    .delete(forumReplies)
    .where(and(eq(forumReplies.id, replyId), eq(forumReplies.threadId, threadId)))
    .returning();
  if (rows.length === 0) {
    return NextResponse.json({ error: "Reply not found" }, { status: 404 });
  }

  // Atomic decrement with a 0 floor — the read-then-write form could lose
  // updates when two deletes race (both read 5, both write 4).
  await db
    .update(forumThreads)
    .set({ replies: sql`GREATEST(${forumThreads.replies} - 1, 0)` })
    .where(eq(forumThreads.id, threadId));

  return NextResponse.json({ ok: true });
}
