import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { fallbackGallery } from "@/lib/fallback-data";
import { galleryItems } from "@/lib/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  if (!db) return NextResponse.json(fallbackGallery);

  const rows = await db.select().from(galleryItems).orderBy(galleryItems.id);
  return NextResponse.json(rows);
}
