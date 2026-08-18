import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { timelineEvents } from "@/lib/schema";
import { fallbackTimeline } from "@/lib/fallback-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  if (!db) return NextResponse.json(fallbackTimeline);
  const rows = await db.select().from(timelineEvents).orderBy(asc(timelineEvents.id));
  return NextResponse.json(rows);
}