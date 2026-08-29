import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { forumReplies, forumThreads } from "@/lib/schema";
import { getSessionUser } from "@/lib/auth";
import { accountGate, ACCOUNT_DB_ERROR_MESSAGE, checkAdmin } from "@/lib/accounts";
import { isRateLimited, rateLimitIp } from "@/lib/rate-limit";
import { avatarInfoFor, resolveAuthorAvatars } from "@/lib/forum-avatars";
import { serializePoll } from "@/lib/polls";
import { publicRow } from "@/lib/public-row";
import { parseRouteId } from "@/lib/route-ids";
import { shouldCountView } from "@/lib/view-counter";

export const dynamic = "force-dynamic";

/** Parse a reply id from a JSON body, rejecting null/""/0/negatives. */
function parseReplyId(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  return parseRouteId(typeof value === "string" ? value : null);
}

// Thread detail: thread + its replies (pinned comments first, then oldest)
// + its poll (if any). Increments the view counter (deduped per viewer).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const threadId = parseRouteId(id);
  if (threadId === null) {
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

  // Viewed by session user id or client IP (signed-out readers count too).
  // rateLimitIp takes the LAST x-forwarded-for entry — the one our own edge
  // appended. The first entry is client-controlled, so deduping on it let
  // anyone inflate views by rotating a fake header value per request.
  const user = await getSessionUser();
  const viewer = user?.id ?? rateLimitIp(request);
  let thread = threads[0];
  if (shouldCountView("forum", threadId, viewer)) {
    const [bumped] = await db
      .update(forumThreads)
      .set({ views: sql`${forumThreads.views} + 1` })
      .where(eq(forumThreads.id, threadId))
      .returning({ views: forumThreads.views });
    if (bumped) thread = { ...thread, views: bumped.views };
  }

  const replies = await db
    .select()
    .from(forumReplies)
    .where(eq(forumReplies.threadId, threadId))
    .orderBy(desc(forumReplies.pinned), asc(forumReplies.createdAt));

  const avatars = await resolveAuthorAvatars([thread, ...replies]);
  const enrich = (row: { authorId?: string | null; author?: string | null; color: string }) => {
    const info = avatarInfoFor(avatars, row);
    return { avatarUrl: info?.avatarUrl ?? null, color: info?.color ?? row.color };
  };

  const poll = await serializePoll(db, threadId, user?.id ?? null).catch(() => null);

  // `liked` is derived per viewer; raw liker ids stay server-side.
  const likedOf = (row: { likedBy?: unknown }) =>
    user ? ((row.likedBy as string[] | null) ?? []).includes(user.id) : false;

  return NextResponse.json({
    thread: { ...publicRow(thread), ...enrich(thread), liked: likedOf(thread), hasPoll: poll !== null },
    replies: replies.map((r) => ({ ...publicRow(r), ...enrich(r), liked: likedOf(r) })),
    poll,
  });
}

// Reply to a thread (must be signed in; thread must not be locked).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in to reply." }, { status: 401 });
  }

  const { id } = await params;
  const threadId = parseRouteId(id);
  if (threadId === null) {
    return NextResponse.json({ error: "Invalid thread id" }, { status: 400 });
  }

  // Live-account gate: removed account → 403, DB outage → 503.
  const gate = await accountGate(user.id);
  if (gate.status === "missing" || gate.status === "banned") {
    return NextResponse.json(
      { error: "Your account no longer exists on this server." },
      { status: 403 }
    );
  }
  if (gate.status === "db_error") {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
  const account = gate.status === "ok" ? gate.account : null;

  // Spam guard for members — admins are exempt from rate limits.
  if (
    (account?.role ?? user.role) !== "admin" &&
    isRateLimited(`reply:${user.id}`, 10, 60_000)
  ) {
    return NextResponse.json(
      { error: "You're replying too fast — wait a moment." },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "A reply can't be empty." }, { status: 400 });
  }
  if (content.length > 20000) {
    return NextResponse.json({ error: "Replies can be at most 20,000 characters." }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const threads = await db
    .select({ id: forumThreads.id, locked: forumThreads.locked })
    .from(forumThreads)
    .where(eq(forumThreads.id, threadId))
    .limit(1);
  if (threads.length === 0) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }
  if (threads[0].locked) {
    return NextResponse.json(
      { error: "This thread is locked — replies are closed." },
      { status: 423 }
    );
  }

  const username = account?.username ?? user.username;
  // Reply insert + thread counter bump must commit together — otherwise a
  // failure between them permanently drifts the replies count.
  const reply = await db.transaction(async (tx) => {
    const [inserted] = await tx
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
    await tx
      .update(forumThreads)
      .set({ replies: sql`${forumThreads.replies} + 1`, last: new Date().toISOString() })
      .where(eq(forumThreads.id, threadId));

    return inserted;
  });

  const avatars = await resolveAuthorAvatars([reply]);
  const info = avatarInfoFor(avatars, reply);
  // `color` resolved like GET returns, so the optimistic client append
  // renders the same tile a reload would. A fresh reply starts unliked.
  return NextResponse.json(
    { ...publicRow(reply), avatarUrl: info?.avatarUrl ?? null, color: info?.color ?? reply.color, liked: false },
    { status: 201 }
  );
}

// Admin moderation: pin/unpin a comment (reply).
// Body: { replyId, pinned }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Read the session once: checkAdmin() answers the authorization question,
  // but the response body also needs the viewer's id to derive `liked`.
  const viewer = await getSessionUser();
  const adminVerdict = await checkAdmin();
  if (adminVerdict === "db_error") {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
  if (adminVerdict === "no") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  const { id } = await params;
  const threadId = parseRouteId(id);
  if (threadId === null) {
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
  const liked = viewer ? ((rows[0].likedBy ?? []) as string[]).includes(viewer.id) : false;
  // `color` resolved like GET returns — the client replaces the whole reply
  // object with this, and the raw column default would repaint its tile.
  return NextResponse.json({
    ...publicRow(rows[0]),
    avatarUrl: info?.avatarUrl ?? null,
    color: info?.color ?? rows[0].color,
    liked,
  });
}

// Edit a reply. The author can edit their own; admins can edit any.
// Body: { replyId, content }
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const { id } = await params;
  const threadId = parseRouteId(id);
  if (threadId === null) {
    return NextResponse.json({ error: "Invalid thread id" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const replyId = parseReplyId(body?.replyId);
  if (!replyId) {
    return NextResponse.json({ error: "replyId is required" }, { status: 400 });
  }
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "A reply can't be empty." }, { status: 400 });
  }
  if (content.length > 20000) {
    return NextResponse.json({ error: "Replies can be at most 20,000 characters." }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  // Live-account gate for the OWNER path: a removed member's unexpired
  // cookie must not keep editing content. (The admin path below calls
  // checkAdmin(), which re-reads the DB and rejects banned accounts.)
  const gate = await accountGate(user.id);
  if (gate.status === "missing" || gate.status === "banned") {
    return NextResponse.json(
      { error: "Your account no longer exists on this server." },
      { status: 403 }
    );
  }
  if (gate.status === "db_error") {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }

  const [reply] = await db
    .select({ authorId: forumReplies.authorId })
    .from(forumReplies)
    .where(and(eq(forumReplies.id, replyId), eq(forumReplies.threadId, threadId)))
    .limit(1);
  if (!reply) {
    return NextResponse.json({ error: "Reply not found" }, { status: 404 });
  }
  const isOwner = reply.authorId === user.id && reply.authorId !== "";
  if (!isOwner) {
    const adminVerdict = await checkAdmin();
    if (adminVerdict === "db_error") {
      return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
    }
    if (adminVerdict === "no") {
      return NextResponse.json({ error: "You can only edit your own replies." }, { status: 403 });
    }
  }

  const rows = await db
    .update(forumReplies)
    .set({ content, editedAt: new Date() })
    .where(and(eq(forumReplies.id, replyId), eq(forumReplies.threadId, threadId)))
    .returning();
  if (rows.length === 0) {
    return NextResponse.json({ error: "Reply not found" }, { status: 404 });
  }
  const avatars = await resolveAuthorAvatars([rows[0]]);
  const info = avatarInfoFor(avatars, rows[0]);
  const liked = ((rows[0].likedBy ?? []) as string[]).includes(user.id);
  return NextResponse.json({
    ...publicRow(rows[0]),
    avatarUrl: info?.avatarUrl ?? null,
    color: info?.color ?? rows[0].color,
    liked,
  });
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
  const threadId = parseRouteId(id);
  if (threadId === null) {
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

  // Live-account gate for the OWNER path — same rationale as PUT above.
  const gate = await accountGate(user.id);
  if (gate.status === "missing" || gate.status === "banned") {
    return NextResponse.json(
      { error: "Your account no longer exists on this server." },
      { status: 403 }
    );
  }
  if (gate.status === "db_error") {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }

  // Ownership check, scoped to this thread's URL.
  const [reply] = await db
    .select({ authorId: forumReplies.authorId })
    .from(forumReplies)
    .where(and(eq(forumReplies.id, replyId), eq(forumReplies.threadId, threadId)))
    .limit(1);
  if (!reply) {
    return NextResponse.json({ error: "Reply not found" }, { status: 404 });
  }
  const isOwner = reply.authorId === user.id && reply.authorId !== "";
  if (!isOwner) {
    const adminVerdict = await checkAdmin();
    if (adminVerdict === "db_error") {
      return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
    }
    if (adminVerdict === "no") {
      return NextResponse.json({ error: "Admins only." }, { status: 403 });
    }
  }

  // Delete + counter decrement must commit together — the same rule the
  // reply INSERT path follows. A failure between them permanently drifted
  // the replies count (GREATEST floors at zero; it doesn't reconcile).
  const deleted = await db.transaction(async (tx) => {
    const rows = await tx
      .delete(forumReplies)
      .where(and(eq(forumReplies.id, replyId), eq(forumReplies.threadId, threadId)))
      .returning();
    if (rows.length === 0) return false;

    // Atomic decrement with a 0 floor — the read-then-write form could lose
    // updates when two deletes race (both read 5, both write 4).
    await tx
      .update(forumThreads)
      .set({ replies: sql`GREATEST(${forumThreads.replies} - 1, 0)` })
      .where(eq(forumThreads.id, threadId));
    return true;
  });
  if (!deleted) {
    return NextResponse.json({ error: "Reply not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
