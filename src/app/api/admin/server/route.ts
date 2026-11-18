import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { ACCOUNT_DB_ERROR_MESSAGE, requireAdminAccount } from "@/lib/accounts";
import { logAudit, type AuditAction } from "@/lib/audit";
import { getDb } from "@/lib/db";
import {
  exarotonAddPlayerListEntries,
  exarotonCommand,
  exarotonGetPlayerList,
  exarotonRemovePlayerListEntries,
  exarotonSetRam,
  exarotonShareLogs,
  getExarotonConfig,
} from "@/lib/exaroton";
import { isValidMcName } from "@/lib/mc-name";
import { isRateLimited } from "@/lib/rate-limit";
import { profiles } from "@/lib/schema";
import { getServerTelemetry, invalidateServerTelemetry } from "@/lib/server-telemetry";
import type { ServerPlayerListName } from "@/types";

export const dynamic = "force-dynamic";

const VALID_LISTS = new Set<ServerPlayerListName>([
  "whitelist",
  "ops",
  "banned-players",
]);

function parsePlayerList(raw: unknown): ServerPlayerListName | null {
  if (typeof raw !== "string") return null;
  return VALID_LISTS.has(raw as ServerPlayerListName)
    ? (raw as ServerPlayerListName)
    : null;
}

function listAuditAction(
  list: ServerPlayerListName,
  op: "add" | "remove"
): AuditAction {
  if (list === "whitelist") return op === "add" ? "whitelist_add" : "whitelist_remove";
  if (list === "ops") return op === "add" ? "ops_add" : "ops_remove";
  return op === "add" ? "banlist_add" : "banlist_remove";
}

export async function GET(request: NextRequest) {
  const gate = await requireAdminAccount();
  if (gate.status === "db_error") {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
  if (gate.status === "no") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  const rawList = request.nextUrl.searchParams.get("list");
  const list: ServerPlayerListName | null =
    rawList === null || rawList === "" ? "whitelist" : parsePlayerList(rawList);
  if (!list) {
    return NextResponse.json(
      { error: "Invalid player list. Use whitelist, ops, or banned-players." },
      { status: 400 }
    );
  }

  const configured = getExarotonConfig() !== null;
  const db = getDb();

  try {
    const [playerListResult, telemetry, linkedRows] = await Promise.all([
      configured
        ? exarotonGetPlayerList(list)
            .then((entries) => ({ entries, listError: null as string | null }))
            .catch((err: unknown) => {
              console.error("api/admin/server GET: playerlist failed", err);
              return {
                entries: [] as string[],
                listError: "Couldn't load that player list from Exaroton right now.",
              };
            })
        : Promise.resolve({
            entries: [] as string[],
            listError: "Exaroton credentials aren't configured on this deployment.",
          }),
      getServerTelemetry(),
      db
        ? db
            .select({
              id: profiles.id,
              username: profiles.username,
              minecraftUsername: profiles.minecraftUsername,
              discordVerified: profiles.discordVerified,
              avatarUrl: profiles.avatarUrl,
              role: profiles.role,
            })
            .from(profiles)
            .where(
              and(eq(profiles.banned, false), isNotNull(profiles.minecraftUsername))
            )
            .orderBy(asc(profiles.username))
        : Promise.resolve([]),
    ]);

    const verifiedMembers = linkedRows.flatMap((r) => {
      const mc = r.minecraftUsername?.trim() ?? "";
      if (!mc) return [];
      return [
        {
          id: r.id,
          username: r.username,
          minecraftUsername: mc,
          discordVerified: r.discordVerified,
          avatarUrl: r.avatarUrl ?? null,
          role: r.role === "admin" ? ("admin" as const) : ("member" as const),
        },
      ];
    });

    return NextResponse.json({
      configured,
      list,
      entries: playerListResult.entries,
      listError: playerListResult.listError,
      telemetry,
      verifiedMembers,
    });
  } catch (err) {
    console.error("api/admin/server GET: failed", err);
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireAdminAccount();
  if (gate.status === "db_error") {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
  if (gate.status === "no") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }
  const admin = gate.account;

  if (isRateLimited(`adminserver:${admin.id}`, 20, 60_000)) {
    return NextResponse.json(
      { error: "Slow down a little — too many server actions in a minute." },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;
  const action = typeof raw.action === "string" ? raw.action : "";

  if (
    action !== "command" &&
    action !== "ram" &&
    action !== "share_logs" &&
    action !== "playerlist_add" &&
    action !== "playerlist_remove" &&
    action !== "sync_whitelist"
  ) {
    return NextResponse.json({ error: "Unknown server action." }, { status: 400 });
  }

  // Validate action-specific inputs before hitting external services.
  if (action === "command") {
    if (typeof raw.command !== "string") {
      return NextResponse.json({ error: "Enter a console command." }, { status: 400 });
    }
    const rawTrimmed = raw.command.trim();
    const cleaned = rawTrimmed.replace(/^\/+/, "").trim();
    if (!cleaned || rawTrimmed.length > 240) {
      return NextResponse.json(
        { error: "Console commands must be between 1 and 240 characters." },
        { status: 400 }
      );
    }
    if (/[\r\n]/.test(cleaned)) {
      return NextResponse.json(
        { error: "Console commands must be a single line." },
        { status: 400 }
      );
    }
    if (!getExarotonConfig()) {
      return NextResponse.json(
        { error: "Exaroton server control isn't configured." },
        { status: 503 }
      );
    }

    try {
      await exarotonCommand(cleaned);
      invalidateServerTelemetry();
      await logAudit({
        actorId: admin.id,
        actorName: admin.username,
        action: "server_command",
        detail: cleaned.slice(0, 200),
      });
      return NextResponse.json({ ok: true });
    } catch (err) {
      console.error("api/admin/server POST command: failed", err);
      const msg = err instanceof Error ? err.message : "";
      if (/\b(400|409)\b/.test(msg)) {
        return NextResponse.json(
          { error: "Console commands can only run while the server is online." },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "Couldn't send that command to Exaroton right now." },
        { status: 502 }
      );
    }
  }

  if (action === "ram") {
    if (
      typeof raw.ramGb !== "number" ||
      !Number.isInteger(raw.ramGb) ||
      raw.ramGb < 2 ||
      raw.ramGb > 16
    ) {
      return NextResponse.json(
        { error: "RAM allocation must be a whole number between 2 and 16 GB." },
        { status: 400 }
      );
    }
    if (!getExarotonConfig()) {
      return NextResponse.json(
        { error: "Exaroton server control isn't configured." },
        { status: 503 }
      );
    }

    try {
      const ram = await exarotonSetRam(raw.ramGb);
      invalidateServerTelemetry();
      await logAudit({
        actorId: admin.id,
        actorName: admin.username,
        action: "server_ram",
        detail: `Allocated ${ram} GB RAM`,
      });
      return NextResponse.json({ ok: true, ramGb: ram });
    } catch (err) {
      console.error("api/admin/server POST ram: failed", err);
      const msg = err instanceof Error ? err.message : "";
      if (/\b(400|409)\b/.test(msg)) {
        return NextResponse.json(
          { error: "Stop the server before changing its RAM allocation." },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "Couldn't update server RAM on Exaroton right now." },
        { status: 502 }
      );
    }
  }

  if (action === "share_logs") {
    if (!getExarotonConfig()) {
      return NextResponse.json(
        { error: "Exaroton server control isn't configured." },
        { status: 503 }
      );
    }
    try {
      const { url, id } = await exarotonShareLogs();
      return NextResponse.json({ ok: true, url, id });
    } catch (err) {
      console.error("api/admin/server POST share_logs: failed", err);
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("No server log is available")) {
        return NextResponse.json(
          { error: "No server log is available to share right now." },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: "Couldn't upload the server log right now — try again in a moment." },
        { status: 502 }
      );
    }
  }

  if (action === "playerlist_add" || action === "playerlist_remove") {
    const list = parsePlayerList(raw.list);
    if (!list) {
      return NextResponse.json(
        { error: "Invalid player list. Use whitelist, ops, or banned-players." },
        { status: 400 }
      );
    }
    const username = typeof raw.username === "string" ? raw.username.trim() : "";
    if (!isValidMcName(username)) {
      return NextResponse.json(
        {
          error:
            "Enter a valid Minecraft username (1–16 letters, numbers, or underscores).",
        },
        { status: 400 }
      );
    }
    if (!getExarotonConfig()) {
      return NextResponse.json(
        { error: "Exaroton server control isn't configured." },
        { status: 503 }
      );
    }

    try {
      const entries =
        action === "playerlist_add"
          ? await exarotonAddPlayerListEntries(list, [username])
          : await exarotonRemovePlayerListEntries(list, [username]);
      await logAudit({
        actorId: admin.id,
        actorName: admin.username,
        action: listAuditAction(list, action === "playerlist_add" ? "add" : "remove"),
        targetName: username,
      });
      return NextResponse.json({ ok: true, entries });
    } catch (err) {
      console.error(`api/admin/server POST ${action}: failed`, err);
      return NextResponse.json(
        { error: "Couldn't update that player list on Exaroton right now." },
        { status: 502 }
      );
    }
  }

  // action === "sync_whitelist"
  const onlyVerified = raw.onlyVerified !== false;
  if (!getExarotonConfig()) {
    return NextResponse.json(
      { error: "Exaroton server control isn't configured." },
      { status: 503 }
    );
  }
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }

  let candidateRows: Array<{
    minecraftUsername: string | null;
    discordVerified: boolean;
    role: string;
  }>;
  try {
    candidateRows = await db
      .select({
        minecraftUsername: profiles.minecraftUsername,
        discordVerified: profiles.discordVerified,
        role: profiles.role,
      })
      .from(profiles)
      .where(and(eq(profiles.banned, false), isNotNull(profiles.minecraftUsername)));
  } catch (err) {
    console.error("api/admin/server POST sync_whitelist: DB read failed", err);
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }

  try {
    const current = await exarotonGetPlayerList("whitelist");
    const existingLower = new Set(current.map((name) => name.toLowerCase()));
    const missing: string[] = [];

    for (const row of candidateRows) {
      if (onlyVerified && !(row.discordVerified === true || row.role === "admin")) {
        continue;
      }
      const mc = row.minecraftUsername?.trim() ?? "";
      if (!isValidMcName(mc)) continue;
      const key = mc.toLowerCase();
      if (!existingLower.has(key)) {
        existingLower.add(key);
        missing.push(mc);
      }
    }

    const entries =
      missing.length > 0
        ? await exarotonAddPlayerListEntries("whitelist", missing)
        : current;

    await logAudit({
      actorId: admin.id,
      actorName: admin.username,
      action: "whitelist_sync",
      detail:
        missing.length > 0
          ? `Synced ${missing.length} player(s): ${missing.join(", ")}`
          : "Synced 0 player(s) — whitelist already up to date",
    });

    return NextResponse.json({ ok: true, added: missing, entries });
  } catch (err) {
    console.error("api/admin/server POST sync_whitelist: Exaroton failed", err);
    return NextResponse.json(
      { error: "Couldn't sync the whitelist with Exaroton right now." },
      { status: 502 }
    );
  }
}
