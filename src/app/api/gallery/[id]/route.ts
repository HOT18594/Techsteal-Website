import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { galleryComments, galleryItems } from "@/lib/schema";
import { getSessionUser } from "@/lib/auth";
import { accountGate, ACCOUNT_DB_ERROR_MESSAGE, checkAdmin } from "@/lib/accounts";
import { isRateLimited, rateLimitIp } from "@/lib/rate-limit";
import { avatarInfoFor, resolveAuthorAvatars } from "@/lib/forum-avatars";
import { publicRow } from "@/lib/public-row";
import { parseRouteId } from "@/lib/route-ids";
import { shouldCountView } from "@/lib/view-counter";
import { deleteImagesByUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Parse an id from a JSON body, rejecting null/""/0/negatives. */
function parseId(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  return parseRouteId(typeof value === "string" ? value : null);
}

// Gallery item detail: the post + its comments. Bumps the view counter
// (deduped per viewer).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const itemId = parseRouteId(id);
  if (itemId === null) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const items = await db.select().from(galleryItems).where(eq(galleryItems.id, itemId)).limit(1);
  if (items.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  let item = items[0];

  const user = await getSessionUser();
  // rateLimitIp takes the LAST x-forwarded-for entry (our own edge's) —
  // deduping on the client-controlled first entry let anyone inflate views.
  const viewer = user?.id ?? rateLimitIp(request);
  if (shouldCountView("gallery", itemId, viewer)) {
    const [bumped] = await db
      .update(galleryItems)
      .set({ views: sql`${galleryItems.views} + 1` })
      .where(eq(galleryItems.id, itemId))
      .returning({ views: galleryItems.views });
    if (bumped) item = { ...item, views: bumped.views };
  }

  const comments = await db
    .select()
    .from(galleryComments)
    .where(eq(galleryComments.itemId, itemId))
    .orderBy(asc(galleryComments.createdAt));

  // One avatar lookup covers the poster and every commenter.
  const avatars = await resolveAuthorAvatars([item, ...comments]);
  const builderInfo = avatarInfoFor(avatars, item);
  const itemOut = {
    ...publicRow(item),
    liked: user ? ((item.likedBy ?? []) as string[]).includes(user.id) : false,
    builderAvatar: builderInfo?.avatarUrl ?? null,
    // Authoritative count for the lightbox header. Without it the header read
    // the (possibly stale) grid value and showed 0 while comments rendered
    // right below it.
    commentCount: comments.length,
  };
  const enriched = comments.map((c) => {
    const info = avatarInfoFor(avatars, c);
    return { ...publicRow(c), avatarUrl: info?.avatarUrl ?? null, color: info?.color ?? "avatar-1" };
  });

  return NextResponse.json({ item: itemOut, comments: enriched });
}

// Add a comment to a gallery post. Any signed-in member (not banned) can
// comment — verification is only required for posting builds.
// Body: { content }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in to comment." }, { status: 401 });
  }

  // Live-account gate: removed account → 403, DB outage → 503.
  const gate = await accountGate(user.id);
  if (gate.status === "missing" || gate.status === "banned") {
    return NextResponse.json({ error: "Your account no longer exists on this server." }, { status: 403 });
  }
  if (gate.status === "db_error") {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
  if (gate.status === "unconfigured") {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  const account = gate.account;
  // Spam guard for members — admins are exempt from rate limits.
  if (account.role !== "admin" && isRateLimited(`gcomment:${user.id}`, 10, 60_000)) {
    return NextResponse.json({ error: "You're commenting too fast — wait a moment." }, { status: 429 });
  }

  const { id } = await params;
  const itemId = parseRouteId(id);
  if (itemId === null) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  // `gate.status === "ok"` above already proved the database is configured,
  // but keep the narrowing explicit instead of a non-null assertion.
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const [item] = await db
    .select({ id: galleryItems.id })
    .from(galleryItems)
    .where(eq(galleryItems.id, itemId))
    .limit(1);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "A comment can't be empty." }, { status: 400 });
  }
  if (content.length > 2000) {
    return NextResponse.json({ error: "Comments can be at most 2,000 characters." }, { status: 400 });
  }

  const username = account.username;
  const [created] = await db
    .insert(galleryComments)
    .values({ itemId, content, author: username, authorId: user.id })
    .returning();

  const avatars = await resolveAuthorAvatars([created]);
  const info = avatarInfoFor(avatars, created);
  // `color` resolved like GET returns (gallery_comments stores none of its
  // own), so the freshly-appended comment matches after a reload.
  return NextResponse.json(
    { ...publicRow(created), avatarUrl: info?.avatarUrl ?? null, color: info?.color ?? "avatar-1" },
    { status: 201 }
  );
}

// Two delete operations, disambiguated by the body:
//   { commentId } → delete that comment (author or admin)
//   no commentId  → delete the whole post (author or admin; takes comments with it)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const { id } = await params;
  const itemId = parseRouteId(id);
  if (itemId === null) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = await request.json().catch(() => ({}));
  const commentId = parseId(body?.commentId);

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  // Live-account gate for the OWNER paths: a removed member's unexpired
  // cookie must not keep deleting their posts/comments. (Admins pass the
  // checkAdmin re-read below, which also rejects banned accounts.)
  const gate = await accountGate(user.id);
  if (gate.status === "missing" || gate.status === "banned") {
    return NextResponse.json({ error: "Your account no longer exists on this server." }, { status: 403 });
  }
  if (gate.status === "db_error") {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }

  if (commentId) {
    const [comment] = await db
      .select({ authorId: galleryComments.authorId })
      .from(galleryComments)
      .where(and(eq(galleryComments.id, commentId), eq(galleryComments.itemId, itemId)))
      .limit(1);
    if (!comment) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }
    const isOwner = comment.authorId === user.id && comment.authorId !== "";
    if (!isOwner) {
      const adminVerdict = await checkAdmin();
      if (adminVerdict === "db_error") {
        return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
      }
      if (adminVerdict === "no") {
        return NextResponse.json({ error: "Admins only." }, { status: 403 });
      }
    }
    await db
      .delete(galleryComments)
      .where(and(eq(galleryComments.id, commentId), eq(galleryComments.itemId, itemId)));
    return NextResponse.json({ ok: true });
  }

  const [item] = await db
    .select({
      authorId: galleryItems.authorId,
      image: galleryItems.image,
      images: galleryItems.images,
    })
    .from(galleryItems)
    .where(eq(galleryItems.id, itemId))
    .limit(1);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const isOwner = item.authorId === user.id && item.authorId !== "";
  if (!isOwner) {
    const adminVerdict = await checkAdmin();
    if (adminVerdict === "db_error") {
      return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
    }
    if (adminVerdict === "no") {
      return NextResponse.json({ error: "Admins only." }, { status: 403 });
    }
  }
  // Atomic cascade: a mid-failure must not orphan comments on a deleted post.
  await db.transaction(async (tx) => {
    await tx.delete(galleryComments).where(eq(galleryComments.itemId, itemId));
    await tx.delete(galleryItems).where(eq(galleryItems.id, itemId));
  });
  // Only once the rows are really gone: drop the stored images too, otherwise
  // every deleted post left its files in the bucket forever. Best-effort by
  // design — deleteImagesByUrl logs and returns instead of throwing, so a
  // storage hiccup can't fail a delete that already succeeded.
  await deleteImagesByUrl([item.image, ...(item.images ?? [])]);
  return NextResponse.json({ ok: true });
}

// Admin moderation: feature/unfeature (pin) a gallery post.
// Body: { featured }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminVerdict = await checkAdmin();
  if (adminVerdict === "db_error") {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
  if (adminVerdict === "no") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }
  const { id } = await params;
  const itemId = parseRouteId(id);
  if (itemId === null) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = await request.json().catch(() => ({}));
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  const rows = await db
    .update(galleryItems)
    .set({ featured: Boolean(body.featured) })
    .where(eq(galleryItems.id, itemId))
    .returning();
  if (rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(publicRow(rows[0]));
}
