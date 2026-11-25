import { NextRequest, NextResponse } from "next/server";
import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { isRateLimited, rateLimitIp } from "@/lib/rate-limit";
import { serverCommandLogs } from "@/lib/schema";
import { getLastCommandSyncAt, syncServerCommands } from "@/lib/server-commands";
import type {
  PublicCommandsResponse,
  PublicServerCommand,
  ServerCommandSeverity,
  ServerCommandSource,
  ServerCommandType,
} from "@/types";

export const dynamic = "force-dynamic";

const VALID_TYPES = new Set<string>([
  "all",
  "flagged",
  "gamemode",
  "give",
  "effect",
  "teleport",
  "operator",
  "world",
  "trigger",
  "other",
]);

function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Public, read-only anti-cheat command ledger.
 * Returns every archived server/player command forever — never exposes IPs,
 * emails, private whispers, or internal account IDs.
 * No DELETE or mutation handler exists by design.
 */
export async function GET(request: NextRequest) {
  if (isRateLimited(`commands:${rateLimitIp(request)}`, 60, 60_000)) {
    return NextResponse.json(
      { error: "Too many requests — try again in a moment." },
      { status: 429 }
    );
  }

  const sp = request.nextUrl.searchParams;
  const rawType = (sp.get("type") ?? "all").trim().toLowerCase();
  const typeFilter = VALID_TYPES.has(rawType) ? rawType : "all";
  const actorFilter = (sp.get("actor") ?? "").trim().slice(0, 48);
  const query = (sp.get("q") ?? "").trim().slice(0, 100);
  const page = Math.max(1, Math.min(500, Number.parseInt(sp.get("page") ?? "1", 10) || 1));
  const limit = Math.max(10, Math.min(100, Number.parseInt(sp.get("limit") ?? "50", 10) || 50));
  const forceSync = sp.get("sync") === "1";

  // Refresh from Exaroton (cooldown-throttled) before reading so visitors see fresh commands
  const syncResult = await syncServerCommands({ force: forceSync }).catch(() => ({
    inserted: 0,
    parsed: 0,
    syncedAt: getLastCommandSyncAt(),
  }));

  const db = getDb();
  if (!db) {
    const empty: PublicCommandsResponse = {
      entries: [],
      stats: {
        total: 0,
        flagged: 0,
        gamemode: 0,
        give: 0,
        effect: 0,
        teleport: 0,
        operator: 0,
        uniqueActors: 0,
      },
      actors: [],
      lastSyncedAt: syncResult.syncedAt,
      dbConnected: false,
      pagination: { page, limit, total: 0, hasMore: false },
    };
    return NextResponse.json(empty, { headers: { "Cache-Control": "no-store" } });
  }

  const conditions = [];
  if (typeFilter === "flagged") {
    conditions.push(inArray(serverCommandLogs.severity, ["critical", "high"]));
  } else if (typeFilter !== "all") {
    conditions.push(eq(serverCommandLogs.commandType, typeFilter));
  }
  if (actorFilter) {
    conditions.push(eq(serverCommandLogs.actor, actorFilter));
  }
  if (query) {
    const pat = `%${escapeLike(query)}%`;
    conditions.push(
      or(
        ilike(serverCommandLogs.summary, pat),
        ilike(serverCommandLogs.actor, pat),
        ilike(serverCommandLogs.commandType, pat)
      )
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const offset = (page - 1) * limit;

  try {
    const [rows, [filteredCount], [statsRow], actorRows] = await Promise.all([
      db
        .select({
          id: serverCommandLogs.id,
          actor: serverCommandLogs.actor,
          actorSource: serverCommandLogs.actorSource,
          commandType: serverCommandLogs.commandType,
          severity: serverCommandLogs.severity,
          summary: serverCommandLogs.summary,
          logTime: serverCommandLogs.logTime,
          occurredAt: serverCommandLogs.occurredAt,
        })
        .from(serverCommandLogs)
        .where(whereClause)
        .orderBy(desc(serverCommandLogs.occurredAt), desc(serverCommandLogs.id))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(serverCommandLogs)
        .where(whereClause),
      db
        .select({
          total: count(),
          flagged: sql<number>`count(*) filter (where ${serverCommandLogs.severity} in ('critical', 'high'))::int`,
          gamemode: sql<number>`count(*) filter (where ${serverCommandLogs.commandType} = 'gamemode')::int`,
          give: sql<number>`count(*) filter (where ${serverCommandLogs.commandType} = 'give')::int`,
          effect: sql<number>`count(*) filter (where ${serverCommandLogs.commandType} = 'effect')::int`,
          teleport: sql<number>`count(*) filter (where ${serverCommandLogs.commandType} = 'teleport')::int`,
          operator: sql<number>`count(*) filter (where ${serverCommandLogs.commandType} = 'operator')::int`,
          uniqueActors: sql<number>`count(distinct ${serverCommandLogs.actor})::int`,
        })
        .from(serverCommandLogs),
      db
        .selectDistinct({ actor: serverCommandLogs.actor })
        .from(serverCommandLogs)
        .orderBy(serverCommandLogs.actor)
        .limit(100),
    ]);

    const entries: PublicServerCommand[] = rows.map((r) => ({
      id: r.id,
      actor: r.actor,
      actorSource: (r.actorSource as ServerCommandSource) || "ingame",
      commandType: (r.commandType as ServerCommandType) || "other",
      severity: (r.severity as ServerCommandSeverity) || "normal",
      summary: r.summary,
      logTime: r.logTime,
      occurredAt: r.occurredAt.toISOString(),
    }));

    const total = Number(filteredCount?.total ?? 0);
    const payload: PublicCommandsResponse = {
      entries,
      stats: {
        total: Number(statsRow?.total ?? 0),
        flagged: Number(statsRow?.flagged ?? 0),
        gamemode: Number(statsRow?.gamemode ?? 0),
        give: Number(statsRow?.give ?? 0),
        effect: Number(statsRow?.effect ?? 0),
        teleport: Number(statsRow?.teleport ?? 0),
        operator: Number(statsRow?.operator ?? 0),
        uniqueActors: Number(statsRow?.uniqueActors ?? 0),
      },
      actors: actorRows.map((a) => a.actor).filter(Boolean),
      lastSyncedAt: syncResult.syncedAt,
      dbConnected: true,
      pagination: {
        page,
        limit,
        total,
        hasMore: offset + entries.length < total,
      },
    };

    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("api/commands GET: failed", err);
    return NextResponse.json(
      { error: "Couldn't load the command log right now." },
      { status: 503 }
    );
  }
}
