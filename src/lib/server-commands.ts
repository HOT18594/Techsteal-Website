// Permanent Public Anti-Cheat Command Ledger engine.
//
// Parses EVERY player/operator/console command from Exaroton server logs
// (gamemode changes, /give, /effect, /tp, /op, /enchant, /summon, /fill, /xp,
// /item, /attribute, /trigger, console commands, etc.) and persists them into
// the append-only `server_command_logs` PostgreSQL table so they remain visible
// publicly forever — even after Exaroton rotates logs on server restart.
//
// Security & privacy guarantees:
// - Strictly strips ANSI sequences, control chars, Bearer tokens, and IPv4/IPv6.
// - Never ingests private whisper commands (/msg, /tell, /w, /teammsg, /tm).
// - Append-only: no delete or edit operations exist.

import { createHash } from "node:crypto";
import { getDb } from "./db";
import { exarotonGetLogs, getExarotonConfig } from "./exaroton";
import { serverCommandLogs } from "./schema";
import type {
  ServerCommandSeverity,
  ServerCommandSource,
  ServerCommandType,
} from "@/types";

const SYNC_COOLDOWN_MS = 30_000;
const FORCE_SYNC_FLOOR_MS = 10_000;

let lastSyncAt = 0;
let lastSyncedIso: string | null = null;
let inFlightSync: Promise<{ inserted: number; parsed: number; syncedAt: string | null }> | null = null;

/** Non-player / mod bracket prefixes that are NOT Minecraft admin command broadcasts. */
const IGNORED_BRACKET_ACTORS = new Set([
  "stdout",
  "stderr",
  "discord",
  "servercore",
  "spark",
  "fabric",
  "mixin",
  "luckperms",
  "nochatreports",
  "dcintegration",
  "discordintegration",
  "lifesteal",
  "jade",
  "jei",
  "lithium",
  "ferritecore",
  "krypton",
  "ftb",
  "cloth",
  "skinrestorer",
  "alternate-current",
  "watchdog",
]);

/** Private player-to-player DM commands that should not be exposed publicly. */
const PRIVATE_DM_CMD_RE = /^\/?(?:msg|tell|w|whisper|teammsg|tm|r|reply)\b/i;

export function sanitizeCommandLine(line: string): string {
  return line
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/(authorization\s*:\s*bearer\s+)[^\s]+/gi, "$1[hidden]")
    .replace(/\b(?:[0-9a-fA-F]{1,4}:){5,7}[0-9a-fA-F]{1,4}\b|[0-9a-fA-F:]*::[0-9a-fA-F:.]+/g, "[ip]")
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d{1,5})?\b/g, "[ip]")
    .trim();
}

export function classifyServerCommand(text: string): {
  commandType: ServerCommandType;
  severity: ServerCommandSeverity;
} {
  const s = text.trim();
  const lower = s.toLowerCase();

  // Gamemode switches (slash command or Minecraft feedback)
  if (
    /^\/?(?:gamemode|gm[csap0-3]?|defaultgamemode)\b/i.test(s) ||
    /\bgame\s*mode\b/i.test(lower)
  ) {
    return { commandType: "gamemode", severity: "critical" };
  }

  // Give / item / loot / clear
  if (
    /^\/?(?:give|item|loot)\b/i.test(s) ||
    /^(?:gave\s+\d+|replaced\s+a\s+slot|modified\s+item|dropped\s+\d+\s+item)/i.test(s) &&
      !/experience/i.test(lower)
  ) {
    return { commandType: "give", severity: "critical" };
  }
  if (
    /^\/?clear\b/i.test(s) ||
    /^(?:removed\s+\d+\s+item|cleared\s+the\s+inventory)/i.test(s)
  ) {
    return { commandType: "give", severity: "high" };
  }

  // Effect / enchant / attribute / damage / xp
  if (
    /^\/?(?:effect|enchant|attribute|damage)\b/i.test(s) ||
    /^(?:applied\s+effect|removed\s+(?:every\s+)?effect|applied\s+enchantment|enchanted\b|base\s+value\s+of\s+attribute|added\s+modifier|applied\s+[\d.]+\s+damage)/i.test(s)
  ) {
    return { commandType: "effect", severity: "critical" };
  }
  if (
    /^\/?(?:xp|experience)\b/i.test(s) ||
    /^(?:gave\s+\d+\s+experience|set\s+\d+\s+experience)/i.test(s)
  ) {
    return { commandType: "effect", severity: "high" };
  }

  // Teleport / spreadplayers
  if (
    /^\/?(?:tp|teleport|spreadplayers)\b/i.test(s) ||
    /^(?:teleported\b|spread\s+\d+)/i.test(s)
  ) {
    return { commandType: "teleport", severity: "high" };
  }

  // Operator / whitelist / ban / kick / pardon
  if (
    /^\/?(?:op|deop)\b/i.test(s) ||
    /^made\s+\S+\s+(?:a\s+server\s+operator|no\s+longer\s+a\s+server\s+operator)/i.test(s)
  ) {
    return { commandType: "operator", severity: "critical" };
  }
  if (
    /^\/?(?:ban|ban-ip|pardon|pardon-ip|kick|whitelist)\b/i.test(s) ||
    /^(?:banned\b|unbanned\b|kicked\b|added\s+\S+\s+to\s+the\s+whitelist|removed\s+\S+\s+from\s+the\s+whitelist|turned\s+(?:on|off)\s+the\s+whitelist)/i.test(s)
  ) {
    return { commandType: "operator", severity: "normal" };
  }

  // World editing / summon / kill / execute / gamerule / difficulty / time / weather
  if (
    /^\/?(?:fill|setblock|clone|summon|execute|function|data|scoreboard|tag|team|advancement|recipe|ride|fillbiome|place)\b/i.test(s) ||
    /^(?:changed\s+the\s+block|successfully\s+filled|cloned\s+\d+|summoned\s+new|modified\s+entity\s+data|modified\s+block\s+data|granted\s+the\s+advancement|revoked\s+the\s+advancement)/i.test(s)
  ) {
    return { commandType: "world", severity: "critical" };
  }
  if (
    /^\/?(?:kill|gamerule|difficulty|worldborder|forceload)\b/i.test(s) ||
    /^(?:killed\b|gamerule\s+\S+\s+is\s+now\s+set|the\s+difficulty\s+has\s+been\s+set|the\s+world\s+border)/i.test(s)
  ) {
    return { commandType: "world", severity: "high" };
  }
  if (
    /^\/?(?:time|weather|setworldspawn|spawnpoint)\b/i.test(s) ||
    /^(?:set\s+the\s+time|set\s+the\s+weather|set\s+the\s+world\s+spawn|set\s+spawn\s+point)/i.test(s)
  ) {
    return { commandType: "world", severity: "normal" };
  }

  // Trigger commands (e.g. Strength SMP / datapack triggers)
  if (/^\/?trigger\b/i.test(s) || /^triggered\s+\[/i.test(s)) {
    return { commandType: "trigger", severity: "normal" };
  }

  // Lifesteal / Strength / mod admin commands
  if (/^\/?(?:lifesteal|ls|hearts?|revive|withdraw|strength)\b/i.test(s)) {
    return { commandType: "effect", severity: "high" };
  }

  return { commandType: "other", severity: "normal" };
}

/** Matches direct unbracketed console outputs when a command is run from the Exaroton web console. */
const UNBRACKETED_CONSOLE_PATTERNS: RegExp[] = [
  /^Set (?:own|[A-Za-z0-9_]{1,16}'s) game mode to /i,
  /^Your game mode has been updated to /i,
  /^Gave \d+ (?:\[.+?\]|experience)/i,
  /^Applied effect .+ to /i,
  /^Removed (?:every )?effect/i,
  /^Teleported .+ to /i,
  /^Made [A-Za-z0-9_]{1,16} (?:a server operator|no longer a server operator)/i,
  /^Applied enchantment .+ to /i,
  /^Replaced a slot on /i,
  /^Removed \d+ items? from player /i,
  /^Cleared the inventory of /i,
  /^Summoned new /i,
  /^Killed (?:[A-Za-z0-9_]{1,16}|\d+ entit)/i,
  /^Changed the block at /i,
  /^Successfully filled \d+ blocks?/i,
  /^Set the time to /i,
  /^Set the weather to /i,
  /^Gamerule .+ is now set to:/i,
  /^The difficulty has been set to /i,
  /^Base value of attribute /i,
  /^Applied [\d.]+ damage to /i,
  /^Added [A-Za-z0-9_]{1,16} to the whitelist/i,
  /^Removed [A-Za-z0-9_]{1,16} from the whitelist/i,
  /^Banned [A-Za-z0-9_]{1,16}:/i,
  /^Unbanned [A-Za-z0-9_]{1,16}/i,
  /^Kicked [A-Za-z0-9_]{1,16}:/i,
  /^Triggered \[.+?\]/i,
];

interface ParsedLogCommand {
  fingerprint: string;
  actor: string;
  actorSource: ServerCommandSource;
  commandType: ServerCommandType;
  severity: ServerCommandSeverity;
  summary: string;
  rawLine: string;
  logTime: string;
  occurredAt: Date;
}

function parseHmsSeconds(hms: string): number | null {
  const m = hms.match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const s = Number(m[3]);
  if (h > 23 || min > 59 || s > 59) return null;
  return h * 3600 + min * 60 + s;
}

/**
 * Parse every command execution event from an Exaroton Minecraft server log.
 * Produces deterministic fingerprints so re-ingesting the same log is 100% idempotent.
 */
export function parseExarotonLogCommands(logContent: string, now = new Date()): ParsedLogCommand[] {
  const lines = logContent.split(/\r?\n/);
  // Build a stable session boot signature from the first 3 timestamped lines
  const bootLines: string[] = [];
  let lastLogSec: number | null = null;
  let dayRollovers = 0;
  let prevSec: number | null = null;

  for (const raw of lines) {
    const clean = sanitizeCommandLine(raw);
    const tsMatch = clean.match(/^\[(\d{2}:\d{2}:\d{2})\]/);
    if (tsMatch) {
      if (bootLines.length < 3) bootLines.push(clean.slice(0, 140));
      const sec = parseHmsSeconds(tsMatch[1]);
      if (sec !== null) {
        if (prevSec !== null && sec + 3600 < prevSec) {
          dayRollovers += 1;
        }
        prevSec = sec;
        lastLogSec = sec;
      }
    }
  }

  const sessionKey = createHash("sha256")
    .update(bootLines.join("\n") || "default-session")
    .digest("hex")
    .slice(0, 16);

  // Anchor the end of the log to `now` (UTC day of the last timestamped line)
  const nowUtcMidnightMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  const nowSecOfDay =
    now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
  // If the last line's HH:MM:SS is significantly ahead of current UTC time,
  // Exaroton's container timezone or yesterday's log may be offset — clamp to <= now.
  let endDayBaseMs = nowUtcMidnightMs;
  if (lastLogSec !== null && lastLogSec > nowSecOfDay + 300) {
    endDayBaseMs -= 86_400_000;
  }
  const startDayBaseMs = endDayBaseMs - dayRollovers * 86_400_000;

  const results: ParsedLogCommand[] = [];
  const dupCounter = new Map<string, number>();
  let curDayOffset = 0;
  let curPrevSec: number | null = null;

  const pushEntry = (
    actor: string,
    actorSource: ServerCommandSource,
    summary: string,
    rawLine: string,
    logTime: string,
    occurredAt: Date
  ) => {
    const trimmedSummary = summary.trim().slice(0, 400);
    if (!trimmedSummary) return;
    if (PRIVATE_DM_CMD_RE.test(trimmedSummary)) return;
    if (/\bwhispers? to\b|\bwhispered to\b/i.test(trimmedSummary)) return;

    const baseKey = `${sessionKey}|${logTime}|${actor.toLowerCase()}|${trimmedSummary}`;
    const seq = (dupCounter.get(baseKey) ?? 0) + 1;
    dupCounter.set(baseKey, seq);

    const fingerprint = createHash("sha256")
      .update(`${baseKey}|#${seq}`)
      .digest("hex");

    const { commandType, severity } = classifyServerCommand(trimmedSummary);
    results.push({
      fingerprint,
      actor: actor.slice(0, 48),
      actorSource,
      commandType,
      severity,
      summary: trimmedSummary,
      rawLine: rawLine.slice(0, 500),
      logTime,
      occurredAt,
    });
  };

  for (const raw of lines) {
    const clean = sanitizeCommandLine(raw);
    if (!clean) continue;

    // Match standard Minecraft log header: [HH:MM:SS] [Thread/LEVEL]: Message
    const header = clean.match(/^\[(\d{2}:\d{2}:\d{2})\] \[([^\]]+)\]: (.+)$/);
    if (!header) continue;

    const logTime = header[1];
    const threadLevel = header[2];
    const message = header[3];

    const sec = parseHmsSeconds(logTime);
    if (sec !== null) {
      if (curPrevSec !== null && sec + 3600 < curPrevSec) {
        curDayOffset += 1;
      }
      curPrevSec = sec;
    }

    // Only inspect Server thread / RCON / Console info lines (never Discord bridge, JDA, Netty, or chat)
    if (!/(?:Server thread|RCON|Console)/i.test(threadLevel)) continue;
    if (/^\[(?:STDOUT|STDERR|DISCORD)\]/i.test(message)) continue;
    if (/^(?:<[^>]+>|JSON(?:-Element)?:)/i.test(message)) continue;

    const occurredAt =
      sec !== null
        ? new Date(Math.min(now.getTime(), startDayBaseMs + curDayOffset * 86_400_000 + sec * 1000))
        : now;

    // Pattern 1: Standard Minecraft admin/operator command broadcast: [Actor: Message]
    // Examples:
    //   [AstralGaming: Gave 3 [Shulker Box] to AstralGaming]
    //   [Steve: Set own game mode to Creative Mode]
    //   [ScienceGeek1100: Triggered [Withdraw_Strength] (added 10 to value)]
    //   [Server: Applied effect Strength to Steve]
    const bracketMatch = message.match(/^\[([A-Za-z0-9_@]{1,20}): (.+)\]$/);
    if (bracketMatch) {
      const actor = bracketMatch[1];
      const actionText = bracketMatch[2].trim();
      if (IGNORED_BRACKET_ACTORS.has(actor.toLowerCase())) continue;
      const source: ServerCommandSource =
        actor === "Server" || actor === "Rcon" || actor === "Console"
          ? "server_console"
          : "ingame";
      pushEntry(actor, source, actionText, clean, logTime, occurredAt);
      continue;
    }

    // Pattern 2: Explicit slash command log (Paper / Fabric command logger mods)
    // Examples:
    //   Steve issued server command: /give Steve diamond 64
    //   Steve ran command: /gamemode creative
    const issuedMatch = message.match(
      /^([A-Za-z0-9_]{1,16}) (?:issued server command|ran command|executed command): (\/.+)$/i
    );
    if (issuedMatch) {
      const actor = issuedMatch[1];
      const cmd = issuedMatch[2].trim();
      pushEntry(actor, "ingame", cmd, clean, logTime, occurredAt);
      continue;
    }

    // Pattern 3: Unbracketed direct Exaroton console command outputs
    for (const pattern of UNBRACKETED_CONSOLE_PATTERNS) {
      if (pattern.test(message)) {
        pushEntry("Server", "server_console", message, clean, logTime, occurredAt);
        break;
      }
    }
  }

  return results;
}

/** Persist parsed commands from a raw Exaroton log string into PostgreSQL (append-only, idempotent). */
export async function ingestExarotonLogContent(
  logContent: string
): Promise<{ inserted: number; parsed: number }> {
  const db = getDb();
  if (!db || !logContent) return { inserted: 0, parsed: 0 };

  const parsed = parseExarotonLogCommands(logContent);
  if (parsed.length === 0) return { inserted: 0, parsed: 0 };

  try {
    const insertedRows = await db
      .insert(serverCommandLogs)
      .values(parsed)
      .onConflictDoNothing({ target: serverCommandLogs.fingerprint })
      .returning({ id: serverCommandLogs.id });

    return { inserted: insertedRows.length, parsed: parsed.length };
  } catch (err) {
    console.error("server-commands: DB ingest failed", err);
    return { inserted: 0, parsed: parsed.length };
  }
}

/**
 * Sync the latest Exaroton server log into the permanent `server_command_logs` table.
 * Cooldown-throttled so frequent public page loads never spam the Exaroton API.
 */
export async function syncServerCommands(opts?: {
  force?: boolean;
  minIntervalMs?: number;
}): Promise<{ inserted: number; parsed: number; syncedAt: string | null }> {
  if (!getExarotonConfig() || !getDb()) {
    return { inserted: 0, parsed: 0, syncedAt: lastSyncedIso };
  }

  const now = Date.now();
  const minInterval = opts?.minIntervalMs ?? (opts?.force ? FORCE_SYNC_FLOOR_MS : SYNC_COOLDOWN_MS);
  if (now - lastSyncAt < minInterval) {
    return { inserted: 0, parsed: 0, syncedAt: lastSyncedIso };
  }
  if (inFlightSync) return inFlightSync;

  inFlightSync = (async () => {
    try {
      const content = await exarotonGetLogs();
      lastSyncAt = Date.now();
      if (!content) {
        return { inserted: 0, parsed: 0, syncedAt: lastSyncedIso };
      }
      const res = await ingestExarotonLogContent(content);
      lastSyncedIso = new Date().toISOString();
      return { ...res, syncedAt: lastSyncedIso };
    } catch (err) {
      console.error("server-commands: sync failed", err);
      lastSyncAt = Date.now();
      return { inserted: 0, parsed: 0, syncedAt: lastSyncedIso };
    } finally {
      inFlightSync = null;
    }
  })();

  return inFlightSync;
}

/**
 * Immediately record a command executed via the website's Admin Console or
 * Server Ops player list controls (e.g. granting/revoking OP). Best-effort —
 * never fails or rolls back the admin's action.
 */
export async function recordWebsiteServerCommand(input: {
  actorName: string;
  command: string;
  source?: ServerCommandSource;
}): Promise<void> {
  const db = getDb();
  if (!db) return;

  const cleanCmd = sanitizeCommandLine(input.command);
  if (!cleanCmd || PRIVATE_DM_CMD_RE.test(cleanCmd)) return;

  const normalized = cleanCmd.startsWith("/") ? cleanCmd : `/${cleanCmd}`;
  const now = new Date();
  const actor = (input.actorName || "Admin").trim().slice(0, 48);
  const { commandType, severity } = classifyServerCommand(normalized);

  const fingerprint = createHash("sha256")
    .update(`web|${now.toISOString()}|${actor}|${normalized}|${Math.random()}`)
    .digest("hex");

  try {
    await db
      .insert(serverCommandLogs)
      .values({
        fingerprint,
        actor,
        actorSource: input.source ?? "web_console",
        commandType,
        severity,
        summary: normalized.slice(0, 400),
        rawLine: `[Web Console] ${actor}: ${normalized}`.slice(0, 500),
        logTime: now.toISOString().slice(11, 19),
        occurredAt: now,
      })
      .onConflictDoNothing({ target: serverCommandLogs.fingerprint });
  } catch (err) {
    console.error("server-commands: recordWebsiteServerCommand failed", err);
  }
}

export function getLastCommandSyncAt(): string | null {
  return lastSyncedIso;
}
