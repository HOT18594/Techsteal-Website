// Exaroton (Minecraft hosting) server control and live status.
// Docs: https://docs.exaroton.com
// The server panel calls POST /v1/servers/{id}/start and /stop with a
// Bearer API token. Status comes from GET /v1/servers/{id}/.

import type { ServerStatus } from "@/types";

const EXAROTON_API = "https://api.exaroton.com/v1";

/** Reads Exaroton credentials from the environment. Returns null if unset.
 * Accepts the panel's "#AbCd…" display form — the API wants it bare, so a
 * leading "#" is stripped here rather than at every call site. */
export function getExarotonConfig() {
  const token = process.env.EXAROTON_TOKEN ?? "";
  const serverId = (process.env.EXAROTON_SERVER_ID ?? "").replace(/^#/, "");
  if (!token || !serverId) return null;
  return { token, serverId };
}

/** Start or stop the Minecraft server. Throws on configuration/auth errors. */
export async function exarotonAction(
  action: "start" | "stop"
): Promise<{ ok: boolean }> {
  const config = getExarotonConfig();
  if (!config) {
    throw new Error("Server control is not configured (missing EXAROTON_TOKEN or EXAROTON_SERVER_ID).");
  }
  const res = await fetch(
    `${EXAROTON_API}/servers/${encodeURIComponent(config.serverId)}/${action}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      // A hung upstream must not stall the request until the platform
      // timeout — bail out after 8s with a friendly error instead.
      signal: AbortSignal.timeout(8_000),
    }
  ).catch((err: unknown) => {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new Error("Exaroton didn't respond — try again in a moment.");
    }
    throw err;
  });
  if (!res.ok) {
    // Don't leak the raw exaroton response body (may echo token details);
    // cancelling also frees the pooled connection instead of holding it.
    await res.body?.cancel().catch(() => {});
    throw new Error(`exaroton error ${res.status}`);
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Live status — powers the Status page and the /api/status route.
// ---------------------------------------------------------------------------

/** Exaroton numeric status codes → our state names. Matches the official
 * enum (ServerStatus in exaroton's own SDKs): 0 OFFLINE, 1 ONLINE,
 * 2 STARTING, 3 STOPPING, 4 RESTARTING, 5 SAVING, 6 LOADING, 7 CRASHED,
 * 8 PENDING, 9 TRANSFERRING, 10 PREPARING. */
const STATE_BY_CODE: Record<number, { state: ServerStatus["state"]; label: string }> = {
  0: { state: "offline", label: "Offline" },
  1: { state: "online", label: "Online" },
  2: { state: "starting", label: "Starting…" },
  3: { state: "stopping", label: "Stopping…" },
  4: { state: "restarting", label: "Restarting…" },
  5: { state: "loading", label: "Saving…" },
  6: { state: "loading", label: "Loading…" },
  7: { state: "crashed", label: "Crashed" },
  8: { state: "pending", label: "Pending…" },
  9: { state: "pending", label: "Transferring…" },
  10: { state: "starting", label: "Preparing…" },
};

interface ExarotonServerResponse {
  success?: boolean;
  data?: {
    id?: string;
    name?: string;
    address?: string;
    motd?: string;
    status?: number;
    host?: string | null;
    port?: number;
    players?: { max?: number; count?: number; list?: string[] };
    software?: { name?: string; version?: string };
  };
}

export interface ExarotonSnapshot {
  serverName: string | null;
  motd: string | null;
  /** Numeric exaroton status code, or null when unknown. */
  statusCode: number | null;
  state: NonNullable<ServerStatus["state"]>;
  stateLabel: string;
  online: boolean;
  players: number;
  max: number;
  playerList: string[];
  software: string | null;
  version: string | null;
}

/** Strip Minecraft § formatting codes (incl. the §x hex-color prefix),
 * keeping line breaks. */
export function stripFormattingCodes(text: string): string {
  return text.replace(/[§&][0-9a-fk-orx]/gi, "");
}

/**
 * Fetch the configured server's live state. Only ONE request per poll —
 * exaroton rate-limits the API, so nothing extra (credits etc.) is fetched
 * here. Throws when the request fails outright so callers can fall back to
 * ping-based status.
 */
export async function getExarotonSnapshot(): Promise<ExarotonSnapshot> {
  const config = getExarotonConfig();
  if (!config) throw new Error("exaroton is not configured");

  const res = await fetch(
    `${EXAROTON_API}/servers/${encodeURIComponent(config.serverId)}/`,
    {
      headers: { Authorization: `Bearer ${config.token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    }
  ).catch((err: unknown) => {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new Error("exaroton didn't respond");
    }
    throw err;
  });
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    throw new Error(`exaroton server query failed (${res.status})`);
  }
  const server = (await res.json()) as ExarotonServerResponse;
  if (server.success === false || !server.data) {
    throw new Error("exaroton rejected the server query");
  }
  const d = server.data;

  const mapped =
    d.status !== undefined ? STATE_BY_CODE[d.status] : undefined;

  return {
    serverName: d.name ?? null,
    motd: d.motd ? stripFormattingCodes(d.motd) : null,
    statusCode: d.status ?? null,
    state: mapped?.state ?? "unknown",
    stateLabel: mapped?.label ?? "Unknown",
    online: (mapped?.state ?? "unknown") === "online",
    players: d.players?.count ?? 0,
    max: d.players?.max ?? 8,
    playerList: Array.isArray(d.players?.list) ? d.players.list : [],
    software: d.software?.name ?? null,
    version: d.software?.version ?? null,
  };
}