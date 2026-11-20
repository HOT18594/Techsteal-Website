import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { galleryComments, galleryItems } from "@/lib/schema";
import { getSessionUser } from "@/lib/auth";
import { accountGate, ACCOUNT_DB_ERROR_MESSAGE, requireAdminAccount } from "@/lib/accounts";
import { logAudit } from "@/lib/audit";
import { isRateLimited, rateLimitIp } from "@/lib/rate-limit";
import { avatarInfoFor, resolveAuthorAvatars } from "@/lib/forum-avatars";
import { publicRow } from "@/lib/public-row";
import { parseBodyId, parseRouteId } from "@/lib/route-ids";
import { shouldCountView } from "@/lib/view-counter";
import { deleteImagesByUrl, extractStorageUrls } from "@/lib/storage";
import { markdownExcerpt } from "@/lib/excerpt";
import { mentionRecipients, notify, notifyMany } from "@/lib/notifications";
import type { Account } from "@/types";

export const dynamic = "force-dynamic";

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

  // A pooler blip must answer 503 JSON like the list routes, not escape as
  // Next's generic HTML 500.
  try {
    const [items, comments, user] = await Promise.all([
      db.select().from(galleryItems).where(eq(galleryItems.id, itemId)).limit(1),
      db
        .select()
        .from(galleryComments)
        .where(eq(galleryComments.itemId, itemId))
        .orderBy(asc(galleryComments.createdAt)),
      getSessionUser(),
    ]);
    if (!items[0]) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    let item = items[0];
    const builderRef = { authorId: item.authorId, author: item.builder };

    // rateLimitIp takes the LAST x-forwarded-for entry (our own edge's) —
    // deduping on the client-controlled first entry let anyone inflate views.
    const viewer = user?.id ?? rateLimitIp(request);
    const countView = shouldCountView("gallery", itemId, viewer);

    // One avatar lookup covers the poster and every commenter in parallel with
    // the view-count bump.
    const [bumpedRows, avatars] = await Promise.all([
      countView
        ? db
            .update(galleryItems)
            .set({ views: sql`${galleryItems.views} + 1` })
            .where(eq(galleryItems.id, itemId))
            .returning({ views: galleryItems.views })
        : Promise.resolve(null),
      resolveAuthorAvatars([builderRef, ...comments]).catch(
        () => new Map<string, { avatarUrl: string | null; color: string }>()
      ),
    ]);
    if (bumpedRows?.[0]) item = { ...item, views: bumpedRows[0].views };

    const builderInfo = avatarInfoFor(avatars, builderRef);
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
  } catch (err) {
    console.error("api/gallery/[id]: detail query failed", err);
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
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

  const { id } = await params;
  const itemId = parseRouteId(id);
  if (itemId === null) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
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

  const body = (await request.json().catch(() => ({}))) ?? {};
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "A comment can't be empty." }, { status: 400 });
  }
  if (content.length > 2000) {
    return NextResponse.json({ error: "Comments can be at most 2,000 characters." }, { status: 400 });
  }

  // Spam guard for members — admins are exempt from rate limits. Checked after
  // validation so accidental empty submits don't consume the user's quota.
  if (account.role !== "admin" && isRateLimited(`gcomment:${user.id}`, 10, 60_000)) {
    return NextResponse.json({ error: "You're commenting too fast — wait a moment." }, { status: 429 });
  }

  // `gate.status === "ok"` above already proved the database is configured,
  // but keep the narrowing explicit instead of a non-null assertion.
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const username = account.username;
  let outcome: { created: typeof galleryComments.$inferSelect; itemAuthorId: string } | null;
  try {
    outcome = await db.transaction(async (tx) => {
      const [item] = await tx
        .select({ id: galleryItems.id, authorId: galleryItems.authorId })
        .from(galleryItems)
        .where(eq(galleryItems.id, itemId))
        .for("share")
        .limit(1);
      if (!item) return null;
      const [inserted] = await tx
        .insert(galleryComments)
        .values({ itemId, content, author: username, authorId: user.id })
        .returning();
      return { created: inserted, itemAuthorId: item.authorId };
    });
  } catch (err) {
    console.error("api/gallery/[id] POST: comment failed", err);
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
  if (!outcome) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { created, itemAuthorId } = outcome;

  // Notify the build's owner and any @mentions (best-effort; the owner is
  // excluded from mentions so they don't get two pings).
  const excerpt = markdownExcerpt(content, 140);
  await notify({
    userId: itemAuthorId,
    actorId: user.id,
    actorName: username,
    type: "gallery_comment",
    itemId,
    replyId: created.id,
    excerpt,
  });
  const mentioned = await mentionRecipients(content, user.id);
  await notifyMany(
    mentioned
      .filter((id) => id !== itemAuthorId)
      .map((id) => ({
        userId: id,
        actorId: user.id,
        actorName: username,
        type: "mention" as const,
        itemId,
        replyId: created.id,
        excerpt,
      }))
  );

  const avatars = await resolveAuthorAvatars([created]).catch(
    () => new Map<string, { avatarUrl: string | null; color: string }>()
  );
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
  const body = (await request.json().catch(() => ({}))) ?? {};
  // A PRESENT-but-invalid commentId (""/0/"12x") must not fall through
  // to whole-post deletion — that would destroy every comment and the post's
  // stored images on a malformed request. Only an ABSENT commentId means
  // "delete the post".
  const commentDelete = body?.commentId !== undefined && body.commentId !== null;
  const commentId = commentDelete ? parseBodyId(body.commentId) : null;
  if (commentDelete && commentId === null) {
    return NextResponse.json({ error: "Invalid commentId" }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  // Live-account gate for the OWNER paths: a removed member's unexpired
  // cookie must not keep deleting their posts/comments.
  const gate = await accountGate(user.id);
  if (gate.status === "missing" || gate.status === "banned") {
    return NextResponse.json({ error: "Your account no longer exists on this server." }, { status: 403 });
  }
  if (gate.status === "db_error") {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }

  try {
    if (commentDelete && commentId !== null) {
      const [comment] = await db
        .select({
          authorId: galleryComments.authorId,
          author: galleryComments.author,
          content: galleryComments.content,
        })
        .from(galleryComments)
        .where(and(eq(galleryComments.id, commentId), eq(galleryComments.itemId, itemId)))
        .limit(1);
      if (!comment) {
        return NextResponse.json({ error: "Comment not found" }, { status: 404 });
      }
      const isOwner = comment.authorId === user.id && comment.authorId !== "";
      let adminAccount: Account | null = null;
      if (!isOwner) {
        const adminGate = await requireAdminAccount();
        if (adminGate.status === "db_error") {
          return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
        }
        if (adminGate.status === "no") {
          return NextResponse.json({ error: "Admins only." }, { status: 403 });
        }
        adminAccount = adminGate.account;
      }
      const deletedRows = await db
        .delete(galleryComments)
        .where(and(eq(galleryComments.id, commentId), eq(galleryComments.itemId, itemId)))
        .returning({ id: galleryComments.id, content: galleryComments.content });
      if (deletedRows.length === 0) {
        return NextResponse.json({ error: "Comment not found" }, { status: 404 });
      }
      const embedUrls = extractStorageUrls(deletedRows[0].content ?? "");
      if (embedUrls.length > 0) {
        await deleteImagesByUrl(embedUrls, { id: user.id, isAdmin: !isOwner });
      }
      if (adminAccount) {
        await logAudit({
          actorId: adminAccount.id,
          actorName: adminAccount.username,
          action: "gallery_comment_delete",
          targetId: String(commentId),
          targetName: comment.author,
          detail: `Deleted comment on gallery item #${itemId}`,
        });
      }
      return NextResponse.json({ ok: true });
    }

    const [item] = await db
      .select({
        authorId: galleryItems.authorId,
        builder: galleryItems.builder,
        title: galleryItems.title,
        description: galleryItems.description,
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
    let adminAccount: Account | null = null;
    if (!isOwner) {
      const adminGate = await requireAdminAccount();
      if (adminGate.status === "db_error") {
        return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
      }
      if (adminGate.status === "no") {
        return NextResponse.json({ error: "Admins only." }, { status: 403 });
      }
      adminAccount = adminGate.account;
    }
    // Atomic cascade: lock + delete the post first so racing deletes answer 404
    // on the loser and concurrent comment inserts (FOR SHARE) serialize cleanly.
    const deleted = await db.transaction(async (tx) => {
      const removedItems = await tx
        .delete(galleryItems)
        .where(eq(galleryItems.id, itemId))
        .returning({ id: galleryItems.id });
      if (removedItems.length === 0) return null;
      const commentRows = await tx
        .delete(galleryComments)
        .where(eq(galleryComments.itemId, itemId))
        .returning({ content: galleryComments.content });
      return { commentRows };
    });
    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Only once the rows are really gone: drop stored gallery images plus any
    // storage embeds in the description or comments. Best-effort by design.
    const urlsToDelete = [
      item.image,
      ...(item.images ?? []),
      ...extractStorageUrls(item.description ?? ""),
      ...deleted.commentRows.flatMap((c) => extractStorageUrls(c.content ?? "")),
    ];
    await deleteImagesByUrl(urlsToDelete, { id: user.id, isAdmin: !isOwner });

    if (adminAccount) {
      await logAudit({
        actorId: adminAccount.id,
        actorName: adminAccount.username,
        action: "gallery_delete",
        targetId: String(itemId),
        targetName: item.title,
        detail: `Deleted gallery post by ${item.builder}`,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("api/gallery/[id] DELETE: delete failed", err);
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
}

// Admin moderation: feature/unfeature (pin) a gallery post.
// Body: { featured }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminGate = await requireAdminAccount();
  if (adminGate.status === "db_error") {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
  if (adminGate.status === "no") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }
  const { id } = await params;
  const itemId = parseRouteId(id);
  if (itemId === null) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = (await request.json().catch(() => ({}))) ?? {};
  // Only a real boolean flips the flag — Boolean("false") === true, so a
  // stringified body would feature the post instead of unfeaturing it.
  if (typeof body.featured !== "boolean") {
    return NextResponse.json({ error: "featured must be a boolean" }, { status: 400 });
  }
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  try {
    const rows = await db
      .update(galleryItems)
      .set({ featured: body.featured })
      .where(eq(galleryItems.id, itemId))
      .returning();
    if (rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await logAudit({
      actorId: adminGate.account.id,
      actorName: adminGate.account.username,
      action: "gallery_feature",
      targetId: String(itemId),
      targetName: rows[0].title,
      detail: body.featured ? "featured" : "unfeatured",
    });
    return NextResponse.json(publicRow(rows[0]));
  } catch (err) {
    console.error("api/gallery/[id] PATCH: update failed", err);
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
}
