import { NextRequest, NextResponse } from "next/server";
import { buildDiscordAuthUrl } from "@/lib/discord";

// GET /api/auth/discord
// Starts the Discord OAuth authorization-code flow.
// Generates a random state value to prevent CSRF and stores it in a cookie.
export async function GET(req: NextRequest) {
  const state = crypto.randomUUID();
  // Derive the origin from the request so the redirect URI matches the
  // deployment the user is currently on (localhost, preview, production).
  const origin = req.nextUrl.origin;
  const url = buildDiscordAuthUrl(state, origin);
  const res = NextResponse.redirect(url);
  // Store state in a short-lived httpOnly cookie for the callback to verify.
  res.cookies.set("discord_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });
  return res;
}
