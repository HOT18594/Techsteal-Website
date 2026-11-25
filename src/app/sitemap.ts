import type { MetadataRoute } from "next";
import { and, desc, eq, isNotNull, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { forumThreads, profiles } from "@/lib/schema";
import { getSiteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

const STATIC_ROUTES: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}> = [
  { path: "", changeFrequency: "daily", priority: 1.0 },
  { path: "/status", changeFrequency: "always", priority: 0.9 },
  { path: "/commands", changeFrequency: "always", priority: 0.85 },
  { path: "/forum", changeFrequency: "daily", priority: 0.9 },
  { path: "/gallery", changeFrequency: "daily", priority: 0.85 },
  { path: "/members", changeFrequency: "daily", priority: 0.8 },
  { path: "/join", changeFrequency: "weekly", priority: 0.8 },
  { path: "/rules", changeFrequency: "weekly", priority: 0.7 },
  { path: "/history", changeFrequency: "weekly", priority: 0.7 },
  { path: "/assistant", changeFrequency: "monthly", priority: 0.5 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();
  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: `${base}${route.path}`,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  try {
    const db = getDb();
    if (!db) return entries;

    const [threads, memberRows] = await Promise.all([
      db
        .select({
          id: forumThreads.id,
          editedAt: forumThreads.editedAt,
          createdAt: forumThreads.createdAt,
        })
        .from(forumThreads)
        .orderBy(desc(forumThreads.id))
        .limit(500),
      db
        .select({
          id: profiles.id,
          minecraftUsername: profiles.minecraftUsername,
          createdAt: profiles.createdAt,
        })
        .from(profiles)
        // Mirrors the /members/[id] visibility rule (lib/public-profile.ts):
        // banned accounts and accounts without a linked Minecraft name have no
        // public profile, so they must never be advertised to crawlers.
        .where(
          and(
            eq(profiles.banned, false),
            isNotNull(profiles.minecraftUsername),
            ne(profiles.minecraftUsername, "")
          )
        )
        .limit(500),
    ]);

    for (const thread of threads) {
      const mod = thread.editedAt ?? thread.createdAt;
      entries.push({
        url: `${base}/forum/${thread.id}`,
        ...(mod ? { lastModified: mod } : {}),
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }

    for (const member of memberRows) {
      if (!member.id.startsWith("discord:")) continue;
      // Same trim guard as the profile page: whitespace-only names are treated
      // as missing there and resolve to a 404.
      if (!member.minecraftUsername?.trim()) continue;
      const parsed = member.createdAt ? new Date(member.createdAt) : null;
      entries.push({
        url: `${base}/members/${encodeURIComponent(member.id)}`,
        ...(parsed && !Number.isNaN(parsed.getTime()) ? { lastModified: parsed } : {}),
        changeFrequency: "weekly",
        priority: 0.5,
      });
    }
  } catch (err) {
    console.error("sitemap DB query failed; serving static routes only:", err);
  }

  return entries;
}
