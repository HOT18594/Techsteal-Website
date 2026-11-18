import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, ilike, isNotNull, ne, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { forumThreads, galleryItems, profiles } from "@/lib/schema";
import { getLiveStatus } from "@/lib/live-status";
import { avatarInfoFor, colorFor, minotarUrl, resolveAuthorAvatars } from "@/lib/forum-avatars";
import { publicRow } from "@/lib/public-row";
import { escapeLike } from "@/lib/excerpt";
import { rateLimitIp, isRateLimited } from "@/lib/rate-limit";
import type { ForumThread, GalleryItem, Member, SearchResults } from "@/types";

export const dynamic = "force-dynamic";

const EMPTY: SearchResults = { threads: [], gallery: [], members: [] };
const PER_GROUP = 8;

// Global search across the three public community surfaces: forum threads,
// gallery builds and the in-game member roster. Privacy posture mirrors the
// individual list APIs — only already-public fields, banned accounts and
// accounts without a linked Minecraft name are excluded from member hits,
// and raw liker ids never leave the server (publicRow strips likedBy).
export async function GET(request: NextRequest): Promise<NextResponse> {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  // A one-character query matches nearly everything and is never useful —
  // wait for a real term before touching the rate limiter or database.
  if (q.length < 2) return NextResponse.json(EMPTY);

  // Anonymous endpoint — key the limiter on the platform-appended client IP
  // so a scripted hammer can't fan out unbounded LIKE scans.
  if (isRateLimited(`search:${rateLimitIp(request)}`, 40, 60_000)) {
    return NextResponse.json({ error: "Slow down a little." }, { status: 429 });
  }

  const db = getDb();
  if (!db) return NextResponse.json(EMPTY);

  try {
    const like = `%${escapeLike(q)}%`;

    const [threadRows, galleryRows, memberRows, status] = await Promise.all([
      db
        .select({
          id: forumThreads.id,
          title: forumThreads.title,
          content: forumThreads.content,
          author: forumThreads.author,
          authorId: forumThreads.authorId,
          avatar: forumThreads.avatar,
          color: forumThreads.color,
          category: forumThreads.category,
          tagClass: forumThreads.tagClass,
          replies: forumThreads.replies,
          last: forumThreads.last,
          pinned: forumThreads.pinned,
          views: forumThreads.views,
          locked: forumThreads.locked,
          likes: forumThreads.likes,
          editedAt: forumThreads.editedAt,
          createdAt: forumThreads.createdAt,
        })
        .from(forumThreads)
        .where(
          or(
            ilike(forumThreads.title, like),
            ilike(forumThreads.content, like),
            ilike(forumThreads.author, like)
          )
        )
        .orderBy(desc(forumThreads.createdAt))
        .limit(PER_GROUP),
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
          featured: galleryItems.featured,
          views: galleryItems.views,
          createdAt: galleryItems.createdAt,
        })
        .from(galleryItems)
        .where(
          or(
            ilike(galleryItems.title, like),
            ilike(galleryItems.description, like),
            ilike(galleryItems.builder, like)
          )
        )
        .orderBy(desc(galleryItems.featured), desc(galleryItems.id))
        .limit(PER_GROUP),
      db
        .select({
          id: profiles.id,
          username: profiles.username,
          role: profiles.role,
          minecraftUsername: profiles.minecraftUsername,
          discordVerified: profiles.discordVerified,
          createdAt: profiles.createdAt,
        })
        .from(profiles)
        .where(
          and(
            eq(profiles.banned, false),
            isNotNull(profiles.minecraftUsername),
            ne(profiles.minecraftUsername, ""),
            or(ilike(profiles.username, like), ilike(profiles.minecraftUsername, like))
          )
        )
        .orderBy(profiles.username)
        .limit(PER_GROUP),
      getLiveStatus().catch(() => null),
    ]);

    const avatars = await resolveAuthorAvatars([
      ...threadRows,
      ...galleryRows.map((g) => ({ authorId: g.authorId, author: g.builder })),
    ]).catch(() => new Map<string, { avatarUrl: string | null; color: string }>());

    const threads: ForumThread[] = threadRows.map((row) => {
      const info = avatarInfoFor(avatars, row);
      return {
        ...publicRow(row),
        avatarUrl: info?.avatarUrl ?? null,
        color: info?.color ?? row.color,
        liked: false,
        createdAt: row.createdAt?.toISOString() ?? null,
        editedAt: row.editedAt?.toISOString() ?? null,
      };
    });

    const gallery: GalleryItem[] = galleryRows.map((row) => {
      const info = avatarInfoFor(avatars, { authorId: row.authorId, author: row.builder });
      return {
        ...publicRow(row),
        height: row.height as GalleryItem["height"],
        builderAvatar: info?.avatarUrl ?? null,
        liked: false,
        createdAt: row.createdAt?.toISOString() ?? null,
      };
    });

    // Online status from the same shared, cached snapshot the directory uses
    // — one upstream call, consistent dots across surfaces.
    const onlineNames =
      status?.source === "live" && status.online
        ? new Set((status.playerList ?? []).map((n) => n.toLowerCase()))
        : new Set<string>();

    const members: Member[] = memberRows
      .filter((row) => Boolean(row.minecraftUsername?.trim()))
      .map((row) => {
        const mcName = row.minecraftUsername!.trim();
        return {
          id: row.id,
          name: row.username,
          role: row.role === "admin" ? "Admin" : "Member",
          icon: row.role === "admin" ? "fa-shield-halved" : "fa-user",
          avatar: row.username.slice(0, 1).toUpperCase(),
          avatarUrl: minotarUrl(mcName),
          color: colorFor(row.id),
          status: onlineNames.has(mcName.toLowerCase()) ? "online" : "offline",
          joined: formatJoined(row.createdAt),
          verified: row.discordVerified ?? false,
          minecraftUsername: mcName,
        };
      });

    return NextResponse.json({ threads, gallery, members } satisfies SearchResults);
  } catch (err) {
    console.error("api/search: query failed", err);
    return NextResponse.json(EMPTY);
  }
}

/** "Aug 20, 2026" from an ISO timestamp; "" when absent/unparseable. */
function formatJoined(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}