import { NextRequest, NextResponse } from "next/server";
import { addAccount, updateAccount } from "@/lib/accounts";
import { setSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  GUEST_PERMISSIONS,
  getGuestPassword,
  guestDisplayName,
  guestPasswordMatches,
  newGuestId,
} from "@/lib/guest";
import { isRateLimited, rateLimitIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Guest sign-in: { password, name? } → session for a fresh `guest:<id>`
// profile with standard member permissions (AI, server control, posting).
export async function POST(request: NextRequest) {
  if (!getGuestPassword()) {
    return NextResponse.json(
      { error: "Guest login isn't set up yet." },
      { status: 503 }
    );
  }

  // Shared password → brute-forceable, so throttle per IP (edge-appended XFF).
  const ip = rateLimitIp(request);
  if (isRateLimited(`guestlogin:${ip}`, 8, 10 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Too many attempts — wait a few minutes and try again." },
      { status: 429 }
    );
  }

  const body = (await request.json().catch(() => ({}))) ?? {};
  const password = typeof body.password === "string" ? body.password : "";
  if (!password || !guestPasswordMatches(password)) {
    return NextResponse.json(
      { error: "That guest password isn't right." },
      { status: 403 }
    );
  }

  const id = newGuestId();
  const username = guestDisplayName(body.name, id);

  try {
    if (getDb()) {
      await addAccount({
        id,
        username,
        role: "member",
        permissions: GUEST_PERMISSIONS,
      });
      // Guests have nothing to onboard (no Discord / Minecraft link needed).
      await updateAccount(id, { onboarded: true });
    }
    await setSession({
      id,
      username,
      role: "member",
      permissions: GUEST_PERMISSIONS,
      onboarded: true,
      discordVerified: false,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Guest login failed:", err);
    return NextResponse.json(
      { error: "Couldn't start a guest session — try again in a moment." },
      { status: 503 }
    );
  }
}
