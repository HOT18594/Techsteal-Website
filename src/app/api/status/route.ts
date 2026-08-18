import { NextResponse } from "next/server";
import { getServerStatus } from "@/lib/mcsrv";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await getServerStatus();
    return NextResponse.json(status);
  } catch (err) {
    console.error("status error", err);
    return NextResponse.json(
      { online: false, hostname: "unknown", source: "fallback" },
      { status: 500 }
    );
  }
}