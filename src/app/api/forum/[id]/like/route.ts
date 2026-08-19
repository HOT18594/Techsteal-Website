import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { forumReplies } from "@/lib/schema";
import { getSessionUser } from "@/lib/auth";
import { resolveAuthorAvatars } from "@/lib/forum-avatars";

export const dynamic = "force-dynamic";

// Toggle a like on a reply. Signed-in users only; each account can like a
// comment once (removing their id from `likedBy` un-likes it).
// Body: { replyId }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in to like." }, { status: 401 });
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
    .select()
    .from(forumReplies)
    .where(and(eq(forumReplies.id, replyId), eq(forumReplies.threadId, threadId)))
    .limit(1);
  if (rows.length === 0) {
    return NextResponse.json({ error: "Reply not found" }, { status: 404 });
  }

  const reply = rows[0];
  const likedBy = (reply.likedBy ?? []) as string[];
  const liked = likedBy.includes(user.id);
  const next = liked ? likedBy.filter((x) => x !== user.id) : [...likedBy, user.id];

  const [updated] = await db
    .update(forumReplies)
    .set({ likedBy: next, likes: next.length })
    .where(eq(forumReplies.id, replyId))
    .returning();

  const avatars = await resolveAuthorAvatars([updated]);
  return NextResponse.json({
    reply: {
      ...updated,
      avatarUrl: avatars.get(updated.authorId ?? "")?.avatarUrl ?? null,
    },
    liked: !liked,
  });
}
