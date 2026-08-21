import { NextResponse } from "next/server";
import { getServerStatus } from "@/lib/mcsrv";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await getServerStatus();
    return NextResponse.json(status);
  } catch (err) {
    console.error("status error", err);
    // 200 + source: "fallback" — clients already branch on `source`, so a
    // 500 here would just make every caller handle two different shapes.
    return NextResponse.json(
      { online: false, hostname: "unknown", source: "fallback" },
      { status: 200 }
    );
  }
}