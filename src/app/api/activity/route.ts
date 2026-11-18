import { NextResponse } from "next/server";
import { and, desc, eq, isNotNull, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { forumThreads, galleryItems, profiles } from "@/lib/schema";
import { avatarInfoFor, colorFor, minotarUrl, resolveAuthorAvatars } from "@/lib/forum-avatars";
import type { ActivityEvent } from "@/types";

export const dynamic = "force-dynamic";

// Merged recent-activity feed: new discussions, new builds, and new members.
// Only already-public content — no emails, permissions or moderation state.
export async function GET() {
  const db = getDb();
  if (!db) return NextResponse.json([]);
  try {
    const [threads, gallery, members] = await Promise.all([
      db
        .select({
          id: forumThreads.id,
          title: forumThreads.title,
          author: forumThreads.author,
          authorId: forumThreads.authorId,
          color: forumThreads.color,
          createdAt: forumThreads.createdAt,
        })
        .from(forumThreads)
        .orderBy(desc(forumThreads.createdAt))
        .limit(10),
      db
        .select({
          id: galleryItems.id,
          title: galleryItems.title,
          builder: galleryItems.builder,
          authorId: galleryItems.authorId,
          createdAt: galleryItems.createdAt,
          image: galleryItems.image,
        })
        .from(galleryItems)
        .orderBy(desc(galleryItems.createdAt))
        .limit(10),
      db
        .select({
          id: profiles.id,
          username: profiles.username,
          minecraftUsername: profiles.minecraftUsername,
          createdAt: profiles.createdAt,
        })
        .from(profiles)
        .where(
          and(
            eq(profiles.banned, false),
            isNotNull(profiles.minecraftUsername),
            ne(profiles.minecraftUsername, ""),
            isNotNull(profiles.createdAt)
          )
        )
        .orderBy(desc(profiles.createdAt))
        .limit(5),
    ]);

    const avatars = await resolveAuthorAvatars([
      ...threads,
      ...gallery.map((g) => ({ authorId: g.authorId, author: g.builder })),
    ]).catch(() => new Map<string, { avatarUrl: string | null; color: string }>());

    const events: ActivityEvent[] = [];
    for (const t of threads) {
      const info = avatarInfoFor(avatars, t);
      events.push({
        type: "thread",
        key: `thread-${t.id}`,
        title: t.title,
        author: t.author,
        authorId: t.authorId,
        avatarUrl: info?.avatarUrl ?? null,
        color: info?.color ?? t.color,
        href: `/forum/${t.id}`,
        createdAt: t.createdAt?.toISOString() ?? "",
      });
    }
    for (const g of gallery) {
      const info = avatarInfoFor(avatars, { authorId: g.authorId, author: g.builder });
      events.push({
        type: "gallery",
        key: `gallery-${g.id}`,
        title: g.title,
        author: g.builder,
        authorId: g.authorId,
        avatarUrl: info?.avatarUrl ?? null,
        color: info?.color ?? colorFor(g.authorId || g.builder),
        href: `/gallery?item=${g.id}`,
        createdAt: g.createdAt?.toISOString() ?? "",
        image: g.image,
      });
    }
    for (const m of members) {
      const mc = m.minecraftUsername!.trim();
      events.push({
        type: "member",
        key: `member-${m.id}`,
        title: "",
        author: m.username,
        authorId: m.id,
        avatarUrl: minotarUrl(mc),
        color: colorFor(m.id),
        href: `/members/${encodeURIComponent(m.id)}`,
        createdAt: m.createdAt ?? "",
      });
    }

    // ISO timestamps sort chronologically as strings; empty dates fall last.
    events.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    return NextResponse.json(events.slice(0, 12));
  } catch (err) {
    console.error("api/activity: query failed", err);
    return NextResponse.json([]);
  }
}