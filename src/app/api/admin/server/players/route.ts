import { NextRequest, NextResponse } from "next/server";
import { ACCOUNT_DB_ERROR_MESSAGE, requireAdminAccount } from "@/lib/accounts";
import {
  exarotonGetFileInfo,
  exarotonReadFileText,
  getExarotonConfig,
  getExarotonSnapshot,
} from "@/lib/exaroton";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface UserCacheEntry {
  name?: string;
  uuid?: string;
  expiresOn?: string;
}

interface OpEntry {
  uuid?: string;
  name?: string;
  level?: number;
  bypassesPlayerLimit?: boolean;
}

interface BanEntry {
  uuid?: string;
  name?: string;
  created?: string;
  source?: string;
  expires?: string;
  reason?: string;
}

export interface ServerPlayerRecord {
  uuid: string;
  name: string;
  online: boolean;
  isOp: boolean;
  opLevel: number | null;
  isBanned: boolean;
  banReason: string | null;
  hasPlayerdata: boolean;
  playerdataBytes: number | null;
  hasStats: boolean;
  hasAdvancements: boolean;
  expiresOn: string | null;
}

async function readJsonSafe<T>(path: string): Promise<T | null> {
  try {
    const text = await exarotonReadFileText(path, 512_000);
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function prettyMcKey(raw: string): string {
  return raw
    .replace(/^minecraft:/, "")
    .replace(/^[a-z0-9_.-]+:/, "")
    .replace(/[/_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function topEntries(
  record: Record<string, unknown> | undefined,
  limit = 8
): Array<{ id: string; label: string; count: number }> {
  if (!record || typeof record !== "object") return [];
  return Object.entries(record)
    .filter(([, v]) => typeof v === "number" && v > 0)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, limit)
    .map(([id, count]) => ({
      id,
      label: prettyMcKey(id),
      count: count as number,
    }));
}

function sumValues(record: Record<string, unknown> | undefined): number {
  if (!record || typeof record !== "object") return 0;
  let total = 0;
  for (const v of Object.values(record)) {
    if (typeof v === "number" && Number.isFinite(v)) total += v;
  }
  return total;
}

export async function GET(request: NextRequest) {
  const gate = await requireAdminAccount();
  if (gate.status === "db_error") {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
  if (gate.status === "no") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }
  if (!getExarotonConfig()) {
    return NextResponse.json({ error: "Exaroton is not configured." }, { status: 503 });
  }

  const rawUuid = request.nextUrl.searchParams.get("uuid")?.trim().toLowerCase() ?? "";

  // Detail mode: return parsed stats + advancements for a specific player UUID
  if (rawUuid) {
    if (!UUID_RE.test(rawUuid)) {
      return NextResponse.json({ error: "Invalid player UUID." }, { status: 400 });
    }
    const [statsJson, advJson] = await Promise.all([
      readJsonSafe<{ stats?: Record<string, Record<string, number>> }>(`world/stats/${rawUuid}.json`),
      readJsonSafe<Record<string, { done?: boolean; criteria?: Record<string, string> }>>(
        `world/advancements/${rawUuid}.json`
      ),
    ]);

    const custom = statsJson?.stats?.["minecraft:custom"] ?? {};
    const mined = statsJson?.stats?.["minecraft:mined"] ?? {};
    const killed = statsJson?.stats?.["minecraft:killed"] ?? {};
    const crafted = statsJson?.stats?.["minecraft:crafted"] ?? {};

    const playTimeTicks =
      typeof custom["minecraft:play_time"] === "number"
        ? custom["minecraft:play_time"]
        : typeof custom["minecraft:play_one_minute"] === "number"
          ? custom["minecraft:play_one_minute"]
          : 0;

    const completedAdv: Array<{ id: string; label: string; completedAt: string | null }> = [];
    let totalAdv = 0;
    if (advJson && typeof advJson === "object") {
      for (const [key, entry] of Object.entries(advJson)) {
        if (key === "DataVersion" || key.includes(":recipes/") || !entry || typeof entry !== "object") {
          continue;
        }
        totalAdv += 1;
        if (entry.done) {
          const timestamps = entry.criteria ? Object.values(entry.criteria).filter(Boolean).sort() : [];
          completedAdv.push({
            id: key,
            label: prettyMcKey(key.split("/").pop() ?? key),
            completedAt: timestamps[timestamps.length - 1] ?? null,
          });
        }
      }
    }
    completedAdv.sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));

    return NextResponse.json(
      {
        uuid: rawUuid,
        hasStats: Boolean(statsJson?.stats),
        hasAdvancements: Boolean(advJson),
        summary: {
          playTimeMinutes: Math.round(playTimeTicks / 1200),
          deaths: custom["minecraft:deaths"] ?? 0,
          mobKills: custom["minecraft:mob_kills"] ?? 0,
          playerKills: custom["minecraft:player_kills"] ?? 0,
          damageDealt: Math.round((custom["minecraft:damage_dealt"] ?? 0) / 10),
          damageTaken: Math.round((custom["minecraft:damage_taken"] ?? 0) / 10),
          jumps: custom["minecraft:jump"] ?? 0,
          distanceWalkedMeters: Math.round((custom["minecraft:walk_one_cm"] ?? 0) / 100),
          distanceSprintedMeters: Math.round((custom["minecraft:sprint_one_cm"] ?? 0) / 100),
          distanceFlownMeters: Math.round(
            ((custom["minecraft:aviate_one_cm"] ?? 0) + (custom["minecraft:fly_one_cm"] ?? 0)) / 100
          ),
          timeSinceDeathMinutes: Math.round((custom["minecraft:time_since_death"] ?? 0) / 1200),
          totalMined: sumValues(mined),
          totalCrafted: sumValues(crafted),
          advancementsCompleted: completedAdv.length,
          advancementsTotal: totalAdv,
        },
        topMined: topEntries(mined, 8),
        topKilled: topEntries(killed, 8),
        recentAdvancements: completedAdv.slice(0, 12),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  // Roster mode: aggregate usercache, ops, bans, playerdata/stats/advancements dirs, and live snapshot
  const [usercache, ops, bans, playerdataDir, statsDir, advDir, snap] = await Promise.all([
    readJsonSafe<UserCacheEntry[]>("usercache.json"),
    readJsonSafe<OpEntry[]>("ops.json"),
    readJsonSafe<BanEntry[]>("banned-players.json"),
    exarotonGetFileInfo("world/playerdata").catch(() => null),
    exarotonGetFileInfo("world/stats").catch(() => null),
    exarotonGetFileInfo("world/advancements").catch(() => null),
    getExarotonSnapshot().catch(() => null),
  ]);

  const byUuid = new Map<string, ServerPlayerRecord>();
  const onlineLower = new Set((snap?.playerList ?? []).map((n) => n.toLowerCase()));

  const ensure = (uuidRaw: string, nameFallback?: string): ServerPlayerRecord => {
    const uuid = uuidRaw.toLowerCase();
    let rec = byUuid.get(uuid);
    if (!rec) {
      rec = {
        uuid,
        name: nameFallback || uuid.slice(0, 8),
        online: false,
        isOp: false,
        opLevel: null,
        isBanned: false,
        banReason: null,
        hasPlayerdata: false,
        playerdataBytes: null,
        hasStats: false,
        hasAdvancements: false,
        expiresOn: null,
      };
      byUuid.set(uuid, rec);
    } else if (nameFallback && (rec.name === uuid.slice(0, 8) || !rec.name)) {
      rec.name = nameFallback;
    }
    return rec;
  };

  for (const entry of Array.isArray(usercache) ? usercache : []) {
    if (!entry?.uuid || !UUID_RE.test(entry.uuid)) continue;
    const rec = ensure(entry.uuid, entry.name);
    if (entry.name) rec.name = entry.name;
    if (entry.expiresOn) rec.expiresOn = entry.expiresOn;
  }

  for (const op of Array.isArray(ops) ? ops : []) {
    if (!op?.uuid || !UUID_RE.test(op.uuid)) continue;
    const rec = ensure(op.uuid, op.name);
    rec.isOp = true;
    rec.opLevel = typeof op.level === "number" ? op.level : 4;
  }

  for (const ban of Array.isArray(bans) ? bans : []) {
    if (!ban?.uuid || !UUID_RE.test(ban.uuid)) continue;
    const rec = ensure(ban.uuid, ban.name);
    rec.isBanned = true;
    rec.banReason = ban.reason || "Banned";
  }

  for (const file of playerdataDir?.children ?? []) {
    if (!file.name.endsWith(".dat")) continue;
    const uuid = file.name.slice(0, -4);
    if (!UUID_RE.test(uuid)) continue;
    const rec = ensure(uuid);
    rec.hasPlayerdata = true;
    rec.playerdataBytes = typeof file.size === "number" ? file.size : null;
  }

  for (const file of statsDir?.children ?? []) {
    if (!file.name.endsWith(".json")) continue;
    const uuid = file.name.slice(0, -5);
    if (!UUID_RE.test(uuid)) continue;
    ensure(uuid).hasStats = true;
  }

  for (const file of advDir?.children ?? []) {
    if (!file.name.endsWith(".json")) continue;
    const uuid = file.name.slice(0, -5);
    if (!UUID_RE.test(uuid)) continue;
    ensure(uuid).hasAdvancements = true;
  }

  const players = [...byUuid.values()]
    .map((p) => ({
      ...p,
      online: onlineLower.has(p.name.toLowerCase()),
    }))
    .sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1;
      if (a.isOp !== b.isOp) return a.isOp ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

  return NextResponse.json(
    {
      onlineNow: snap?.playerList ?? [],
      serverOnline: Boolean(snap?.online),
      players,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
