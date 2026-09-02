import type { ServerTelemetry, ServerTelemetryLine } from "@/types";
import { getExarotonConfig } from "./exaroton";

const EXAROTON_API = "https://api.exaroton.com/v1";
const CACHE_MS = 30_000;
let cache: { at: number; promise: Promise<ServerTelemetry> } | null = null;

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
    .trim();
}

function lineLevel(text: string): ServerTelemetryLine["level"] {
  if (/\/(?:msg|tell|say)\b|<[^>]+>|\[chat\]/i.test(text)) return "chat";
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

  return {
    source: hasData ? "live" : "unavailable",
    ramGb: typeof ram === "number" ? ram : null,
    lines: typeof content === "string" ? tailConsole(content) : [],
    sampledAt: hasData ? new Date().toISOString() : null,
  };
}

export function getServerTelemetry(): Promise<ServerTelemetry> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.promise;
  const promise = fetchTelemetry().catch(() => ({
    source: "unavailable" as const,
    ramGb: null,
    lines: [],
    sampledAt: null,
  }));
  cache = { at: now, promise };
  return promise;
}
