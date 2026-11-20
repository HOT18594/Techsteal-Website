import { and, count, desc, eq, isNotNull, ne } from "drizzle-orm";
import { cache } from "react";
import { getDb } from "@/lib/db";
import { forumReplies, forumThreads, galleryItems, profiles } from "@/lib/schema";
import { getLiveStatus } from "@/lib/live-status";
import { colorFor, minotarUrl } from "@/lib/forum-avatars";
import type { ForumThread, GalleryItem, PublicProfile } from "@/types";

// Public, in-game identity page data. Mirrors the member directory's privacy
// posture: only non-banned accounts with a linked Minecraft name resolve, and
// only already-public fields are returned (never email, permissions, banned or
// onboarded flags, or raw liker ids). Shared by the API route and the
// server-rendered /members/[id] page so both read the same query. `cache`
// dedupes the metadata + page reads within a single request.
export const getPublicProfile = cache(async (id: string): Promise<PublicProfile | null> => {
  const db = getDb();
  if (!db) return null;

  try {
    const [account] = await db
      .select({
        id: profiles.id,
        username: profiles.username,
        role: profiles.role,
        avatarUrl: profiles.avatarUrl,
        minecraftUsername: profiles.minecraftUsername,
        discordVerified: profiles.discordVerified,
        createdAt: profiles.createdAt,
      })
      .from(profiles)
      .where(
        and(
          eq(profiles.id, id),
          eq(profiles.banned, false),
          isNotNull(profiles.minecraftUsername),
          ne(profiles.minecraftUsername, "")
        )
      )
      .limit(1);
    if (!account) return null;

    const mcName = account.minecraftUsername!.trim();
    if (!mcName) return null;

    const color = colorFor(account.id);
    // Discord PFP preferred (matches forum avatars); MC head as fallback.
    const avatarUrl = account.avatarUrl ?? minotarUrl(mcName);
    const skinUrl = minotarUrl(mcName, 160);

    const [status, threadRows, galleryRows, buildsN, discussionsN, repliesN] = await Promise.all([
      getLiveStatus().catch(() => null),
      db
        .select({
          id: forumThreads.id,
          title: forumThreads.title,
          author: forumThreads.author,
          authorId: forumThreads.authorId,
          avatar: forumThreads.avatar,
          category: forumThreads.category,
          tagClass: forumThreads.tagClass,
          replies: forumThreads.replies,
          last: forumThreads.last,
          pinned: forumThreads.pinned,
          views: forumThreads.views,
          locked: forumThreads.locked,
          likes: forumThreads.likes,
          createdAt: forumThreads.createdAt,
        })
        .from(forumThreads)
        .where(eq(forumThreads.authorId, id))
        .orderBy(desc(forumThreads.createdAt))
        .limit(20),
      db
        .select({
          id: galleryItems.id,
          title: galleryItems.title,
          builder: galleryItems.builder,
          category: galleryItems.category,
          likes: galleryItems.likes,
          image: galleryItems.image,
          height: galleryItems.height,
          authorId: galleryItems.authorId,
          images: galleryItems.images,
          featured: galleryItems.featured,
          views: galleryItems.views,
          createdAt: galleryItems.createdAt,
        })
        .from(galleryItems)
        .where(eq(galleryItems.authorId, id))
        .orderBy(desc(galleryItems.createdAt))
        .limit(24),
      db.select({ value: count() }).from(galleryItems).where(eq(galleryItems.authorId, id)),
      db.select({ value: count() }).from(forumThreads).where(eq(forumThreads.authorId, id)),
      db.select({ value: count() }).from(forumReplies).where(eq(forumReplies.authorId, id)),
    ]);

    const online =
      status?.source === "live" && status.online
        ? (status.playerList ?? []).some((n) => n.toLowerCase() === mcName.toLowerCase())
        : false;

  const threads: ForumThread[] = threadRows.map((row) => ({
    id: row.id,
    title: row.title,
    author: row.author,
    authorId: row.authorId,
    avatar: row.avatar,
    avatarUrl,
    color,
    category: row.category,
    tagClass: row.tagClass,
    replies: row.replies,
    last: row.last,
    pinned: row.pinned,
    views: row.views,
    locked: row.locked,
    likes: row.likes,
    liked: false,
    createdAt: row.createdAt?.toISOString() ?? null,
  }));

  const gallery: GalleryItem[] = galleryRows.map((row) => ({
    id: row.id,
    title: row.title,
    builder: row.builder,
    category: row.category,
    likes: row.likes,
    image: row.image,
    height: row.height as GalleryItem["height"],
    authorId: row.authorId,
    builderAvatar: avatarUrl,
    images: row.images ?? [],
    featured: row.featured,
    views: row.views,
    liked: false,
    createdAt: row.createdAt?.toISOString() ?? null,
  }));

  return {
    id: account.id,
    name: account.username,
    role: account.role === "admin" ? "Admin" : "Member",
    avatarUrl,
    color,
    minecraftUsername: mcName,
    skinUrl,
    verified: account.discordVerified ?? false,
    online,
    joined: formatJoined(account.createdAt),
    gallery,
    threads,
      stats: {
        builds: buildsN[0]?.value ?? 0,
        discussions: discussionsN[0]?.value ?? 0,
        replies: repliesN[0]?.value ?? 0,
      },
    };
  } catch (err) {
    // "Row absent / not a suitable profile" already returned null above. A
    // failed query is an outage, not a deleted member — rethrow so the API's
    // 503 branch (and the page error boundary) can say so instead of 404.
    console.error("getPublicProfile: query failed", err);
    throw err;
  }
});

/** "Aug 20, 2026" from an ISO timestamp (pinned to UTC to stay hydration-safe); "" when absent/unparseable. */
function formatJoined(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}