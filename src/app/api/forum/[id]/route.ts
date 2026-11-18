import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { forumReplies, forumThreads } from "@/lib/schema";
import { getSessionUser } from "@/lib/auth";
import { accountGate, ACCOUNT_DB_ERROR_MESSAGE, requireAdminAccount } from "@/lib/accounts";
import { logAudit } from "@/lib/audit";
import { isRateLimited, rateLimitIp } from "@/lib/rate-limit";
import { avatarInfoFor, resolveAuthorAvatars } from "@/lib/forum-avatars";
import { serializePoll } from "@/lib/polls";
import { publicRow } from "@/lib/public-row";
import { parseBodyId, parseRouteId } from "@/lib/route-ids";
import { deleteImagesByUrl, extractStorageUrls } from "@/lib/storage";
import { shouldCountView } from "@/lib/view-counter";
import { markdownExcerpt } from "@/lib/excerpt";
import { mentionRecipients, notify, notifyMany } from "@/lib/notifications";
import type { Account } from "@/types";

export const dynamic = "force-dynamic";

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

  // A pooler blip must answer 503 JSON like the list routes, not escape as
  // Next's generic HTML 500 (clients read that as "the server rejected you").
  try {
    const [threads, replies, user] = await Promise.all([
      db.select().from(forumThreads).where(eq(forumThreads.id, threadId)).limit(1),
      db
        .select()
        .from(forumReplies)
        .where(eq(forumReplies.threadId, threadId))
        .orderBy(desc(forumReplies.pinned), asc(forumReplies.createdAt)),
      getSessionUser(),
    ]);
    if (!threads[0]) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    // Viewed by session user id or client IP (signed-out readers count too).
    // rateLimitIp takes the LAST x-forwarded-for entry — the one our own edge
    // appended. The first entry is client-controlled, so deduping on it let
    // anyone inflate views by rotating a fake header value per request.
    const viewer = user?.id ?? rateLimitIp(request);
    let thread = threads[0];
    const countView = shouldCountView("forum", threadId, viewer);

    const [bumpedRows, avatars, poll] = await Promise.all([
      countView
        ? db
            .update(forumThreads)
            .set({ views: sql`${forumThreads.views} + 1` })
            .where(eq(forumThreads.id, threadId))
            .returning({ views: forumThreads.views })
        : Promise.resolve(null),
      resolveAuthorAvatars([thread, ...replies]).catch(
        () => new Map<string, { avatarUrl: string | null; color: string }>()
      ),
      serializePoll(db, threadId, user?.id ?? null).catch(() => null),
    ]);
    if (bumpedRows?.[0]) thread = { ...thread, views: bumpedRows[0].views };

    const enrich = (row: { authorId?: string | null; author?: string | null; color: string }) => {
      const info = avatarInfoFor(avatars, row);
      return { avatarUrl: info?.avatarUrl ?? null, color: info?.color ?? row.color };
    };

    // `liked` is derived per viewer; raw liker ids stay server-side.
    const likedOf = (row: { likedBy?: unknown }) =>
      user ? ((row.likedBy as string[] | null) ?? []).includes(user.id) : false;

    return NextResponse.json({
      thread: { ...publicRow(thread), ...enrich(thread), liked: likedOf(thread), hasPoll: poll !== null },
      replies: replies.map((r) => ({ ...publicRow(r), ...enrich(r), liked: likedOf(r) })),
      poll,
    });
  } catch (err) {
    console.error("api/forum/[id]: detail query failed", err);
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
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

  const body = await request.json().catch(() => ({}));
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "A reply can't be empty." }, { status: 400 });
  }
  if (content.length > 20000) {
    return NextResponse.json({ error: "Replies can be at most 20,000 characters." }, { status: 400 });
  }

  // Spam guard for members — admins are exempt from rate limits. Checked
  // AFTER validation: an accidental empty submit must not spend one of the
  // ten allowed replies (validation is cheap; the limit guards the write).
  if (
    (account?.role ?? user.role) !== "admin" &&
    isRateLimited(`reply:${user.id}`, 10, 60_000)
  ) {
    return NextResponse.json(
      { error: "You're replying too fast — wait a moment." },
      { status: 429 }
    );
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const username = account?.username ?? user.username;
  // Reply insert + thread counter bump must commit together — otherwise a
  // failure between them permanently drifts the replies count. The
  // existence/locked check runs INSIDE the transaction under a row lock so a
  // concurrent delete or lock can't leave an orphaned reply.
  let outcome:
    | { error: "not_found" | "locked" }
    | { reply: typeof forumReplies.$inferSelect; threadAuthorId: string };
  try {
    outcome = await db.transaction(async (tx) => {
      const [parent] = await tx
        .select({ id: forumThreads.id, locked: forumThreads.locked, authorId: forumThreads.authorId })
        .from(forumThreads)
        .where(eq(forumThreads.id, threadId))
        .limit(1)
        .for("update");
      if (!parent) return { error: "not_found" as const };
      if (parent.locked) return { error: "locked" as const };

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

      // Atomic increment — a plain `replies + 1` read would lose a count when
      // two replies land at once (both read 5, both write 6).
      await tx
        .update(forumThreads)
        .set({ replies: sql`${forumThreads.replies} + 1`, last: new Date().toISOString() })
        .where(eq(forumThreads.id, threadId));

      return { reply: inserted, threadAuthorId: parent.authorId };
    });
  } catch (err) {
    console.error("api/forum/[id] POST: reply failed", err);
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
  if ("error" in outcome) {
    return outcome.error === "locked"
      ? NextResponse.json(
          { error: "This thread is locked — replies are closed." },
          { status: 423 }
        )
      : NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }
  const created = outcome.reply;

  // Notify the thread author and any @mentions. Best-effort: these never block
  // or roll back the reply itself (the helpers swallow their own errors). The
  // thread author is excluded from mentions so they don't get two pings.
  const excerpt = markdownExcerpt(content, 140);
  await notify({
    userId: outcome.threadAuthorId,
    actorId: user.id,
    actorName: username,
    type: "reply",
    threadId,
    replyId: created.id,
    excerpt,
  });
  const mentioned = await mentionRecipients(content, user.id);
  await notifyMany(
    mentioned
      .filter((id) => id !== outcome.threadAuthorId)
      .map((id) => ({
        userId: id,
        actorId: user.id,
        actorName: username,
        type: "mention" as const,
        threadId,
        replyId: created.id,
        excerpt,
      }))
  );

  const avatars = await resolveAuthorAvatars([created]).catch(
    () => new Map<string, { avatarUrl: string | null; color: string }>()
  );
  const info = avatarInfoFor(avatars, created);
  // `color` resolved like GET returns, so the optimistic client append
  // renders the same tile a reload would. A fresh reply starts unliked.
  return NextResponse.json(
    { ...publicRow(created), avatarUrl: info?.avatarUrl ?? null, color: info?.color ?? created.color, liked: false },
    { status: 201 }
  );
}

// Admin moderation: pin/unpin a comment (reply).
// Body: { replyId, pinned }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminGate = await requireAdminAccount();
  if (adminGate.status === "db_error") {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
  if (adminGate.status === "no") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  const { id } = await params;
  const threadId = parseRouteId(id);
  if (threadId === null) {
    return NextResponse.json({ error: "Invalid thread id" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const replyId = parseBodyId(body?.replyId);
  if (!replyId) {
    return NextResponse.json({ error: "replyId is required" }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  // Scope by threadId too — the reply must belong to THIS thread's URL.
  // A real boolean is REQUIRED: an absent `pinned` used to fall through to
  // Boolean(undefined) === false and silently unpin an admin-pinned reply.
  if (typeof body.pinned !== "boolean") {
    return NextResponse.json({ error: "pinned must be a boolean" }, { status: 400 });
  }

  try {
    const rows = await db
      .update(forumReplies)
      .set({ pinned: body.pinned })
      .where(and(eq(forumReplies.id, replyId), eq(forumReplies.threadId, threadId)))
      .returning();
    if (rows.length === 0) {
      return NextResponse.json({ error: "Reply not found" }, { status: 404 });
    }

    await logAudit({
      actorId: adminGate.account.id,
      actorName: adminGate.account.username,
      action: "reply_pin",
      targetId: String(replyId),
      targetName: rows[0].author,
      detail: `${body.pinned ? "pinned" : "unpinned"} reply in thread #${threadId}`,
    });

    const avatars = await resolveAuthorAvatars([rows[0]]).catch(
      () => new Map<string, { avatarUrl: string | null; color: string }>()
    );
    const info = avatarInfoFor(avatars, rows[0]);
    const liked = ((rows[0].likedBy ?? []) as string[]).includes(adminGate.account.id);
    // `color` resolved like GET returns — the client replaces the whole reply
    // object with this, and the raw column default would repaint its tile.
    return NextResponse.json({
      ...publicRow(rows[0]),
      avatarUrl: info?.avatarUrl ?? null,
      color: info?.color ?? rows[0].color,
      liked,
    });
  } catch (err) {
    console.error("api/forum/[id] PATCH: update failed", err);
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
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
  const replyId = parseBodyId(body?.replyId);
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
  // cookie must not keep editing content.
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

  try {
    const [reply] = await db
      .select({ authorId: forumReplies.authorId, content: forumReplies.content })
      .from(forumReplies)
      .where(and(eq(forumReplies.id, replyId), eq(forumReplies.threadId, threadId)))
      .limit(1);
    if (!reply) {
      return NextResponse.json({ error: "Reply not found" }, { status: 404 });
    }
    const isOwner = reply.authorId === user.id && reply.authorId !== "";
    let adminAccount: Account | null = null;
    if (!isOwner) {
      const adminGate = await requireAdminAccount();
      if (adminGate.status === "db_error") {
        return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
      }
      if (adminGate.status === "no") {
        return NextResponse.json({ error: "You can only edit your own replies." }, { status: 403 });
      }
      adminAccount = adminGate.account;
    }

    // Same embed GC as the thread edit: removed images are collected and
    // deleted after a successful update (best-effort, never breaks the edit).
    const newEmbeds = new Set(extractStorageUrls(content));
    const removedEmbeds = extractStorageUrls(reply.content).filter((url) => !newEmbeds.has(url));

    const rows = await db
      .update(forumReplies)
      .set({ content, editedAt: new Date() })
      .where(and(eq(forumReplies.id, replyId), eq(forumReplies.threadId, threadId)))
      .returning();
    if (rows.length === 0) {
      return NextResponse.json({ error: "Reply not found" }, { status: 404 });
    }
    if (removedEmbeds.length > 0) {
      await deleteImagesByUrl(removedEmbeds, { id: user.id, isAdmin: !isOwner });
    }
    if (adminAccount) {
      await logAudit({
        actorId: adminAccount.id,
        actorName: adminAccount.username,
        action: "reply_edit",
        targetId: String(replyId),
        targetName: rows[0].author,
        detail: `Edited reply in thread #${threadId}`,
      });
    }
    const avatars = await resolveAuthorAvatars([rows[0]]).catch(
      () => new Map<string, { avatarUrl: string | null; color: string }>()
    );
    const info = avatarInfoFor(avatars, rows[0]);
    const liked = ((rows[0].likedBy ?? []) as string[]).includes(user.id);
    return NextResponse.json({
      ...publicRow(rows[0]),
      avatarUrl: info?.avatarUrl ?? null,
      color: info?.color ?? rows[0].color,
      liked,
    });
  } catch (err) {
    console.error("api/forum/[id] PUT: update failed", err);
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
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
  const replyId = parseBodyId(body?.replyId);
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

  try {
    // Ownership check, scoped to this thread's URL. Content comes along so the
    // delete path can garbage-collect the reply's embedded images.
    const [reply] = await db
      .select({
        authorId: forumReplies.authorId,
        author: forumReplies.author,
        content: forumReplies.content,
      })
      .from(forumReplies)
      .where(and(eq(forumReplies.id, replyId), eq(forumReplies.threadId, threadId)))
      .limit(1);
    if (!reply) {
      return NextResponse.json({ error: "Reply not found" }, { status: 404 });
    }
    const isOwner = reply.authorId === user.id && reply.authorId !== "";
    let adminAccount: Account | null = null;
    if (!isOwner) {
      const adminGate = await requireAdminAccount();
      if (adminGate.status === "db_error") {
        return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
      }
      if (adminGate.status === "no") {
        return NextResponse.json({ error: "Admins only." }, { status: 403 });
      }
      adminAccount = adminGate.account;
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

    // Same best-effort embed GC as the thread-delete path — without it every
    // deleted reply orphaned its uploaded images in the bucket forever.
    const embedUrls = extractStorageUrls(reply.content);
    if (embedUrls.length > 0) {
      await deleteImagesByUrl(embedUrls, { id: user.id, isAdmin: !isOwner });
    }
    if (adminAccount) {
      await logAudit({
        actorId: adminAccount.id,
        actorName: adminAccount.username,
        action: "reply_delete",
        targetId: String(replyId),
        targetName: reply.author,
        detail: `Deleted reply in thread #${threadId}`,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("api/forum/[id] DELETE: delete failed", err);
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
}
