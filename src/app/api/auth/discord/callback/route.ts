import { NextResponse } from "next/server";
import { setSession } from "@/lib/auth";
import { findOrCreateDiscordAccount } from "@/lib/accounts";
import {
  discordAvatarUrl,
  exchangeCodeForToken,
  fetchDiscordUser,
} from "@/lib/discord";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "discord_oauth_state";

// Callback after Discord's consent screen: verify the state cookie,
// exchange the code for a token, load the user, sign them in, redirect
// back to the site (to onboarding on first login).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const cookies = request.headers.get("cookie") ?? "";
  const cookieState = cookies
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${STATE_COOKIE}=`))
    ?.slice(STATE_COOKIE.length + 1);

  const redirectUri = new URL("/api/auth/discord/callback", request.url).toString();

  const fail = (reason: string) => {
    const res = NextResponse.redirect(new URL(`/login?error=${reason}`, request.url));
    res.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  };

  // CSRF guard: the state we set on the authorize page must match.
  if (!code || !state || !cookieState || state !== cookieState) {
    return fail("state_mismatch");
  }

  try {
    const accessToken = await exchangeCodeForToken(code, redirectUri);
    const discordUser = await fetchDiscordUser(accessToken);
    const account = await findOrCreateDiscordAccount({
      id: discordUser.id,
      username: discordUser.username,
      avatarUrl: discordAvatarUrl(discordUser),
    });
    await setSession({
      id: account.id,
      username: account.username,
      role: account.role,
      permissions: account.permissions,
      avatarUrl: account.avatarUrl,
    });

    // First-time users land on onboarding; returning users go home.
    const destination = account.onboarded ? "/" : "/onboarding";

    const res = NextResponse.redirect(new URL(destination, request.url));
    res.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  } catch (err) {
    console.error("Discord login failed:", err);
    return fail("oauth_failed");
  }
}
