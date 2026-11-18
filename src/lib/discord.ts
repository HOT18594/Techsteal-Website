// Discord OAuth helpers.
// Docs: https://discord.com/developers/docs/topics/oauth2

export interface DiscordUser {
  id: string;
  username: string;
  avatar: string | null;
}

/** Reads Discord app credentials from the environment. Returns null if unset. */
export function getDiscordConfig() {
  const clientId = process.env.DISCORD_CLIENT_ID ?? "";
  const clientSecret = process.env.DISCORD_CLIENT_SECRET ?? "";
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** Build the "Sign in with Discord" authorization URL. */
export function buildAuthorizeUrl(redirectUri: string, state: string): string {
  const config = getDiscordConfig();
  if (!config) throw new Error("Discord login is not configured");
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify",
    state,
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

/** Exchange the OAuth `code` for an access token. Returns the token. */
export async function exchangeCodeForToken(
  code: string,
  redirectUri: string
): Promise<string> {
  const config = getDiscordConfig();
  if (!config) throw new Error("Discord login is not configured");
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  const res = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    // Truncate/sanitize the raw body — it can echo request details.
    const text = await res.text().catch(() => "");
    throw new Error(`Discord token exchange failed (${res.status}): ${text.slice(0, 120)}`);
  }
  const data = (await res.json().catch(() => null)) as { access_token?: string } | null;
  if (!data?.access_token) throw new Error("Discord token exchange returned no token");
  return data.access_token;
}

/** Fetch the logged-in Discord user profile with a Bearer token. */
export async function fetchDiscordUser(accessToken: string): Promise<DiscordUser> {
  const res = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    throw new Error(`Discord user fetch failed (${res.status})`);
  }
  const user = (await res.json().catch(() => null)) as DiscordUser | null;
  if (!user?.id || !user.username) throw new Error("Discord user fetch returned bad data");
  return user;
}

/**
 * Discord CDN URL for a user's profile picture, or null when the user
 * has no avatar set (then they show Discord's default — we fall back
 * to a letter tile). Animated avatars keep their GIF.
 */
export function discordAvatarUrl(user: DiscordUser): string | null {
  if (!user.avatar) return null;
  const ext = user.avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=128`;
}

export type DiscordGuildCheckResult =
  | { status: "unconfigured" }
  | { status: "definitive"; verified: boolean }
  | { status: "transient_error" };

/**
 * Check whether `accountOrSnowflake` ("discord:<id>" or "<id>") is currently a
 * member of `DISCORD_GUILD_ID` using `DISCORD_BOT_TOKEN`. Distinguishes code
 * 10007 (unknown member = definitively not in server) from 10004 (unknown
 * guild) or 429/5xx so transient hiccups never wipe stored verification.
 */
export async function checkDiscordGuildMembership(
  accountOrSnowflake: string
): Promise<DiscordGuildCheckResult> {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!botToken || !guildId) return { status: "unconfigured" };

  const discordId = accountOrSnowflake.replace(/^discord:/, "").trim();
  if (!/^\d{5,30}$/.test(discordId)) return { status: "transient_error" };

  try {
    const res = await fetch(
      `https://discord.com/api/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(discordId)}`,
      {
        headers: { Authorization: `Bot ${botToken}` },
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (res.status === 200) {
      await res.body?.cancel().catch(() => {});
      return { status: "definitive", verified: true };
    }
    if (res.status === 404) {
      try {
        const payload = (await res.json()) as { code?: number } | null;
        if (payload?.code === 10007) {
          return { status: "definitive", verified: false };
        }
      } catch {
        /* non-JSON 404 — treat as transient */
      }
      return { status: "transient_error" };
    }
    await res.body?.cancel().catch(() => {});
    return { status: "transient_error" };
  } catch {
    return { status: "transient_error" };
  }
}
