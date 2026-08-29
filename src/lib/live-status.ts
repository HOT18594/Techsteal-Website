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

// Short shared cache: a single page view fans out to /api/status several
// times (navbar pill, home tile, Status page) plus /api/members and Chatty's
// tools — each of those used to hit exaroton/mcsrvstat again. Upstream
// rate-limits then answer 429 and the status flickers "Offline". 15s keeps
// sections consistent and well under any rate limit; in-flight requests are
// shared so even a cold burst is ONE upstream call.
const CACHE_MS = 15_000;
let cache: { at: number; promise: Promise<ServerStatus> } | null = null;

export function getLiveStatus(): Promise<ServerStatus> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.promise;
  const promise = fetchLiveStatus();
  cache = { at: now, promise };
  // A rejected fetch must not poison the window — drop it so the next
  // caller retries. (fetchLiveStatus resolves, never rejects; belt & braces.)
  promise.catch(() => {
    if (cache?.promise === promise) cache = null;
  });
  return promise;
}

async function fetchLiveStatus(): Promise<ServerStatus> {
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
      // The public address players type into Minecraft — the same value every
      // other branch and the Connection card report. MINECRAFT_SERVER is the
      // exaroton *panel* identifier, which isn't always the join address, so
      // the two sources could disagree about what to connect to.
      hostname: process.env.MINECRAFT_SERVER ?? siteConfig.address,
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
