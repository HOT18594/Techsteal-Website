import { NextResponse } from "next/server";
import { buildAuthorizeUrl, getDiscordConfig } from "@/lib/discord";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "discord_oauth_state";
const NEXT_COOKIE = "login_next";

/** Only allow same-site relative targets — never redirect off-site. */
function safeNext(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

// Start "Sign in with Discord": build the authorize URL with a one-time
// state value (stored in a cookie so the callback can verify it) and
// redirect the user to Discord. An optional ?next=/<path> is remembered so
// the callback can land the user back where they started (e.g. a gated
// forum reply), instead of always dropping them on the home page.
export async function GET(request: Request) {
  const config = getDiscordConfig();
  if (!config) {
    return NextResponse.redirect(
      new URL("/login?error=discord_not_configured", request.url)
    );
  }

  const state = crypto.randomUUID();
  const redirectUri = new URL("/api/auth/discord/callback", request.url).toString();
  const authorizeUrl = buildAuthorizeUrl(redirectUri, state);

  const next = safeNext(new URL(request.url).searchParams.get("next"));
  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes — enough to click through Discord's consent
  });
  if (next) {
    res.cookies.set(NEXT_COOKIE, next, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
  }
  return res;
}
