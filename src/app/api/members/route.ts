import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fallbackMembers } from "@/lib/fallback-data";
import { members } from "@/lib/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  if (!db) return NextResponse.json(fallbackMembers);

  const rows = await db.select().from(members).orderBy(members.id);
  return NextResponse.json(rows);
}
