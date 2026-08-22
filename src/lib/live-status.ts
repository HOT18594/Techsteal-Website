// Single source of truth for live server status: Exaroton's panel API is
// the source of truth when configured (its player list is always accurate;
// ping-based lists are often empty), falling back to a plain ping via
// mcsrvstat.us, then to placeholder data. Everything that wants to know
// "who is online right now" — /api/status, /api/members, Chatty Jr.'s
// tools — goes through here so all sections agree.

import type { ServerStatus } from "@/types";
import { getExarotonSnapshot } from "./exaroton";
import { getServerStatus } from "./mcsrv";
import { siteConfig } from "./site";

export async function getLiveStatus(): Promise<ServerStatus> {
  // Preferred: exaroton panel state.
  try {
    const snap = await getExarotonSnapshot();
    return {
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
      source: "live",
    };
  } catch {
    // not configured or unreachable — fall through to the ping query
  }

  // Fallback: plain server ping.
  try {
    return await getServerStatus();
  } catch {
    // Nothing answered. We don't know the true state, so never fabricate a
    // player list or claim the server is online — callers treat
    // `source !== "live"` as "status unavailable".
    return {
      online: false,
      players: 0,
      max: siteConfig.maxPlayers,
      playerList: [],
      version: siteConfig.version,
      hostname: siteConfig.address,
      source: "fallback",
    };
  }
}
