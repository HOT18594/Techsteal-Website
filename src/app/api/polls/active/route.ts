import { NextResponse } from "next/server";
import { desc, eq, gt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { forumPolls, forumThreads } from "@/lib/schema";
import { getSessionUser } from "@/lib/auth";
import { serializePoll } from "@/lib/polls";

export const dynamic = "force-dynamic";

// The most recent poll that hasn't ended yet, with its thread's title so the
// announcement popup can link to the discussion. Signed-in users also get
// their own vote back so the popup can skip polls they already voted in.
export async function GET() {
  const db = getDb();
  if (!db) return NextResponse.json({ poll: null });

  const [row] = await db
    .select({
      poll: forumPolls,
      threadTitle: forumThreads.title,
      threadCategory: forumThreads.category,
    })
    .from(forumPolls)
    .innerJoin(forumThreads, eq(forumPolls.threadId, forumThreads.id))
    .where(gt(forumPolls.endsAt, new Date()))
    .orderBy(desc(forumPolls.id))
    .limit(1);
  if (!row) return NextResponse.json({ poll: null });

  const user = await getSessionUser();
  const poll = await serializePoll(db, row.poll.threadId, user?.id ?? null).catch(() => null);
  if (!poll) return NextResponse.json({ poll: null });

  return NextResponse.json({
    poll: {
      ...poll,
      threadTitle: row.threadTitle,
      threadCategory: row.threadCategory,
    },
  });
}
