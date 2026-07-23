import { NextRequest, NextResponse } from "next/server";
import {
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_TOKEN_URL,
  DISCORD_USER_URL,
  DISCORD_GUILD_ID,
  getRedirectUri,
} from "@/lib/discord";
import { fetchUserRole, findUser } from "@/lib/supabase";
import { signSession, getSessionCookieOptions, getSessionCookieName } from "@/lib/session";

// GET /api/auth/callback
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/?login_error=${encodeURIComponent(error)}`, req.url));
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL("/?login_error=missing_params", req.url));
  }

  const cookieState = req.cookies.get("discord_oauth_state")?.value;
  if (!cookieState || cookieState !== state) {
    return NextResponse.redirect(new URL("/?login_error=state_mismatch", req.url));
  }

  const origin = req.nextUrl.origin;

  let tokenRes: Response;
  try {
    tokenRes = await fetch(DISCORD_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: getRedirectUri(origin),
      }),
    });
  } catch {
    return NextResponse.redirect(new URL("/?login_error=token_request_failed", req.url));
  }
  if (!tokenRes.ok) {
    let tokenError = "unknown";
    try {
      const rawError = await tokenRes.text();
      const parsedError = rawError ? JSON.parse(rawError) : null;
      tokenError = parsedError?.error || parsedError?.error_description || rawError || "unknown";
      console.error("Discord token exchange failed", {
        status: tokenRes.status,
        error: parsedError?.error,
        errorDescription: parsedError?.error_description,
        rawError,
        redirectUri: getRedirectUri(origin),
      });
    } catch {
      console.error("Discord token exchange failed", {
        status: tokenRes.status,
        redirectUri: getRedirectUri(origin),
      });
    }
    return NextResponse.redirect(new URL(`/?login_error=token_exchange_failed&token_error=${encodeURIComponent(tokenError)}`, req.url));
  }
  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  if (!accessToken) {
    return NextResponse.redirect(new URL("/?login_error=no_access_token", req.url));
  }

  let userRes: Response;
  try {
    userRes = await fetch(DISCORD_USER_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    return NextResponse.redirect(new URL("/?login_error=user_fetch_failed", req.url));
  }
  if (!userRes.ok) {
    return NextResponse.redirect(new URL("/?login_error=user_fetch_failed", req.url));
  }
  const discordUser = await userRes.json();

  const discordId = String(discordUser.id);
  const username = discordUser.global_name || discordUser.username || "Discord User";
  const avatar = discordUser.avatar
    ? `https://cdn.discordapp.com/avatars/${discordId}/${discordUser.avatar}.png?size=128`
    : `https://cdn.discordapp.com/embed/avatars/${Number(discordUser.discriminator || 0) % 5}.png`;

  // Verify guild membership with pagination handling (Discord returns max 100 guilds per request)
  let inGuild = false;
  try {
    let after: string | undefined;
    let attempts = 0;
    while (!inGuild && attempts < 5) {
      attempts++;
      const url = new URL("https://discord.com/api/users/@me/guilds");
      url.searchParams.set("limit", "100");
      if (after) url.searchParams.set("after", after);
      const guildsRes = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!guildsRes.ok) break;
      const guilds = await guildsRes.json();
      if (!Array.isArray(guilds) || guilds.length === 0) break;
      if (guilds.some((g: any) => String(g.id) === DISCORD_GUILD_ID)) {
        inGuild = true;
        break;
      }
      // Pagination: continue if we got 100 results (might be more)
      if (guilds.length < 100) break;
      after = String(guilds[guilds.length - 1].id);
    }
  } catch {
    inGuild = false;
  }

  const role = await fetchUserRole(discordId);
  const existingUser = await findUser(discordId);
  const isNewUser = !existingUser;

  // Build secure signed JWT session.
  // Store the Discord access token so server-control can revalidate guild
  // membership at request time (the bot-based member lookup is blocked by
  // the guild's moderation settings, so we use the user's own token instead).
  const sessionPayload = { discordId, username, avatar, role, isNewUser, inGuild, discordAccessToken: accessToken };
  const signed = await signSession(sessionPayload as any);

  const res = NextResponse.redirect(new URL(isNewUser ? "/?setup=1" : "/", req.url));
  res.cookies.set(getSessionCookieName(), signed, getSessionCookieOptions());
  res.cookies.delete("discord_oauth_state");
  return res;
}
