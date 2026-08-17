import { NextResponse } from "next/server";
import { getServerStatus } from "@/lib/mcsrv";

// Always run at request time — status must be live, never cached at build.
export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getServerStatus();
  return NextResponse.json(status);
}
