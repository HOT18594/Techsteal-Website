import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { forumReplies } from "@/lib/schema";
import { getSessionUser } from "@/lib/auth";
import { avatarInfoFor, resolveAuthorAvatars } from "@/lib/forum-avatars";

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

  // Locking read + write inside a transaction: two simultaneous "like"
  // clicks used to both read the old likedBy, both append the id, and
  // one vote would silently vanish. `FOR UPDATE` serializes them.
  const updated = await db.transaction(async (tx) => {
    const locked = await tx
      .select()
      .from(forumReplies)
      .where(and(eq(forumReplies.id, replyId), eq(forumReplies.threadId, threadId)))
      .for("update")
      .limit(1);
    if (locked.length === 0) return null;
    const currentLikedBy = (locked[0].likedBy ?? []) as string[];
    const already = currentLikedBy.includes(user.id);
    const updatedLikedBy = already
      ? currentLikedBy.filter((x) => x !== user.id)
      : [...currentLikedBy, user.id];
    const [row] = await tx
      .update(forumReplies)
      .set({ likedBy: updatedLikedBy, likes: updatedLikedBy.length })
      .where(eq(forumReplies.id, replyId))
      .returning();
    return row;
  });
  if (!updated) {
    return NextResponse.json({ error: "Reply not found" }, { status: 404 });
  }

  const avatars = await resolveAuthorAvatars([updated]);
  const info = avatarInfoFor(avatars, updated);
  return NextResponse.json({
    reply: {
      ...updated,
      avatarUrl: info?.avatarUrl ?? null,
    },
    // Derived from the DB's final state — true if the user's id is in it.
    liked: (updated.likedBy ?? []).includes(user.id),
  });
}
