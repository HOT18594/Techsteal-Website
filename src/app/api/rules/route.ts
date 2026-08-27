import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { ruleSections } from "@/lib/schema";
import { fallbackRules } from "@/lib/fallback-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  if (!db) return NextResponse.json(fallbackRules);
  try {
    // Numbered rules must render in insertion order — without an ORDER BY,
    // Postgres may return heap order after updates/vacuum and shuffle them.
    const rows = await db.select().from(ruleSections).orderBy(asc(ruleSections.id));
    return NextResponse.json(rows);
  } catch (err) {
    console.error("api/rules: query failed", err);
    return NextResponse.json(fallbackRules);
  }
}