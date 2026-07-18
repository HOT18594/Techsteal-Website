// Discord OAuth configuration.
// In production these come from environment variables (set in Vercel).
// For local dev, copy .env.example to .env.local and fill in your values.

export const DISCORD_CLIENT_ID = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID || "";
export const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || "";
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

// Scopes: "identify" gives username + avatar. Add "email" if you need email.
export const DISCORD_SCOPES = "identify";

// Discord API endpoints
export const DISCORD_AUTH_URL = "https://discord.com/api/oauth2/authorize";
export const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";
export const DISCORD_USER_URL = "https://discord.com/api/users/@me";

// The redirect URI for the authorization-code flow (server-side exchange).
// This must match exactly what you registered in the Discord developer portal.
// We derive it from the incoming request origin so it works on any deployment
// (localhost, Vercel preview URLs, production domain, etc.).
export function getRedirectUri(origin: string): string {
  return `${origin}/api/auth/callback`;
}

// Build the URL that sends the user to Discord to authorize.
export function buildDiscordAuthUrl(state: string, origin: string): string {
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: getRedirectUri(origin),
    response_type: "code",
    scope: DISCORD_SCOPES,
    prompt: "consent",
    state,
  });
  return `${DISCORD_AUTH_URL}?${params.toString()}`;
}
