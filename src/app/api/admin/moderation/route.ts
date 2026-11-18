import { NextRequest, NextResponse } from "next/server";
import { count, desc, eq, inArray } from "drizzle-orm";
import { ACCOUNT_DB_ERROR_MESSAGE, requireAdminAccount } from "@/lib/accounts";
import { logAudit } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { publicRow } from "@/lib/public-row";
import { parseBodyId } from "@/lib/route-ids";
import {
  forumPolls,
  forumPollVotes,
  forumReplies,
  forumThreads,
  galleryComments,
  galleryItems,
} from "@/lib/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdminAccount();
  if (gate.status === "db_error") {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
  if (gate.status === "no") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({
      threads: [],
      gallery: [],
      recentComments: [],
    });
  }

  try {
    const [rawThreads, rawGallery, rawReplies, rawGalleryComments] = await Promise.all([
      db
        .select()
        .from(forumThreads)
        .orderBy(desc(forumThreads.pinned), desc(forumThreads.id))
        .limit(50),
      db
        .select()
        .from(galleryItems)
        .orderBy(desc(galleryItems.featured), desc(galleryItems.id))
        .limit(50),
      db
        .select({
          id: forumReplies.id,
          threadId: forumReplies.threadId,
          parentTitle: forumThreads.title,
          author: forumReplies.author,
          authorId: forumReplies.authorId,
          content: forumReplies.content,
          pinned: forumReplies.pinned,
          createdAt: forumReplies.createdAt,
        })
        .from(forumReplies)
        .leftJoin(forumThreads, eq(forumReplies.threadId, forumThreads.id))
        .orderBy(desc(forumReplies.id))
        .limit(50),
      db
        .select({
          id: galleryComments.id,
          itemId: galleryComments.itemId,
          parentTitle: galleryItems.title,
          author: galleryComments.author,
          authorId: galleryComments.authorId,
          content: galleryComments.content,
          createdAt: galleryComments.createdAt,
        })
        .from(galleryComments)
        .leftJoin(galleryItems, eq(galleryComments.itemId, galleryItems.id))
        .orderBy(desc(galleryComments.id))
        .limit(50),
    ]);

    const threadIds = rawThreads.map((t) => t.id);
    const polls =
      threadIds.length > 0
        ? await db
            .select()
            .from(forumPolls)
            .where(inArray(forumPolls.threadId, threadIds))
        : [];

    const pollIds = polls.map((p) => p.id);
    const voteRows =
      pollIds.length > 0
        ? await db
            .select({ pollId: forumPollVotes.pollId, voteCount: count() })
            .from(forumPollVotes)
            .where(inArray(forumPollVotes.pollId, pollIds))
            .groupBy(forumPollVotes.pollId)
        : [];

    const voteCountByPollId = new Map<number, number>();
    for (const row of voteRows) {
      voteCountByPollId.set(row.pollId, Number(row.voteCount));
    }

    const nowMs = Date.now();
    const pollByThreadId = new Map<
      number,
      {
        pollId: number;
        question: string;
        endsAt: string;
        ended: boolean;
        voteCount: number;
      }
    >();
    for (const p of polls) {
      const endsAtIso = p.endsAt.toISOString();
      pollByThreadId.set(p.threadId, {
        pollId: p.id,
        question: p.question,
        endsAt: endsAtIso,
        ended: p.endsAt.getTime() <= nowMs,
        voteCount: voteCountByPollId.get(p.id) ?? 0,
      });
    }

    const threads = rawThreads.map((t) => ({
      ...publicRow(t),
      poll: pollByThreadId.get(t.id) ?? null,
    }));

    const gallery = rawGallery.map((g) => publicRow(g));

    const mergedComments = [
      ...rawReplies.map((r) => ({
        sortMs: r.createdAt ? r.createdAt.getTime() : 0,
        item: {
          kind: "forum_reply" as const,
          id: r.id,
          parentId: r.threadId,
          parentTitle: r.parentTitle ?? `Thread #${r.threadId}`,
          author: r.author,
          authorId: r.authorId,
          content: r.content,
          pinned: r.pinned,
          createdAt: r.createdAt ? r.createdAt.toISOString() : null,
        },
      })),
      ...rawGalleryComments.map((c) => ({
        sortMs: c.createdAt ? c.createdAt.getTime() : 0,
        item: {
          kind: "gallery_comment" as const,
          id: c.id,
          parentId: c.itemId,
          parentTitle: c.parentTitle ?? `Build #${c.itemId}`,
          author: c.author,
          authorId: c.authorId,
          content: c.content,
          pinned: false,
          createdAt: c.createdAt ? c.createdAt.toISOString() : null,
        },
      })),
    ]
      .sort((a, b) => b.sortMs - a.sortMs || b.item.id - a.item.id)
      .slice(0, 50)
      .map((entry) => entry.item);

    return NextResponse.json({
      threads,
      gallery,
      recentComments: mergedComments,
    });
  } catch (err) {
    console.error("api/admin/moderation GET: query failed", err);
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireAdminAccount();
  if (gate.status === "db_error") {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
  if (gate.status === "no") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }
  const admin = gate.account;

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;
  const action = typeof raw.action === "string" ? raw.action : "";
  const pollId = parseBodyId(raw.pollId);
  if (!pollId) {
    return NextResponse.json({ error: "Valid pollId is required." }, { status: 400 });
  }

  if (action === "end_poll") {
    try {
      const [poll] = await db
        .update(forumPolls)
        .set({ endsAt: new Date() })
        .where(eq(forumPolls.id, pollId))
        .returning();
      if (!poll) {
        return NextResponse.json({ error: "Poll not found." }, { status: 404 });
      }

      await logAudit({
        actorId: admin.id,
        actorName: admin.username,
        action: "poll_end",
        targetId: String(poll.id),
        targetName: poll.question,
        detail: `Thread #${poll.threadId}`,
      });

      return NextResponse.json({ ok: true });
    } catch (err) {
      console.error("api/admin/moderation POST end_poll: failed", err);
      return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
    }
  }

  if (action === "delete_poll") {
    try {
      const deleted = await db.transaction(async (tx) => {
        await tx.delete(forumPollVotes).where(eq(forumPollVotes.pollId, pollId));
        const [removed] = await tx
          .delete(forumPolls)
          .where(eq(forumPolls.id, pollId))
          .returning();
        return removed ?? null;
      });
      if (!deleted) {
        return NextResponse.json({ error: "Poll not found." }, { status: 404 });
      }

      await logAudit({
        actorId: admin.id,
        actorName: admin.username,
        action: "poll_delete",
        targetId: String(deleted.id),
        targetName: deleted.question,
        detail: `Thread #${deleted.threadId}`,
      });

      return NextResponse.json({ ok: true });
    } catch (err) {
      console.error("api/admin/moderation POST delete_poll: failed", err);
      return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
    }
  }

  return NextResponse.json({ error: "Unknown moderation action." }, { status: 400 });
}
