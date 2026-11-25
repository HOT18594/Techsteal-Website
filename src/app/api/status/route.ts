import { NextResponse } from "next/server";
import { getLiveStatus } from "@/lib/live-status";
import { syncServerCommands } from "@/lib/server-commands";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getLiveStatus();
  // Quietly archive live server commands every 2 minutes while the realm is
  // online so commands are captured permanently even between /commands visits.
  if (status.source === "live" && status.online) {
    void syncServerCommands({ minIntervalMs: 120_000 });
  }
  // Always 200 — clients branch on `source`, so a 500 here would just make
  // every caller handle two different shapes.
  return NextResponse.json(status);
}
