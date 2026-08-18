import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { members } from "@/lib/schema";
import { fallbackMembers } from "@/lib/fallback-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  if (!db) return NextResponse.json(fallbackMembers);
  const rows = await db.select().from(members);
  return NextResponse.json(rows);
}