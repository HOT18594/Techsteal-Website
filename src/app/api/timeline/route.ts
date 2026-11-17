import { NextResponse } from "next/server";
import { getTimeline } from "@/lib/content-data";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getTimeline());
}