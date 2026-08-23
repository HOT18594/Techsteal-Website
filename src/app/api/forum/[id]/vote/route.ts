import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { forumPolls, forumPollVotes } from "@/lib/schema";
import { getSessionUser } from "@/lib/auth";
import { accountGate, ACCOUNT_DB_ERROR_MESSAGE } from "@/lib/accounts";
import { isRateLimited } from "@/lib/rate-limit";
import { serializePoll } from "@/lib/polls";

export const dynamic = "force-dynamic";

// Vote on a thread's poll. Body: { optionId }.
// One vote per account — voting again CHANGES the vote (until the poll
// ends). The unique index on (pollId, userId) makes the upsert atomic, so
// double-clicks and racing tabs can't create two votes.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in to vote." }, { status: 401 });
  }

  const { id } = await params;
  const threadId = Number(id);
  if (!Number.isInteger(threadId)) {
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
  // Members are rate limited on vote churn; admins are exempt.
  if (
    (gate.status !== "ok" || gate.account.role !== "admin") &&
    isRateLimited(`vote:${user.id}`, 20, 60_000)
  ) {
    return NextResponse.json({ error: "Too many votes — slow down." }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const optionId = typeof body?.optionId === "string" ? body.optionId : "";
  if (!optionId) {
    return NextResponse.json({ error: "optionId is required" }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const [poll] = await db
    .select()
    .from(forumPolls)
    .where(eq(forumPolls.threadId, threadId))
    .limit(1);
  if (!poll) {
    return NextResponse.json({ error: "This thread has no poll." }, { status: 404 });
  }
  if (new Date(poll.endsAt).getTime() <= Date.now()) {
    return NextResponse.json({ error: "This poll has ended." }, { status: 423 });
  }
  if (!(poll.options ?? []).some((o) => o.id === optionId)) {
    return NextResponse.json({ error: "Unknown poll option." }, { status: 400 });
  }

  await db
    .insert(forumPollVotes)
    .values({ pollId: poll.id, userId: user.id, optionId })
    .onConflictDoUpdate({
      target: [forumPollVotes.pollId, forumPollVotes.userId],
      set: { optionId, createdAt: new Date() },
    });

  const serialized = await serializePoll(db, threadId, user.id);
  return NextResponse.json({ poll: serialized });
}

// Remove the caller's vote (allowed until the poll ends).
export async function DELETE(
  _request: NextRequest,
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
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  // Same banned-account gate as POST — a removed user's unexpired cookie
  // must not keep mutating poll state until the JWT expires.
  const delGate = await accountGate(user.id);
  if (delGate.status === "missing" || delGate.status === "banned") {
    return NextResponse.json(
      { error: "Your account no longer exists on this server." },
      { status: 403 }
    );
  }
  if (delGate.status === "db_error") {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }

  const [poll] = await db
    .select()
    .from(forumPolls)
    .where(eq(forumPolls.threadId, threadId))
    .limit(1);
  if (!poll) {
    return NextResponse.json({ error: "This thread has no poll." }, { status: 404 });
  }
  if (new Date(poll.endsAt).getTime() <= Date.now()) {
    return NextResponse.json({ error: "This poll has ended." }, { status: 423 });
  }
  await db
    .delete(forumPollVotes)
    .where(and(eq(forumPollVotes.pollId, poll.id), eq(forumPollVotes.userId, user.id)));
  const serialized = await serializePoll(db, threadId, user.id);
  return NextResponse.json({ poll: serialized });
}
