import type { ServerTelemetry, ServerTelemetryLine } from "@/types";
import { getExarotonConfig } from "./exaroton";
import { ingestExarotonLogContent } from "./server-commands";

const EXAROTON_API = "https://api.exaroton.com/v1";
const CACHE_MS = 30_000;
const NEGATIVE_CACHE_MS = 3_000;
let cache: { at: number; ttl: number; promise: Promise<ServerTelemetry> } | null = null;

/** Bust the telemetry cache after console commands, RAM updates, or power actions. */
export function invalidateServerTelemetry(): void {
  cache = null;
}

interface RamResponse {
  success?: boolean;
  data?: { ram?: number } | null;
}

interface LogResponse {
  success?: boolean;
  data?: { content?: string | null } | null;
}

function cleanConsoleLine(line: string): string {
  return line
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/(authorization\s*:\s*bearer\s+)[^\s]+/gi, "$1[hidden]")
    // Join/disconnect and handshake lines carry player IPs. IPv6 first
    // (full, compressed, IPv4-mapped): 6+ hex groups or a "::" — HH:MM:SS
    // timestamps have only 3 groups and never match.
    .replace(/\b(?:[0-9a-fA-F]{1,4}:){5,7}[0-9a-fA-F]{1,4}\b|[0-9a-fA-F:]*::[0-9a-fA-F:.]+/g, "[ip]")
    // Full 4-octet IPv4 (with optional port), so game versions like 1.21.4
    // and 3-part mod versions never match.
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d{1,5})?\b/g, "[ip]")
    .trim();
}

function lineLevel(text: string): ServerTelemetryLine["level"] {
  // Real chat only: an explicit [chat] tag, /msg|tell|say commands, or a
  // <Player> tag sitting right where the vanilla log prefix ends ("…]: <Name>
  // message"). The old <[^>]+> alternative matched ANY bracketed token, so
  // plugin lines like "Loaded <config> from world" styled as chat.
  if (/\[chat\]|\b\/(?:msg|tell|say)\b|\]:\s*<[^>]+>/i.test(text)) return "chat";
  if (/\b(?:error|fatal|severe|exception|crash)\b/i.test(text)) return "error";
  if (/\bwarn(?:ing)?\b/i.test(text)) return "warning";
  return "info";
}

function tailConsole(content: string): ServerTelemetryLine[] {
  return content
    .split(/\r?\n/)
    .map(cleanConsoleLine)
    .filter(Boolean)
    .slice(-80)
    .map((text, index) => ({
      id: `${index}-${text.slice(0, 40)}`,
      text,
      level: lineLevel(text),
    }));
}

async function request<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${EXAROTON_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`exaroton telemetry query failed (${response.status})`);
  }
  return (await response.json()) as T;
}

async function fetchTelemetry(): Promise<ServerTelemetry> {
  const config = getExarotonConfig();
  if (!config) {
    return { source: "unavailable", ramGb: null, lines: [], sampledAt: null };
  }

  const id = encodeURIComponent(config.serverId);
  const [ramResult, logResult] = await Promise.allSettled([
    request<RamResponse>(`/servers/${id}/options/ram/`, config.token),
    request<LogResponse>(`/servers/${id}/logs/`, config.token),
  ]);

  const ram = ramResult.status === "fulfilled" ? ramResult.value.data?.ram : undefined;
  const content = logResult.status === "fulfilled" ? logResult.value.data?.content : undefined;
  const hasData = typeof ram === "number" || typeof content === "string";

  if (typeof content === "string" && content.length > 0) {
    // Archive any commands already present in the fetched log (best-effort, zero extra Exaroton API calls).
    void ingestExarotonLogContent(content);
  }

  return {
    source: hasData ? "live" : "unavailable",
    ramGb: typeof ram === "number" ? ram : null,
    lines: typeof content === "string" ? tailConsole(content) : [],
    sampledAt: hasData ? new Date().toISOString() : null,
  };
}

export function getServerTelemetry(force = false): Promise<ServerTelemetry> {
  const now = Date.now();
  if (!force && cache && now - cache.at < cache.ttl) return cache.promise;
  const entry = {
    at: now,
    ttl: CACHE_MS,
    promise: fetchTelemetry()
      .then((res) => {
        if (res.source === "unavailable") entry.ttl = NEGATIVE_CACHE_MS;
        return res;
      })
      .catch(() => {
        entry.ttl = NEGATIVE_CACHE_MS;
        return {
          source: "unavailable" as const,
          ramGb: null,
          lines: [],
          sampledAt: null,
        };
      }),
  };
  cache = entry;
  return entry.promise;
}
