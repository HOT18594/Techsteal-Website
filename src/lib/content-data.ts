import { asc, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getLaunchState } from "@/lib/launch";
import { ruleSections, timelineEvents } from "@/lib/schema";
import { buildFallbackTimeline, fallbackRules } from "@/lib/fallback-data";
import { siteConfig } from "@/lib/site";
import type { RuleSection, TimelineEvent } from "@/types";

// Shared by the API routes and the server-rendered pages so both read the
// same query + fallback behavior.

export async function getRules(): Promise<RuleSection[]> {
  const db = getDb();
  if (!db) return fallbackRules;
  try {
    // Numbered rules must render in insertion order — without an ORDER BY,
    // Postgres may return heap order after updates/vacuum and shuffle them.
    return await db.select().from(ruleSections).orderBy(asc(ruleSections.id));
  } catch (err) {
    console.error("getRules: query failed", err);
    return fallbackRules;
  }
}

export async function getTimeline(): Promise<TimelineEvent[]> {
  const launch = await getLaunchState();
  // fallbackTimeline is stored oldest-first (so seeding assigns ids in
  // chronological order) — reverse it to match the desc(id) result.
  const fallback = [...buildFallbackTimeline(launch.seasonLive)].reverse();
  const db = getDb();
  if (!db) return fallback;
  try {
    // Newest events first — rows are appended chronologically, so higher id =
    // more recent. The timeline page renders top-to-bottom.
    const rows = await db.select().from(timelineEvents).orderBy(desc(timelineEvents.id));
    if (rows.length === 0) return fallback;

    const currentPrefix = siteConfig.season.toLowerCase();
    const prepPrefix = `${siteConfig.season} is coming soon —`;
    const livePrefix = `${siteConfig.season} is live —`;
    const liveDate = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "America/New_York",
    }).format(new Date(launch.launchAt));

    return rows.map(({ description, ...rest }) => {
      if (
        launch.seasonLive &&
        rest.title.toLowerCase().startsWith(currentPrefix) &&
        rest.date.trim().toLowerCase() === "coming soon"
      ) {
        return {
          ...rest,
          date: liveDate,
          era: "Current Season",
          description: description?.startsWith(prepPrefix)
            ? description.replace(prepPrefix, livePrefix)
            : description ?? undefined,
        };
      }
      return {
        ...rest,
        description: description ?? undefined,
      };
    });
  } catch (err) {
    console.error("getTimeline: query failed", err);
    return fallback;
  }
}
