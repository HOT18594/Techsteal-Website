import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { galleryItems } from "@/lib/schema";
import { fallbackGallery } from "@/lib/fallback-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  if (!db) return NextResponse.json(fallbackGallery);
  const rows = await db.select().from(galleryItems);
  return NextResponse.json(rows);
}