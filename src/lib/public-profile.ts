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

  let online = false;
  try {
    const status = await getLiveStatus();
    if (status.source === "live" && status.online) {
      online = (status.playerList ?? []).some((n) => n.toLowerCase() === mcName.toLowerCase());
    }
  } catch {
    // status unavailable — show offline, which is safe/honest.
  }

  const [threadRows, galleryRows, buildsN, discussionsN, repliesN] = await Promise.all([
    db.select().from(forumThreads).where(eq(forumThreads.authorId, id)).orderBy(desc(forumThreads.createdAt)).limit(20),
    db.select().from(galleryItems).where(eq(galleryItems.authorId, id)).orderBy(desc(galleryItems.createdAt)).limit(24),
    db.select({ value: count() }).from(galleryItems).where(eq(galleryItems.authorId, id)),
    db.select({ value: count() }).from(forumThreads).where(eq(forumThreads.authorId, id)),
    db.select({ value: count() }).from(forumReplies).where(eq(forumReplies.authorId, id)),
  ]);

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
});

/** "Aug 20, 2026" from an ISO timestamp; "" when absent/unparseable. */
function formatJoined(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}