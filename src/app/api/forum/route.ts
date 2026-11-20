import { NextRequest, NextResponse } from "next/server";
import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { forumPolls, forumPollVotes, forumReplies, forumThreads } from "@/lib/schema";
import { fallbackThreads } from "@/lib/fallback-data";
import { getSessionUser } from "@/lib/auth";
import { accountGate, ACCOUNT_DB_ERROR_MESSAGE, requireAdminAccount } from "@/lib/accounts";
import { logAudit } from "@/lib/audit";
import { isRateLimited } from "@/lib/rate-limit";
import { avatarInfoFor, resolveAuthorAvatars } from "@/lib/forum-avatars";
import { CATEGORY_LIST } from "@/lib/forum-categories";
import { parsePollInput, pollOptionRows } from "@/lib/polls";
import { publicRow } from "@/lib/public-row";
import { parseBodyId } from "@/lib/route-ids";
import { escapeLike, markdownExcerpt } from "@/lib/excerpt";
import { mentionRecipients, notifyMany } from "@/lib/notifications";
import { deleteImagesByUrl, extractStorageUrls } from "@/lib/storage";
import type { Account } from "@/types";

export const dynamic = "force-dynamic";

// The client renders the same list from lib/forum-categories — two copies had
// already drifted into different orders, and a category the client offered but
// this list didn't know silently fell back to "General".
const CATEGORIES: readonly string[] = CATEGORY_LIST;
const SORTS = ["new", "top", "hot", "views"] as const;
const PER_PAGE = 15;

export interface ForumListResponse {
  threads: ReturnType<typeof serializeThread>[];
  total: number;
  page: number;
  perPage: number;
  hasMore: boolean;
  categoryCounts: Record<string, number>;
}

type ThreadListRow = Omit<typeof forumThreads.$inferSelect, "likedBy">;

const THREAD_LIST_COLUMNS = {
  id: forumThreads.id,
  title: forumThreads.title,
  content: forumThreads.content,
  author: forumThreads.author,
  authorId: forumThreads.authorId,
  avatar: forumThreads.avatar,
  color: forumThreads.color,
  category: forumThreads.category,
  tagClass: forumThreads.tagClass,
  replies: forumThreads.replies,
  last: forumThreads.last,
  pinned: forumThreads.pinned,
  views: forumThreads.views,
  locked: forumThreads.locked,
  likes: forumThreads.likes,
  editedAt: forumThreads.editedAt,
  createdAt: forumThreads.createdAt,
};

function serializeThread(row: ThreadListRow, avatarUrl: string | null, hasPoll: boolean, color: string) {
  // `color` is the resolved per-account tile color so the list renders the
  // same avatar a thread's detail page does (rows store only a default).
  // likedBy (account ids) stays server-side.
  return { ...publicRow(row), avatarUrl, hasPoll, color };
}

// List threads — pinned first, then by the requested sort. Supports
// server-side search (?q=), category filter, pagination and an unanswered
// filter, so the forum stays fast as threads pile up.
export async function GET(request: NextRequest) {
  // A pooler blip must not 500 the whole listing — degrade to the same
  // fallback data the no-database branch serves, keeping the site readable.
  try {
    return await listThreads(request);
  } catch (err) {
    console.error("api/forum: list query failed", err);
    return NextResponse.json(fallbackThreads);
  }
}

async function listThreads(request: NextRequest): Promise<NextResponse> {
  const db = getDb();
  if (!db) return NextResponse.json(fallbackThreads);

  const params = request.nextUrl.searchParams;
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const sort = (SORTS as readonly string[]).includes(params.get("sort") ?? "")
    ? (params.get("sort") as (typeof SORTS)[number])
    : "new";
  const q = (params.get("q") ?? "").trim().slice(0, 80);
  const category = params.get("category");
  const unanswered = params.get("unanswered") === "1";

  // Base filters apply to both the list and the sidebar category counts —
  // otherwise a search would show "All 2" next to global per-category
  // totals, making a category click look like it ADDS threads.
  const baseFilters = [];
  if (q) {
    const like = `%${escapeLike(q)}%`;
    baseFilters.push(
      or(ilike(forumThreads.title, like), ilike(forumThreads.content, like), ilike(forumThreads.author, like))
    );
  }
  if (unanswered) baseFilters.push(eq(forumThreads.replies, 0));

  const filters = [...baseFilters];
  if (category && CATEGORIES.includes(category)) {
    filters.push(eq(forumThreads.category, category));
  }
  const where = filters.length > 0 ? and(...filters) : undefined;
  const countWhere = baseFilters.length > 0 ? and(...baseFilters) : undefined;

  // Sorting: pinned always floats to the top; within that, the chosen order.
  const orderBy = [desc(forumThreads.pinned)];
  if (sort === "top") {
    orderBy.push(desc(forumThreads.likes), desc(forumThreads.replies), desc(forumThreads.createdAt));
  } else if (sort === "hot") {
    orderBy.push(
      desc(sql`${forumThreads.replies} * 2 + ${forumThreads.likes}`),
      desc(forumThreads.createdAt)
    );
  } else if (sort === "views") {
    orderBy.push(desc(forumThreads.views), desc(forumThreads.createdAt));
  } else {
    orderBy.push(desc(forumThreads.createdAt));
  }

  const [totals, categoryRows] = await Promise.all([
    db.select({ n: count() }).from(forumThreads).where(where),
    db
      .select({ category: forumThreads.category, n: count() })
      .from(forumThreads)
      .where(countWhere)
      .groupBy(forumThreads.category),
  ]);
  const total = totals[0]?.n ?? 0;
  const categoryCounts: Record<string, number> = {};
  for (const c of categoryRows) categoryCounts[c.category] = c.n;

  if (total === 0) {
    return NextResponse.json({
      threads: [],
      total: 0,
      page: 1,
      perPage: PER_PAGE,
      hasMore: false,
      categoryCounts,
    });
  }

  // Clamp to the last available page (e.g. threads deleted while a reader
  // sits on page 5) so the client's "the server clamps" assumption holds.
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const safePage = Math.min(page, totalPages);

  const rows = await db
    .select(THREAD_LIST_COLUMNS)
    .from(forumThreads)
    .where(where)
    .orderBy(...orderBy)
    .limit(PER_PAGE)
    .offset((safePage - 1) * PER_PAGE);

  // One poll-existence query + one avatar lookup in parallel for the page.
  const threadIds = rows.map((r) => r.id);
  const [pollRows, avatars] = await Promise.all([
    threadIds.length > 0
      ? db
          .select({ threadId: forumPolls.threadId })
          .from(forumPolls)
          .where(inArray(forumPolls.threadId, threadIds))
      : Promise.resolve([]),
    resolveAuthorAvatars(rows).catch(
      () => new Map<string, { avatarUrl: string | null; color: string }>()
    ),
  ]);
  const pollThreadIds = new Set(pollRows.map((p) => p.threadId));

  return NextResponse.json({
    threads: rows.map((row) => {
      const info = avatarInfoFor(avatars, row);
      return serializeThread(row, info?.avatarUrl ?? null, pollThreadIds.has(row.id), info?.color ?? row.color);
    }),
    total,
    page: safePage,
    perPage: PER_PAGE,
    hasMore: safePage * PER_PAGE < total,
    categoryCounts,
  });
}

// Create a thread (must be signed in). Admins may attach a poll with an end
// date; the poll is created in the same transaction as the thread.
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in to post." }, { status: 401 });
  }

  // Live-account gate first: removed account → 403, DB outage → 503 (never
  // the old false "account no longer exists" during connection trouble).
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
  if (gate.status === "unconfigured") {
    return NextResponse.json(
      { error: "Posting needs the database — it isn't configured yet." },
      { status: 503 }
    );
  }
  const account = gate.account;

  const body = (await request.json().catch(() => ({}))) ?? {};
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  let category = typeof body.category === "string" ? body.category : "General";
  if (!CATEGORIES.includes(category)) category = "General";

  if (!title) {
    return NextResponse.json({ error: "A title is required." }, { status: 400 });
  }
  if (title.length > 120) {
    return NextResponse.json({ error: "Titles can be at most 120 characters." }, { status: 400 });
  }
  if (content.length > 20000) {
    return NextResponse.json({ error: "Posts can be at most 20,000 characters." }, { status: 400 });
  }

  // Spam guard for members — admins are exempt from rate limits. Checked
  // AFTER validation: a fumbled empty title must not consume one of the
  // five allowed posts (validation is cheap; the limit guards the write).
  if (account.role !== "admin" && isRateLimited(`forum:${user.id}`, 5, 60_000)) {
    return NextResponse.json(
      { error: "You're posting too fast — wait a moment." },
      { status: 429 }
    );
  }

  // Polls are admin-only — validated up front so the transaction can't
  // half-commit a thread the admin didn't mean to create.
  let pollInput: { question: string; options: string[]; endsAt: Date } | null = null;
  if (body.poll !== undefined && body.poll !== null) {
    if (account.role !== "admin") {
      return NextResponse.json({ error: "Only admins can start polls." }, { status: 403 });
    }
    const parsed = parsePollInput(body.poll);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    pollInput = parsed;
  }

  // Author name comes from the live account, not the (up to 7-day-old)
  // session cookie, so renamed users post under their current name.
  const username = account.username;
  const now = new Date();

  // `gate.status === "ok"` above already proved the database is configured;
  // keep the narrowing explicit instead of a non-null assertion.
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  let created;
  try {
    created = await db.transaction(async (tx) => {
      const [thread] = await tx
        .insert(forumThreads)
        .values({
          title,
          content,
          author: username,
          authorId: user.id,
          category,
          avatar: username.slice(0, 1).toUpperCase(),
          tagClass: "tag-accent",
          last: now.toISOString(),
          createdAt: now,
        })
        .returning();
      if (pollInput) {
        await tx.insert(forumPolls).values({
          threadId: thread.id,
          question: pollInput.question,
          options: pollOptionRows(pollInput.options),
          endsAt: pollInput.endsAt,
          createdAt: now,
        });
      }
      return thread;
    });
  } catch (err) {
    // A pooler blip here used to escape as Next's generic 500 and the composer
    // showed "The server rejected the request." — a 503 is truthful and tells
    // the client this is worth retrying.
    console.error("api/forum POST: insert failed", err);
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }

  if (content) {
    const mentioned = await mentionRecipients(content, user.id);
    await notifyMany(
      mentioned.map((id) => ({
        userId: id,
        actorId: user.id,
        actorName: username,
        type: "mention" as const,
        threadId: created.id,
        excerpt: markdownExcerpt(content, 140),
      }))
    );
  }

  const avatars = await resolveAuthorAvatars([created]).catch(
    () => new Map<string, { avatarUrl: string | null; color: string }>()
  );
  const info = avatarInfoFor(avatars, created);
  return NextResponse.json(
    {
      ...publicRow(created),
      avatarUrl: info?.avatarUrl ?? null,
      color: info?.color ?? created.color,
      hasPoll: pollInput !== null,
    },
    { status: 201 }
  );
}

// Edit a thread (title/content). The author can edit their own post; admins
// can edit anything. Sets editedAt so readers see it was changed.
// Body: { id, title?, content }
export async function PUT(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) ?? {};
  const id = parseBodyId(body?.id);
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const title = typeof body.title === "string" ? body.title.trim() : undefined;
  const content = typeof body.content === "string" ? body.content.trim() : undefined;
  if (title === undefined && content === undefined) {
    return NextResponse.json({ error: "Nothing to edit." }, { status: 400 });
  }
  if (title !== undefined && !title) {
    return NextResponse.json({ error: "A title is required." }, { status: 400 });
  }
  if (title !== undefined && title.length > 120) {
    return NextResponse.json({ error: "Titles can be at most 120 characters." }, { status: 400 });
  }
  if (content !== undefined && content.length > 20000) {
    return NextResponse.json({ error: "Posts can be at most 20,000 characters." }, { status: 400 });
  }

  const db = getDb();
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

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
    const [thread] = await db
      .select({ authorId: forumThreads.authorId, content: forumThreads.content })
      .from(forumThreads)
      .where(eq(forumThreads.id, id))
      .limit(1);
    if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    const isOwner = thread.authorId === user.id && thread.authorId !== "";
    let adminAccount: Account | null = null;
    if (!isOwner) {
      const adminGate = await requireAdminAccount();
      if (adminGate.status === "db_error") {
        return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
      }
      if (adminGate.status === "no") {
        return NextResponse.json({ error: "You can only edit your own posts." }, { status: 403 });
      }
      adminAccount = adminGate.account;
    }

    // Editing the body can drop embedded images. Collect old embeds that are
    // no longer in the new text so they get garbage-collected like the delete
    // path does — without this, every edit leaked its removed uploads in the
    // bucket forever.
    const newEmbeds = content !== undefined ? new Set(extractStorageUrls(content)) : null;
    const removedEmbeds =
      newEmbeds === null
        ? []
        : extractStorageUrls(thread.content).filter((url) => !newEmbeds.has(url));

    const rows = await db
      .update(forumThreads)
      .set({
        ...(title !== undefined ? { title } : {}),
        ...(content !== undefined ? { content } : {}),
        editedAt: new Date(),
      })
      .where(eq(forumThreads.id, id))
      .returning();
    // The existence check above raced a concurrent delete: an empty update
    // result means the row vanished — answer 404, not `publicRow(undefined)`.
    if (rows.length === 0) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }
    if (removedEmbeds.length > 0) {
      await deleteImagesByUrl(removedEmbeds, { id: user.id, isAdmin: !isOwner });
    }
    if (adminAccount) {
      await logAudit({
        actorId: adminAccount.id,
        actorName: adminAccount.username,
        action: "thread_edit",
        targetId: String(id),
        targetName: rows[0].title,
        detail: `Edited thread by ${rows[0].author}`,
      });
    }
    return NextResponse.json(publicRow(rows[0]));
  } catch (err) {
    console.error("api/forum PUT: update failed", err);
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
}

// Admin moderation: pin/unpin or lock/unlock a thread.
// Body: { id, pinned? , locked? }
export async function PATCH(request: NextRequest) {
  const adminGate = await requireAdminAccount();
  if (adminGate.status === "db_error") {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
  if (adminGate.status === "no") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) ?? {};
  const id = parseBodyId(body?.id);
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const patch: { pinned?: boolean; locked?: boolean } = {};
  // Only real booleans are accepted — Boolean("false") is `true`, so a
  // stringified body would pin/unpin the opposite of what was sent.
  if (body.pinned !== undefined) {
    if (typeof body.pinned !== "boolean") {
      return NextResponse.json({ error: "pinned must be a boolean" }, { status: 400 });
    }
    patch.pinned = body.pinned;
  }
  if (body.locked !== undefined) {
    if (typeof body.locked !== "boolean") {
      return NextResponse.json({ error: "locked must be a boolean" }, { status: 400 });
    }
    patch.locked = body.locked;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  try {
    const rows = await db
      .update(forumThreads)
      .set(patch)
      .where(eq(forumThreads.id, id))
      .returning();
    if (rows.length === 0) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }
    if (patch.pinned !== undefined) {
      await logAudit({
        actorId: adminGate.account.id,
        actorName: adminGate.account.username,
        action: "thread_pin",
        targetId: String(id),
        targetName: rows[0].title,
        detail: patch.pinned ? "pinned" : "unpinned",
      });
    }
    if (patch.locked !== undefined) {
      await logAudit({
        actorId: adminGate.account.id,
        actorName: adminGate.account.username,
        action: "thread_lock",
        targetId: String(id),
        targetName: rows[0].title,
        detail: patch.locked ? "locked" : "unlocked",
      });
    }
    return NextResponse.json(publicRow(rows[0]));
  } catch (err) {
    console.error("api/forum PATCH: update failed", err);
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
}

// Delete a thread. Admins can delete anything; members can delete their
// own threads (the schema has authorId for exactly this).
export async function DELETE(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) ?? {};
  const id = parseBodyId(body?.id);
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
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
    const [thread] = await db
      .select({ authorId: forumThreads.authorId })
      .from(forumThreads)
      .where(eq(forumThreads.id, id))
      .limit(1);
    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }
    const isOwner = thread.authorId === user.id && thread.authorId !== "";
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

    // Atomic cascade: thread, replies, poll and votes go together — a
    // mid-failure must not orphan replies/polls pointing at a dead thread.
    const deleted = await db.transaction(async (tx) => {
      const rows = await tx.delete(forumThreads).where(eq(forumThreads.id, id)).returning();
      if (rows.length === 0) return null;
      // Collect embed URLs as the cascade wipes replies — the content is
      // needed below to garbage-collect the bucket.
      const replyContents = await tx
        .delete(forumReplies)
        .where(eq(forumReplies.threadId, id))
        .returning({ content: forumReplies.content });
      const polls = await tx
        .select({ id: forumPolls.id })
        .from(forumPolls)
        .where(eq(forumPolls.threadId, id));
      for (const p of polls) {
        await tx.delete(forumPollVotes).where(eq(forumPollVotes.pollId, p.id));
      }
      await tx.delete(forumPolls).where(eq(forumPolls.threadId, id));
      return {
        threadTitle: rows[0].title,
        threadAuthor: rows[0].author,
        threadContent: rows[0].content,
        replyContents,
      };
    });
    if (!deleted) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }
    // Free the bucket: forum embeds live inline in post/reply text, so unlike
    // gallery posts (which track their images in columns) deleting the rows
    // used to orphan every uploaded image forever. Best-effort, like gallery.
    const embedUrls = [
      ...extractStorageUrls(deleted.threadContent ?? ""),
      ...deleted.replyContents.flatMap((r) => extractStorageUrls(r.content ?? "")),
    ];
    if (embedUrls.length > 0) {
      await deleteImagesByUrl(embedUrls, { id: user.id, isAdmin: !isOwner });
    }
    if (adminAccount) {
      await logAudit({
        actorId: adminAccount.id,
        actorName: adminAccount.username,
        action: "thread_delete",
        targetId: String(id),
        targetName: deleted.threadTitle,
        detail: `Deleted thread by ${deleted.threadAuthor}`,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("api/forum DELETE: delete failed", err);
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
}
