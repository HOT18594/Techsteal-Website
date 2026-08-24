// Poll helpers shared by the forum API routes: validation for creation and
// serialization (counts + the signed-in user's vote) for reads.

import { and, count, eq } from "drizzle-orm";
import type { Db } from "./db";
import { forumPolls, forumPollVotes } from "./schema";
import type { ForumPoll } from "@/types";

/** Validate a poll payload from a thread-creation request. */
export function parsePollInput(value: unknown): { question: string; options: string[]; endsAt: Date } | { error: string } {
  if (typeof value !== "object" || value === null) return { error: "Malformed poll." };
  const p = value as { question?: unknown; options?: unknown; endsAt?: unknown };
  const question = typeof p.question === "string" ? p.question.trim() : "";
  if (!question) return { error: "A poll needs a question." };
  if (question.length > 140) return { error: "Poll questions can be at most 140 characters." };

  if (!Array.isArray(p.options)) return { error: "A poll needs options." };
  const options = p.options
    .filter((o): o is string => typeof o === "string")
    .map((o) => o.trim())
    .filter(Boolean);
  if (options.length < 2) return { error: "A poll needs at least two options." };
  if (options.length > 10) return { error: "Polls can have at most ten options." };
  if (options.some((o) => o.length > 80)) {
    return { error: "Poll options can be at most 80 characters." };
  }

  const endsAt = new Date(typeof p.endsAt === "string" ? p.endsAt : "");
  if (Number.isNaN(endsAt.getTime())) return { error: "The poll end date is invalid." };
  if (endsAt.getTime() <= Date.now()) return { error: "The poll end date must be in the future." };
  const maxAhead = Date.now() + 365 * 24 * 60 * 60 * 1000;
  if (endsAt.getTime() > maxAhead) return { error: "Polls can run for at most a year." };

  return { question, options, endsAt };
}

/** Build the option list with stable, collision-free ids. */
export function pollOptionRows(options: string[]): Array<{ id: string; text: string }> {
  return options.map((text, i) => ({ id: `o${i}`, text }));
}

/**
 * Serialize a thread's poll: option list, per-option counts, total, the
 * caller's vote, and whether it has ended. Returns null when the thread has
 * no poll.
 */
export async function serializePoll(
  db: Db,
  threadId: number,
  userId?: string | null
): Promise<ForumPoll | null> {
  const [poll] = await db
    .select()
    .from(forumPolls)
    .where(eq(forumPolls.threadId, threadId))
    .limit(1);
  if (!poll) return null;

  const votes = await db
    .select({ optionId: forumPollVotes.optionId, n: count() })
    .from(forumPollVotes)
    .where(eq(forumPollVotes.pollId, poll.id))
    .groupBy(forumPollVotes.optionId);

  const counts: Record<string, number> = {};
  let totalVotes = 0;
  for (const v of votes) {
    counts[v.optionId] = v.n;
    totalVotes += v.n;
  }

  let myVote: string | null = null;
  if (userId) {
    const [mine] = await db
      .select({ optionId: forumPollVotes.optionId })
      .from(forumPollVotes)
      .where(and(eq(forumPollVotes.pollId, poll.id), eq(forumPollVotes.userId, userId)))
      .limit(1);
    myVote = mine?.optionId ?? null;
  }

  const ended = new Date(poll.endsAt).getTime() <= Date.now();
  // Per-option tallies ship ONLY when results are visible (the viewer has
  // voted or the poll ended) — matching the UI contract. Sending them to
  // everyone let anyone read live standings from the network tab before
  // voting. The participation total stays public either way.
  const resultsVisible = ended || myVote !== null;

  return {
    id: poll.id,
    threadId: poll.threadId,
    question: poll.question,
    options: poll.options ?? [],
    endsAt: new Date(poll.endsAt).toISOString(),
    createdAt: poll.createdAt ? new Date(poll.createdAt).toISOString() : null,
    counts: resultsVisible ? counts : undefined,
    totalVotes,
    myVote,
    ended,
  };
}
