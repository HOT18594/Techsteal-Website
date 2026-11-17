import { NextResponse } from "next/server";
import { getRules } from "@/lib/content-data";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getRules());
}