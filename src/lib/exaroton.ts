// Exaroton (Minecraft hosting) server control and live status.
// Docs: https://docs.exaroton.com
// The server panel calls POST /v1/servers/{id}/start and /stop with a
// Bearer API token. Status comes from GET /v1/servers/{id}/.

import type { ServerPlayerListName, ServerStatus } from "@/types";

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

/** Start, stop, or restart the Minecraft server. Throws on configuration/auth errors. */
export async function exarotonAction(
  action: "start" | "stop" | "restart"
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
  await res.body?.cancel().catch(() => {});
  if (!res.ok) {
    throw new Error(`exaroton error ${res.status}`);
  }
  return { ok: true };
}

/** Execute a Minecraft server console command (admin only, server must be online). */
export async function exarotonCommand(rawCommand: string): Promise<{ ok: boolean }> {
  const config = getExarotonConfig();
  if (!config) {
    throw new Error("Server control is not configured.");
  }
  const command = rawCommand.trim().replace(/^\/+/, "");
  if (!command) throw new Error("Command cannot be empty.");
  const res = await fetch(
    `${EXAROTON_API}/servers/${encodeURIComponent(config.serverId)}/command/`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ command }),
      signal: AbortSignal.timeout(8_000),
    }
  ).catch((err: unknown) => {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new Error("Exaroton didn't respond — try again in a moment.");
    }
    throw err;
  });
  await res.body?.cancel().catch(() => {});
  if (!res.ok) {
    throw new Error(`exaroton command error ${res.status}`);
  }
  return { ok: true };
}

/** Read entries from a server player list (whitelist, ops, banned-players). */
export async function exarotonGetPlayerList(list: ServerPlayerListName): Promise<string[]> {
  const config = getExarotonConfig();
  if (!config) throw new Error("Exaroton is not configured.");
  const res = await fetch(
    `${EXAROTON_API}/servers/${encodeURIComponent(config.serverId)}/playerlists/${encodeURIComponent(list)}/`,
    {
      headers: { Authorization: `Bearer ${config.token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    }
  );
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    throw new Error(`exaroton playerlist get failed (${res.status})`);
  }
  const json = (await res.json()) as {
    success?: boolean;
    data?: string[] | { entries?: string[] } | null;
  };
  if (json.success === false) throw new Error("exaroton rejected playerlist query");
  const raw = Array.isArray(json.data)
    ? json.data
    : Array.isArray(json.data?.entries)
      ? json.data.entries
      : [];
  return raw.filter((v): v is string => typeof v === "string" && Boolean(v.trim()));
}

/** Add one or more usernames to an Exaroton player list. */
export async function exarotonAddPlayerListEntries(
  list: ServerPlayerListName,
  entries: string[]
): Promise<string[]> {
  const config = getExarotonConfig();
  if (!config) throw new Error("Exaroton is not configured.");
  const clean = [...new Set(entries.map((e) => e.trim()).filter(Boolean))];
  if (clean.length === 0) return exarotonGetPlayerList(list);
  const res = await fetch(
    `${EXAROTON_API}/servers/${encodeURIComponent(config.serverId)}/playerlists/${encodeURIComponent(list)}/`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ entries: clean }),
      signal: AbortSignal.timeout(8_000),
    }
  );
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    throw new Error(`exaroton playerlist add failed (${res.status})`);
  }
  const json = (await res.json().catch(() => null)) as { data?: string[] } | null;
  if (Array.isArray(json?.data)) return json.data;
  return exarotonGetPlayerList(list);
}

/** Remove one or more usernames from an Exaroton player list. */
export async function exarotonRemovePlayerListEntries(
  list: ServerPlayerListName,
  entries: string[]
): Promise<string[]> {
  const config = getExarotonConfig();
  if (!config) throw new Error("Exaroton is not configured.");
  const clean = [...new Set(entries.map((e) => e.trim()).filter(Boolean))];
  if (clean.length === 0) return exarotonGetPlayerList(list);
  const res = await fetch(
    `${EXAROTON_API}/servers/${encodeURIComponent(config.serverId)}/playerlists/${encodeURIComponent(list)}/`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ entries: clean }),
      signal: AbortSignal.timeout(8_000),
    }
  );
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    throw new Error(`exaroton playerlist delete failed (${res.status})`);
  }
  const json = (await res.json().catch(() => null)) as { data?: string[] } | null;
  if (Array.isArray(json?.data)) return json.data;
  return exarotonGetPlayerList(list);
}

/** Update server RAM allocation in GiB (2–16, typically requires server offline). */
export async function exarotonSetRam(ramGb: number): Promise<number> {
  const config = getExarotonConfig();
  if (!config) throw new Error("Exaroton is not configured.");
  const clamped = Math.max(2, Math.min(16, Math.round(ramGb)));
  const res = await fetch(
    `${EXAROTON_API}/servers/${encodeURIComponent(config.serverId)}/options/ram/`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ram: clamped }),
      signal: AbortSignal.timeout(8_000),
    }
  );
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    throw new Error(`exaroton ram update failed (${res.status})`);
  }
  const json = (await res.json().catch(() => null)) as { data?: { ram?: number } } | null;
  return typeof json?.data?.ram === "number" ? json.data.ram : clamped;
}

/** Upload the current server log to mclo.gs (with automatic IP redaction). */
export async function exarotonShareLogs(): Promise<{ id: string; url: string }> {
  const config = getExarotonConfig();
  if (!config) throw new Error("Exaroton is not configured.");
  const res = await fetch(
    `${EXAROTON_API}/servers/${encodeURIComponent(config.serverId)}/logs/share/`,
    {
      headers: { Authorization: `Bearer ${config.token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    }
  );
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    throw new Error(`exaroton log share failed (${res.status})`);
  }
  const json = (await res.json()) as {
    success?: boolean;
    data?: { id?: string; url?: string } | null;
  };
  if (json.success === false || !json.data?.url) {
    throw new Error("No server log is available to share right now.");
  }
  return { id: json.data.id ?? "", url: json.data.url };
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

interface ExarotonSnapshot {
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

/** Strip Minecraft § formatting codes (incl. the §x hex-color prefix) and
 * standalone `&` color codes without mangling words like "Q&A" or "R&D". */
function stripFormattingCodes(text: string): string {
  return text.replace(/§[0-9a-fk-orx]|(?<!\w)&[0-9a-fk-orx]/gi, "");
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