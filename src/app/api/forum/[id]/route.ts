import { NextRequest, NextResponse } from "next/server";
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { forumReplies, forumThreads } from "@/lib/schema";
import { getSessionUser } from "@/lib/auth";
import { isAdminUser } from "@/lib/accounts";
import { avatarInfoFor, resolveAuthorAvatars } from "@/lib/forum-avatars";

export const dynamic = "force-dynamic";

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

  const body = await request.json().catch(() => ({}));
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "A reply can't be empty." }, { status: 400 });
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

  const [reply] = await db
    .insert(forumReplies)
    .values({
      threadId,
      content,
      author: user.username,
      authorId: user.id,
      avatar: user.username.slice(0, 1).toUpperCase(),
      color: "avatar-2",
    })
    .returning();

  await db
    .update(forumThreads)
    .set({ replies: threads[0].replies + 1, last: "just now" })
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
  const replyId = Number(body?.replyId);
  if (!Number.isInteger(replyId)) {
    return NextResponse.json({ error: "replyId is required" }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const rows = await db
    .update(forumReplies)
    .set({ pinned: Boolean(body.pinned) })
    .where(eq(forumReplies.id, replyId))
    .returning();
  if (rows.length === 0) {
    return NextResponse.json({ error: "Reply not found" }, { status: 404 });
  }

  const avatars = await resolveAuthorAvatars([rows[0]]);
  const info = avatarInfoFor(avatars, rows[0]);
  return NextResponse.json({ ...rows[0], avatarUrl: info?.avatarUrl ?? null });
}

// Delete a reply (admin only). Body: { replyId }
export async function DELETE(
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
  const replyId = Number(body?.replyId);
  if (!Number.isInteger(replyId)) {
    return NextResponse.json({ error: "replyId is required" }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const rows = await db
    .delete(forumReplies)
    .where(eq(forumReplies.id, replyId))
    .returning();
  if (rows.length === 0) {
    return NextResponse.json({ error: "Reply not found" }, { status: 404 });
  }

  const threads = await db
    .select()
    .from(forumThreads)
    .where(eq(forumThreads.id, threadId))
    .limit(1);
  if (threads.length > 0) {
    await db
      .update(forumThreads)
      .set({ replies: Math.max(0, threads[0].replies - 1) })
      .where(eq(forumThreads.id, threadId));
  }

  return NextResponse.json({ ok: true });
}
