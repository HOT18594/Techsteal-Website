import { asc, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { ruleSections, timelineEvents } from "@/lib/schema";
import { fallbackRules, fallbackTimeline } from "@/lib/fallback-data";
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
  // fallbackTimeline is stored oldest-first (so seeding assigns ids in
  // chronological order) — reverse it to match the desc(id) result.
  const fallback = [...fallbackTimeline].reverse();
  const db = getDb();
  if (!db) return fallback;
  try {
    // Newest events first — rows are appended chronologically, so higher id =
    // more recent. The timeline page renders top-to-bottom.
    const rows = await db.select().from(timelineEvents).orderBy(desc(timelineEvents.id));
    return rows.map(({ description, ...rest }) => ({
      ...rest,
      description: description ?? undefined,
    }));
  } catch (err) {
    console.error("getTimeline: query failed", err);
    return fallback;
  }
}