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
const NEXT_COOKIE = "login_next";

/** Only allow same-site relative targets — never redirect off-site. */
function safeNextCookie(cookies: string): string | null {
  const raw = cookies
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${NEXT_COOKIE}=`))
    ?.slice(NEXT_COOKIE.length + 1);
  if (!raw) return null;
  const decoded = decodeURIComponent(raw);
  if (!decoded.startsWith("/") || decoded.startsWith("//")) return null;
  return decoded;
}

// Callback after Discord's consent screen: verify the state cookie,
// exchange the code for a token, load the user, sign them in, redirect
// back to the site (everyone lands home; a banner nudges them to /settings
// until they finish onboarding).
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

    // Land where the user started when the login flow began at a gated CTA
    // (the start route remembered it in a cookie) — otherwise home. Users
    // who haven't finished onboarding get a persistent reminder banner on
    // every page instead of being forced through the flow.
    const next = safeNextCookie(cookies);
    const res = NextResponse.redirect(new URL(next ?? "/", request.url));
    res.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
    res.cookies.set(NEXT_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  } catch (err) {
    if (err instanceof Error && err.message === "ACCOUNT_BANNED") {
      return fail("banned");
    }
    console.error("Discord login failed:", err);
    return fail("oauth_failed");
  }
}
