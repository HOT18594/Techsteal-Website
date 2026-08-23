import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { forumReplies, forumThreads } from "@/lib/schema";
import { getSessionUser } from "@/lib/auth";
import { findAccount } from "@/lib/accounts";
import { avatarInfoFor, resolveAuthorAvatars } from "@/lib/forum-avatars";

export const dynamic = "force-dynamic";

// Toggle a like. Body: { replyId } likes a REPLY; omitting replyId likes
// the THREAD itself. Signed-in users only; each account can like once
// (sending the request again un-likes).
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
  // A present-but-invalid replyId must not silently become a thread like —
  // reject it so a client bug can't toggle the wrong thing.
  let replyId: number | null = null;
  if (body?.replyId !== undefined && body?.replyId !== null) {
    const parsed = typeof body.replyId === "number" ? body.replyId : Number(body.replyId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return NextResponse.json({ error: "Invalid replyId" }, { status: 400 });
    }
    replyId = parsed;
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  // Same live-account gate as every other write route: a removed (banned)
  // account's cookie may still be unexpired but must not keep voting.
  const account = await findAccount(user.id).catch(() => null);
  if (!account || account.banned) {
    return NextResponse.json({ error: "Your account no longer exists on this server." }, { status: 403 });
  }

  // Locking read + write inside a transaction: two simultaneous "like"
  // clicks used to both read the old likedBy, both append the id, and
  // one vote would silently vanish. `FOR UPDATE` serializes them.
  if (replyId !== null) {
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
      reply: { ...updated, avatarUrl: info?.avatarUrl ?? null },
      // Derived from the DB's final state — true if the user's id is in it.
      liked: (updated.likedBy ?? []).includes(user.id),
    });
  }

  // Thread like.
  const updated = await db.transaction(async (tx) => {
    const locked = await tx
      .select()
      .from(forumThreads)
      .where(eq(forumThreads.id, threadId))
      .for("update")
      .limit(1);
    if (locked.length === 0) return null;
    const currentLikedBy = (locked[0].likedBy ?? []) as string[];
    const already = currentLikedBy.includes(user.id);
    const updatedLikedBy = already
      ? currentLikedBy.filter((x) => x !== user.id)
      : [...currentLikedBy, user.id];
    const [row] = await tx
      .update(forumThreads)
      .set({ likedBy: updatedLikedBy, likes: updatedLikedBy.length })
      .where(eq(forumThreads.id, threadId))
      .returning();
    return row;
  });
  if (!updated) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  return NextResponse.json({
    thread: { ...updated, hasPoll: undefined },
    liked: (updated.likedBy ?? []).includes(user.id),
  });
}
