import { NextRequest, NextResponse } from "next/server";
import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { forumPolls, forumPollVotes, forumReplies, forumThreads } from "@/lib/schema";
import { fallbackThreads } from "@/lib/fallback-data";
import { getSessionUser } from "@/lib/auth";
import { accountGate, ACCOUNT_DB_ERROR_MESSAGE, checkAdmin } from "@/lib/accounts";
import { isRateLimited } from "@/lib/rate-limit";
import { avatarInfoFor, resolveAuthorAvatars } from "@/lib/forum-avatars";
import { CATEGORY_LIST } from "@/lib/forum-categories";
import { parsePollInput, pollOptionRows } from "@/lib/polls";
import { publicRow } from "@/lib/public-row";
import { parseRouteId } from "@/lib/route-ids";

export const dynamic = "force-dynamic";

// The client renders the same list from lib/forum-categories — two copies had
// already drifted into different orders, and a category the client offered but
// this list didn't know silently fell back to "General".
const CATEGORIES: readonly string[] = CATEGORY_LIST;
const SORTS = ["new", "top", "hot", "views"] as const;
const PER_PAGE = 15;

/** Parse a thread/reply id from a JSON body, rejecting null/""/0/negatives. */
function parseId(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  return parseRouteId(typeof value === "string" ? value : null);
}

/** Escape LIKE wildcards so user input can't match everything. */
function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export interface ForumListResponse {
  threads: ReturnType<typeof serializeThread>[];
  total: number;
  page: number;
  perPage: number;
  hasMore: boolean;
  categoryCounts: Record<string, number>;
}

type ThreadRow = typeof forumThreads.$inferSelect;

function serializeThread(row: ThreadRow, avatarUrl: string | null, hasPoll: boolean, color: string) {
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

  // Clamp to the last available page (e.g. threads deleted while a reader
  // sits on page 5) so the client's "the server clamps" assumption holds.
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const safePage = Math.min(page, totalPages);

  const rows = await db
    .select()
    .from(forumThreads)
    .where(where)
    .orderBy(...orderBy)
    .limit(PER_PAGE)
    .offset((safePage - 1) * PER_PAGE);

  // One poll-existence query for the whole page.
  const threadIds = rows.map((r) => r.id);
  const pollRows =
    threadIds.length > 0
      ? await db
          .select({ threadId: forumPolls.threadId })
          .from(forumPolls)
          .where(inArray(forumPolls.threadId, threadIds))
      : [];
  const pollThreadIds = new Set(pollRows.map((p) => p.threadId));

  const avatars = await resolveAuthorAvatars(rows);

  const categoryCounts: Record<string, number> = {};
  for (const c of categoryRows) categoryCounts[c.category] = c.n;

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
  // Spam guard for members — admins are exempt from rate limits.
  if (account.role !== "admin" && isRateLimited(`forum:${user.id}`, 5, 60_000)) {
    return NextResponse.json(
      { error: "You're posting too fast — wait a moment." },
      { status: 429 }
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
  if (title.length > 120) {
    return NextResponse.json({ error: "Titles can be at most 120 characters." }, { status: 400 });
  }
  if (content.length > 20000) {
    return NextResponse.json({ error: "Posts can be at most 20,000 characters." }, { status: 400 });
  }

  // Polls are admin-only — validated up front so the transaction can't
  // half-commit a thread the admin didn't mean to create. An outage is not
  // a demotion: answer 503 rather than telling an admin they aren't one.
  let pollInput: { question: string; options: string[]; endsAt: Date } | null = null;
  if (body.poll !== undefined && body.poll !== null) {
    const adminVerdict = await checkAdmin();
    if (adminVerdict === "db_error") {
      return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
    }
    if (adminVerdict === "no") {
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

  const avatars = await resolveAuthorAvatars([created]);
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

  const body = await request.json().catch(() => ({}));
  const id = parseId(body?.id);
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

  const [thread] = await db
    .select({ authorId: forumThreads.authorId })
    .from(forumThreads)
    .where(eq(forumThreads.id, id))
    .limit(1);
  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  const isOwner = thread.authorId === user.id && thread.authorId !== "";
  if (!isOwner) {
    const adminVerdict = await checkAdmin();
    if (adminVerdict === "db_error") {
      return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
    }
    if (adminVerdict === "no") {
      return NextResponse.json({ error: "You can only edit your own posts." }, { status: 403 });
    }
  }

  const rows = await db
    .update(forumThreads)
    .set({
      ...(title !== undefined ? { title } : {}),
      ...(content !== undefined ? { content } : {}),
      editedAt: new Date(),
    })
    .where(eq(forumThreads.id, id))
    .returning();
  return NextResponse.json(publicRow(rows[0]));
}

// Admin moderation: pin/unpin or lock/unlock a thread.
// Body: { id, pinned? , locked? }
export async function PATCH(request: NextRequest) {
  const adminVerdict = await checkAdmin();
  if (adminVerdict === "db_error") {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
  if (adminVerdict === "no") {
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

  const patch: { pinned?: boolean; locked?: boolean } = {};
  if (body.pinned !== undefined) patch.pinned = Boolean(body.pinned);
  if (body.locked !== undefined) patch.locked = Boolean(body.locked);
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const rows = await db
    .update(forumThreads)
    .set(patch)
    .where(eq(forumThreads.id, id))
    .returning();
  if (rows.length === 0) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }
  return NextResponse.json(publicRow(rows[0]));
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

  const [thread] = await db
    .select({ authorId: forumThreads.authorId })
    .from(forumThreads)
    .where(eq(forumThreads.id, id))
    .limit(1);
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }
  const isOwner = thread.authorId === user.id && thread.authorId !== "";
  if (!isOwner) {
    const adminVerdict = await checkAdmin();
    if (adminVerdict === "db_error") {
      return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
    }
    if (adminVerdict === "no") {
      return NextResponse.json({ error: "Admins only." }, { status: 403 });
    }
  }

  // Atomic cascade: thread, replies, poll and votes go together — a
  // mid-failure must not orphan replies/polls pointing at a dead thread.
  const rows = await db.transaction(async (tx) => {
    const deleted = await tx.delete(forumThreads).where(eq(forumThreads.id, id)).returning();
    if (deleted.length === 0) return null;
    await tx.delete(forumReplies).where(eq(forumReplies.threadId, id));
    const polls = await tx
      .select({ id: forumPolls.id })
      .from(forumPolls)
      .where(eq(forumPolls.threadId, id));
    for (const p of polls) {
      await tx.delete(forumPollVotes).where(eq(forumPollVotes.pollId, p.id));
    }
    await tx.delete(forumPolls).where(eq(forumPolls.threadId, id));
    return deleted;
  });
  if (!rows) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
