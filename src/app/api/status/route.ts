import { NextResponse } from "next/server";
import { getLiveStatus } from "@/lib/live-status";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getLiveStatus();
  // Always 200 — clients branch on `source`, so a 500 here would just make
  // every caller handle two different shapes.
  return NextResponse.json(status);
}
