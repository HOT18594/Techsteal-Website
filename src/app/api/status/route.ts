import { NextResponse } from "next/server";
import { getServerStatus } from "@/lib/mcsrv";
import { getExarotonSnapshot } from "@/lib/exaroton";
import type { ServerStatus } from "@/types";

export const dynamic = "force-dynamic";

// Status pipeline: exaroton is the source of truth when configured (it
// knows about loading/starting states and the player list even before the
// server pings). If it's unreachable we fall back to a plain ping via
// mcsrvstat.us, and to placeholder data only when nothing answers — the
// UI treats `source: "fallback"` as "status unavailable", never as fact.

export async function GET() {
  // Preferred: exaroton (live panel state + credits).
  try {
    const snap = await getExarotonSnapshot();
    const status: ServerStatus = {
      online: snap.online,
      state: snap.state,
      stateLabel: snap.stateLabel,
      players: snap.players,
      max: snap.max,
      playerList: snap.playerList,
      version: snap.version ?? undefined,
      hostname: process.env.MINECRAFT_SERVER ?? undefined,
      serverName: snap.serverName,
      motd: snap.motd,
      software: snap.software,
      credits: snap.credits,
      source: "live",
    };
    return NextResponse.json(status);
  } catch {
    // fall through to the ping-based query
  }

  // Fallback: plain ping (works without exaroton credentials).
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
