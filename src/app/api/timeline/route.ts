import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { timelineEvents } from "@/lib/schema";
import { fallbackTimeline } from "@/lib/fallback-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  if (!db) {
    // fallbackTimeline is stored oldest-first (so seeding assigns ids in
    // chronological order) — reverse it here to match the desc(id) result.
    return NextResponse.json([...fallbackTimeline].reverse());
  }
  try {
    // Newest events first — rows are appended chronologically, so higher id =
    // more recent. The timeline page renders top-to-bottom.
    const rows = await db.select().from(timelineEvents).orderBy(desc(timelineEvents.id));
    return NextResponse.json(rows);
  } catch (err) {
    console.error("api/timeline: query failed", err);
    return NextResponse.json([...fallbackTimeline].reverse());
  }
}