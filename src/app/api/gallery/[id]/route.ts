import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { galleryComments, galleryItems } from "@/lib/schema";
import { getSessionUser } from "@/lib/auth";
import { findAccount, isAdminUser } from "@/lib/accounts";
import { isRateLimited } from "@/lib/rate-limit";
import { avatarInfoFor, resolveAuthorAvatars } from "@/lib/forum-avatars";

export const dynamic = "force-dynamic";

// View-count dedupe: one count per viewer per item per 6h.
const VIEW_SEEN = new Map<string, number>();
const VIEW_TTL = 6 * 60 * 60_000;

function countView(itemId: number, viewer: string): boolean {
  const now = Date.now();
  if (VIEW_SEEN.size > 5000) {
    for (const [k, ts] of VIEW_SEEN) {
      if (now - ts > VIEW_TTL) VIEW_SEEN.delete(k);
    }
  }
  const key = `${itemId}:${viewer}`;
  const last = VIEW_SEEN.get(key);
  if (last !== undefined && now - last < VIEW_TTL) return false;
  VIEW_SEEN.set(key, now);
  return true;
}

/** Parse an id from a JSON body, rejecting null/""/0. */
function parseId(value: unknown): number | null {
  const id = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Gallery item detail: the post + its comments. Bumps the view counter
// (deduped per viewer).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const itemId = Number(id);
  if (!Number.isInteger(itemId)) {
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
  const viewer =
    user?.id ??
    (request.headers.get("x-forwarded-for") ?? "anon").split(",")[0].trim().slice(0, 60);
  if (countView(itemId, viewer)) {
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
  const itemOut: typeof item & { builderAvatar: string | null } = {
    ...item,
    builderAvatar: builderInfo?.avatarUrl ?? null,
  };
  const enriched = comments.map((c) => {
    const info = avatarInfoFor(avatars, c);
    return { ...c, avatarUrl: info?.avatarUrl ?? null, color: info?.color ?? "avatar-1" };
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
  if (isRateLimited(`gcomment:${user.id}`, 10, 60_000)) {
    return NextResponse.json({ error: "You're commenting too fast — wait a moment." }, { status: 429 });
  }

  const { id } = await params;
  const itemId = Number(id);
  if (!Number.isInteger(itemId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const db = getDb();
  const account = db ? await findAccount(user.id).catch(() => null) : undefined;
  if (db && (!account || account.banned)) {
    return NextResponse.json({ error: "Your account no longer exists on this server." }, { status: 403 });
  }
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

  const username = account?.username ?? user.username;
  const [created] = await db
    .insert(galleryComments)
    .values({ itemId, content, author: username, authorId: user.id })
    .returning();

  const avatars = await resolveAuthorAvatars([created]);
  const info = avatarInfoFor(avatars, created);
  // `color` resolved like GET returns (gallery_comments stores none of its
  // own), so the freshly-appended comment matches after a reload.
  return NextResponse.json(
    { ...created, avatarUrl: info?.avatarUrl ?? null, color: info?.color ?? "avatar-1" },
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
  const itemId = Number(id);
  if (!Number.isInteger(itemId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = await request.json().catch(() => ({}));
  const commentId = parseId(body?.commentId);

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
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
    if (!isOwner && !(await isAdminUser())) {
      return NextResponse.json({ error: "Admins only." }, { status: 403 });
    }
    await db
      .delete(galleryComments)
      .where(and(eq(galleryComments.id, commentId), eq(galleryComments.itemId, itemId)));
    return NextResponse.json({ ok: true });
  }

  const [item] = await db
    .select({ authorId: galleryItems.authorId })
    .from(galleryItems)
    .where(eq(galleryItems.id, itemId))
    .limit(1);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const isOwner = item.authorId === user.id && item.authorId !== "";
  if (!isOwner && !(await isAdminUser())) {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }
  await db.delete(galleryComments).where(eq(galleryComments.itemId, itemId));
  await db.delete(galleryItems).where(eq(galleryItems.id, itemId));
  return NextResponse.json({ ok: true });
}

// Admin moderation: feature/unfeature (pin) a gallery post.
// Body: { featured }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminUser())) {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }
  const { id } = await params;
  const itemId = Number(id);
  if (!Number.isInteger(itemId)) {
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
  return NextResponse.json(rows[0]);
}
