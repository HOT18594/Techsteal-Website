import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fallbackTimeline } from "@/lib/fallback-data";
import { timelineEvents } from "@/lib/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  if (!db) return NextResponse.json(fallbackTimeline);

  const rows = await db
    .select()
    .from(timelineEvents)
    .orderBy(asc(timelineEvents.id));
  return NextResponse.json(rows);
}
