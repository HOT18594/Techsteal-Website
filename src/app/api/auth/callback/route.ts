import { NextRequest, NextResponse } from "next/server";
import {
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_TOKEN_URL,
  DISCORD_USER_URL,
  getRedirectUri,
} from "@/lib/discord";
import { fetchUserRole, findUser } from "@/lib/supabase";

// GET /api/auth/callback
// Discord redirects here with ?code=...&state=...
// We exchange the code for an access token (server-side, secret stays hidden),
// fetch the user profile, look up their role, and set a session cookie.
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

  // Verify state matches the cookie we set in /api/auth/discord
  const cookieState = req.cookies.get("discord_oauth_state")?.value;
  if (!cookieState || cookieState !== state) {
    return NextResponse.redirect(new URL("/?login_error=state_mismatch", req.url));
  }

  // Derive the origin from the request so the redirect URI matches what we
  // sent to Discord in the authorize step.
  const origin = req.nextUrl.origin;

  // Exchange the authorization code for an access token.
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
    return NextResponse.redirect(new URL("/?login_error=token_exchange_failed", req.url));
  }
  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  if (!accessToken) {
    return NextResponse.redirect(new URL("/?login_error=no_access_token", req.url));
  }

  // Fetch the Discord user profile.
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

  // Look up the user's role from the database.
  const role = await fetchUserRole(discordId);

  // Check if this is a brand-new user (not yet in user_roles).
  const existingUser = await findUser(discordId);
  const isNewUser = !existingUser;

  // Build the session payload and store it in an httpOnly cookie.
  // NOTE: This is a simple unsigned session. For production, sign this JWT
  // with a secret or use Supabase Auth sessions instead.
  const session = { discordId, username, avatar, role, isNewUser };
  const res = NextResponse.redirect(
    new URL(isNewUser ? "/?setup=1" : "/", req.url)
  );
  res.cookies.set("ts_session", JSON.stringify(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  });
  // Clear the state cookie.
  res.cookies.delete("discord_oauth_state");
  return res;
}
