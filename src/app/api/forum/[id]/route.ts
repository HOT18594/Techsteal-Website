import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { forumReplies, forumThreads } from "@/lib/schema";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Thread detail: thread + its replies.
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
    .orderBy(asc(forumReplies.createdAt));

  return NextResponse.json({ thread: threads[0], replies });
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
      avatar: user.username.slice(0, 1).toUpperCase(),
      color: "avatar-2",
    })
    .returning();

  await db
    .update(forumThreads)
    .set({ replies: threads[0].replies + 1, last: "just now" })
    .where(eq(forumThreads.id, threadId));

  return NextResponse.json(reply, { status: 201 });
}

// Delete a reply (admin only). Body: { replyId }
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") {
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
