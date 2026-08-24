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
