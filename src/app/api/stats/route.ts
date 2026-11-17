import { NextResponse } from "next/server";
import { count, eq, isNotNull, ne, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { forumReplies, forumThreads, galleryItems, profiles } from "@/lib/schema";
import { getLiveStatus } from "@/lib/live-status";
import { siteConfig } from "@/lib/site";
import type { SeasonStats } from "@/types";

export const dynamic = "force-dynamic";

// Aggregated community counters for the home stats tile. Everything here is
// already public (roster size, build/thread/reply counts). The live player
// count and "days live" are gated on seasonLive so the dev/test server never
// leaks its activity before the season publicly opens.
export async function GET() {
  const base: SeasonStats = {
    season: siteConfig.season,
    seasonStart: siteConfig.seasonStart,
    daysLive: 0,
    members: 0,
    online: 0,
    builds: 0,
    discussions: 0,
    replies: 0,
  };

  const db = getDb();
  if (!db) return NextResponse.json(base);

  try {
    const [members, builds, discussions, replies] = await Promise.all([
      db
        .select({ value: count() })
        .from(profiles)
        .where(and(eq(profiles.banned, false), isNotNull(profiles.minecraftUsername), ne(profiles.minecraftUsername, ""))),
      db.select({ value: count() }).from(galleryItems),
      db.select({ value: count() }).from(forumThreads),
      db.select({ value: count() }).from(forumReplies),
    ]);

    let online = 0;
    if (siteConfig.seasonLive) {
      try {
        const status = await getLiveStatus();
        if (status.source === "live" && status.online) online = status.players ?? 0;
      } catch {
        // status unavailable — report 0 rather than guessing.
      }
    }

    const stats: SeasonStats = {
      ...base,
      members: members[0]?.value ?? 0,
      builds: builds[0]?.value ?? 0,
      discussions: discussions[0]?.value ?? 0,
      replies: replies[0]?.value ?? 0,
      online,
      daysLive: siteConfig.seasonLive ? daysSince(siteConfig.seasonStart) : 0,
    };
    return NextResponse.json(stats);
  } catch (err) {
    console.error("api/stats: query failed", err);
    return NextResponse.json(base);
  }
}

/** Whole days since an ISO date (0 when absent/unparseable or in the future). */
function daysSince(iso: string): number {
  if (!iso) return 0;
  const start = new Date(iso);
  if (Number.isNaN(start.getTime())) return 0;
  const ms = Date.now() - start.getTime();
  return ms > 0 ? Math.floor(ms / 86_400_000) : 0;
}