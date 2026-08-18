import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ruleSections } from "@/lib/schema";
import { fallbackRules } from "@/lib/fallback-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  if (!db) return NextResponse.json(fallbackRules);
  const rows = await db.select().from(ruleSections);
  return NextResponse.json(rows);
}