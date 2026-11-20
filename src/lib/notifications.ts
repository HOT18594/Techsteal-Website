import { and, count, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { getDb, type Db } from "@/lib/db";
import { notifications, profiles } from "@/lib/schema";
import { avatarInfoFor, resolveAuthorAvatars } from "@/lib/forum-avatars";
import type { Notification, NotificationType } from "@/types";

// Server-side notification helpers. Rows are generated when something happens
// that concerns a member (a reply, a like, an @mention, a comment/like on their
// build). Everything is scoped to a single recipient — a user can only ever
// read or mark their own inbox.

export interface NotifyInput {
  userId: string;
  actorId: string;
  actorName: string;
  type: NotificationType;
  threadId?: number | null;
  replyId?: number | null;
  itemId?: number | null;
  excerpt?: string;
}

/** Like notifications repeat pointlessly on an unlike → re-like toggle, so
 *  only one per recipient+actor+type+target is kept inside this window.
 *  Reply/mention types are never deduped. */
const LIKE_DEDUPE_TYPES: ReadonlySet<NotificationType> = new Set(["like", "gallery_like"]);
const LIKE_DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** True when the same like notification was already queued inside the dedupe
 *  window. Throws on query failure — callers treat that as "allow the insert". */
async function hasRecentLikeNotification(db: Db, input: NotifyInput): Promise<boolean> {
  const sameTarget = and(
    input.threadId == null ? isNull(notifications.threadId) : eq(notifications.threadId, input.threadId),
    input.replyId == null ? isNull(notifications.replyId) : eq(notifications.replyId, input.replyId),
    input.itemId == null ? isNull(notifications.itemId) : eq(notifications.itemId, input.itemId)
  );
  const [row] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, input.userId),
        eq(notifications.actorId, input.actorId),
        eq(notifications.type, input.type),
        sameTarget,
        gte(notifications.createdAt, new Date(Date.now() - LIKE_DEDUPE_WINDOW_MS))
      )
    )
    .limit(1);
  return Boolean(row);
}

/** Insert one notification. Never notifies yourself; best-effort (a failure
 *  here must not roll back the reply/like that triggered it). */
export async function notify(input: NotifyInput): Promise<void> {
  if (!input.userId || input.userId === input.actorId) return;
  const db = getDb();
  if (!db) return;
  try {
    if (LIKE_DEDUPE_TYPES.has(input.type)) {
      try {
        if (await hasRecentLikeNotification(db, input)) return;
      } catch (err) {
        // Dedupe is best-effort: a lookup failure must not drop the ping.
        console.error("notify: like dedupe check failed", err);
      }
    }
    await db.insert(notifications).values({
      userId: input.userId,
      actorId: input.actorId,
      actorName: input.actorName,
      type: input.type,
      threadId: input.threadId ?? null,
      replyId: input.replyId ?? null,
      itemId: input.itemId ?? null,
      excerpt: (input.excerpt ?? "").slice(0, 200),
    });
  } catch (err) {
    console.error("notify: insert failed", err);
  }
}

/** Insert several notifications, deduped by recipient (self excluded). */
export async function notifyMany(inputs: NotifyInput[]): Promise<void> {
  const seen = new Set<string>();
  const rows = inputs.filter((n) => {
    if (!n.userId || n.userId === n.actorId || seen.has(n.userId)) return false;
    seen.add(n.userId);
    return true;
  });
  if (rows.length === 0) return;
  const db = getDb();
  if (!db) return;
  try {
    await db.insert(notifications).values(
      rows.map((n) => ({
        userId: n.userId,
        actorId: n.actorId,
        actorName: n.actorName,
        type: n.type,
        threadId: n.threadId ?? null,
        replyId: n.replyId ?? null,
        itemId: n.itemId ?? null,
        excerpt: (n.excerpt ?? "").slice(0, 200),
      }))
    );
  } catch (err) {
    console.error("notifyMany: insert failed", err);
  }
}

/** Resolve @mentions in post text to recipient account ids (case-insensitive
 *  username match, banned accounts excluded, capped to avoid abuse). */
export async function mentionRecipients(content: string, actorId: string): Promise<string[]> {
  const db = getDb();
  if (!db) return [];
  const tokens = [
    ...new Set((content.match(/@([A-Za-z0-9_.]{2,32})/g) ?? []).map((m) => m.slice(1).toLowerCase())),
  ].slice(0, 10);
  if (tokens.length === 0) return [];
  try {
    const rows = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(and(eq(profiles.banned, false), inArray(sql`lower(${profiles.username})`, tokens)));
    return rows.map((r) => r.id).filter((id) => id !== actorId);
  } catch (err) {
    console.error("mentionRecipients: query failed", err);
    return [];
  }
}

/** A user's newest-first inbox plus their unread count. */
export async function listNotifications(
  userId: string,
  limit = 30
): Promise<{ notifications: Notification[]; unread: number }> {
  const db = getDb();
  if (!db) return { notifications: [], unread: 0 };

  const [rows, unreadRows] = await Promise.all([
    db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit),
    db.select({ value: count() }).from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.read, false))),
  ]);

  const avatars = await resolveAuthorAvatars(rows.map((r) => ({ authorId: r.actorId, author: r.actorName })));

  const items: Notification[] = rows.map((r) => {
    const info = avatarInfoFor(avatars, { authorId: r.actorId, author: r.actorName });
    return {
      id: r.id,
      type: r.type as NotificationType,
      actorId: r.actorId,
      actorName: r.actorName,
      actorAvatar: info?.avatarUrl ?? null,
      actorColor: info?.color,
      threadId: r.threadId,
      replyId: r.replyId,
      itemId: r.itemId,
      excerpt: r.excerpt,
      read: r.read,
      createdAt: r.createdAt?.toISOString() ?? "",
    };
  });

  return { notifications: items, unread: unreadRows[0]?.value ?? 0 };
}

/** Mark one user's notifications read — all, or a specific set of ids. Always
 *  scoped to userId so a crafted request can't touch another member's inbox. */
export async function markRead(userId: string, ids?: number[]): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    if (ids && ids.length > 0) {
      await db.update(notifications).set({ read: true }).where(and(eq(notifications.userId, userId), inArray(notifications.id, ids)));
    } else {
      await db.update(notifications).set({ read: true }).where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
    }
  } catch (err) {
    console.error("markRead: update failed", err);
  }
}