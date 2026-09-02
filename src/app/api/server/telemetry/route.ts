import { NextResponse } from "next/server";
import { getServerTelemetry } from "@/lib/server-telemetry";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getServerTelemetry());
}
