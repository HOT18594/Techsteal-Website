import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fallbackRules } from "@/lib/fallback-data";
import { ruleSections } from "@/lib/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  if (!db) return NextResponse.json(fallbackRules);

  const rows = await db
    .select()
    .from(ruleSections)
    .orderBy(asc(ruleSections.id));
  return NextResponse.json(rows);
}
