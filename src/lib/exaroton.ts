// Exaroton (Minecraft hosting) server control.
// Docs: https://docs.exaroton.com
// The server panel calls POST /v1/servers/{id}/start and /stop with a
// Bearer API token. Returns { ok: true } when the action was accepted.

const EXAROTON_API = "https://api.exaroton.com/v1";

/** Reads Exaroton credentials from the environment. Returns null if unset. */
export function getExarotonConfig() {
  const token = process.env.EXAROTON_TOKEN ?? "";
  const serverId = process.env.EXAROTON_SERVER_ID ?? "";
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
    // Don't leak the raw exaroton response body (may echo token details).
    throw new Error(`exaroton error ${res.status}`);
  }
  return { ok: true };
}