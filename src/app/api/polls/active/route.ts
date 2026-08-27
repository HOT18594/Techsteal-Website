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

  let row: { poll: typeof forumPolls.$inferSelect; threadTitle: string; threadCategory: string } | null;
  try {
    row = await activeRow(db);
  } catch (err) {
    console.error("api/polls/active: query failed", err);
    return NextResponse.json({ poll: null });
  }
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

async function activeRow(
  db: Exclude<ReturnType<typeof getDb>, null>
): Promise<{ poll: typeof forumPolls.$inferSelect; threadTitle: string; threadCategory: string } | null> {
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
  return row ?? null;
}
