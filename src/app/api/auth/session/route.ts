import { NextRequest, NextResponse } from "next/server";
import { verifySession, getSessionCookieName } from "@/lib/session";
import { fetchUserRole, fetchCanControlServer } from "@/lib/supabase";

// GET /api/auth/session
// Verifies signed JWT and re-validates role from DB to prevent tampering and
// ensure role changes are reflected without re-login.
// LEGACY FALLBACK REMOVED: unsigned JSON cookies were a privilege-escalation vector.
// Users with old cookies must re-login via Discord OAuth.
export async function GET(req: NextRequest) {
  const raw = req.cookies.get(getSessionCookieName())?.value;
  if (!raw) return NextResponse.json({ user: null });

  // Try JWT verification only - no legacy fallback
  const verified = await verifySession(raw);
  if (verified) {
    // Re-validate role from DB so admin demotion takes effect immediately
    try {
      const liveRole = await fetchUserRole(verified.discordId);
      if (liveRole !== verified.role) {
        verified.role = liveRole;
      }
    } catch {}
    // Surface the per-user server-control permission so the UI can gate the
    // start/stop buttons accurately. Members are blocked by default; fail
    // closed if the lookup throws.
    try {
      (verified as any).canControlServer = await fetchCanControlServer(verified.discordId);
    } catch {
      (verified as any).canControlServer = false;
    }
    // Never expose the Discord OAuth access token to the browser — it's
    // server-side only (used by /api/server/control to revalidate guild
    // membership). Strip it from the client-facing response.
    const { discordAccessToken, ...safeUser } = verified;
    return NextResponse.json({ user: safeUser });
  }

  // Invalid/expired/legacy cookie - force re-login
  return NextResponse.json({ user: null });
}
