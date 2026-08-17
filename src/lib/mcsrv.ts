// Minecraft server status via mcsrvstat.us (free, no API key).
// Falls back to placeholder data if the public API is unreachable so the
// site never shows a broken state.

import type { ServerStatus } from "../types";
import { siteConfig } from "./site";

interface McsrPlayerListEntry {
  name: string;
  uuid: string;
}

interface McsrResponse {
  online: boolean;
  version?: string;
  players?: {
    online?: number;
    max?: number;
    list?: McsrPlayerListEntry[];
  };
}

export async function getServerStatus(): Promise<ServerStatus> {
  const host = process.env.MINECRAFT_SERVER ?? siteConfig.address;
  const port = process.env.MINECRAFT_PORT;
  const url = `https://api.mcsrvstat.us/3/${host}${port ? `?port=${port}` : ""}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`mcsrvstat.us returned ${res.status}`);
    const data = (await res.json()) as McsrResponse;

    if (!data.online) {
      return { online: false, hostname: host, source: "live" };
    }

    return {
      online: true,
      players: data.players?.online ?? 0,
      max: data.players?.max ?? siteConfig.maxPlayers,
      playerList: Array.isArray(data.players?.list)
        ? data.players.list.map((p) => p.name)
        : [],
      version: data.version ?? siteConfig.version,
      hostname: host,
      source: "live",
    };
  } catch {
    return {
      online: true,
      players: 2,
      max: siteConfig.maxPlayers,
      playerList: ["Alex", "Sam"],
      version: siteConfig.version,
      hostname: host,
      source: "fallback",
    };
  }
}
