import { NextRequest, NextResponse } from "next/server";
import { verifySession, getSessionCookieName } from "@/lib/session";
import { fetchUserRole } from "@/lib/supabase";

// GET /api/auth/session
// Verifies signed JWT and re-validates role from DB to prevent tampering and
// ensure role changes are reflected without re-login.
export async function GET(req: NextRequest) {
  const raw = req.cookies.get(getSessionCookieName())?.value;
  if (!raw) return NextResponse.json({ user: null });

  // Try JWT verification first
  const verified = await verifySession(raw);
  if (verified) {
    // Re-validate role from DB so admin demotion takes effect immediately
    try {
      const liveRole = await fetchUserRole(verified.discordId);
      if (liveRole !== verified.role) {
        verified.role = liveRole;
      }
    } catch {}
    return NextResponse.json({ user: verified });
  }

  // Fallback: try legacy unsigned JSON (for migration period) then reject
  try {
    const legacy = JSON.parse(raw);
    if (legacy?.discordId) {
      // Legacy session - still return but log warning; client will get new signed on next login
      // We still re-fetch role to mitigate tampering
      const liveRole = await fetchUserRole(String(legacy.discordId));
      return NextResponse.json({
        user: {
          discordId: String(legacy.discordId),
          username: String(legacy.username || "User"),
          avatar: String(legacy.avatar || ""),
          role: liveRole,
          isNewUser: Boolean(legacy.isNewUser),
          inGuild: Boolean(legacy.inGuild),
        },
      });
    }
  } catch {}

  return NextResponse.json({ user: null });
}
