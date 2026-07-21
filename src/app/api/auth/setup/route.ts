import { NextRequest, NextResponse } from "next/server";
import { createUser, findUser } from "@/lib/supabase";
import { verifySession, signSession, getSessionCookieName, getSessionCookieOptions } from "@/lib/session";

// POST /api/auth/setup
export async function POST(req: NextRequest) {
  const raw = req.cookies.get(getSessionCookieName())?.value;
  if (!raw) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  let session = await verifySession(raw);
  // fallback legacy JSON for migration
  if (!session) {
    try {
      const legacy = JSON.parse(raw);
      if (legacy?.discordId) {
        session = {
          discordId: String(legacy.discordId),
          username: String(legacy.username || ""),
          avatar: String(legacy.avatar || ""),
          role: (legacy.role === "admin" ? "admin" : "member") as any,
          isNewUser: true,
          inGuild: Boolean(legacy.inGuild),
        };
      }
    } catch {}
  }

  if (!session) {
    return NextResponse.json({ error: "invalid_session" }, { status: 401 });
  }

  let body: { username?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const username = (body.username || "").trim();
  if (!username || username.length < 2 || username.length > 32) {
    return NextResponse.json({ error: "username_invalid" }, { status: 400 });
  }

  // Sanitize username - strip html
  const cleanUsername = username.replace(/[<>]/g, "").slice(0, 32);

  const existing = await findUser(session.discordId);
  if (!existing) {
    const created = await createUser(session.discordId, cleanUsername);
    if (!created) {
      return NextResponse.json({ error: "create_failed" }, { status: 500 });
    }
  }

  const updatedSession = {
    ...session,
    username: cleanUsername,
    isNewUser: false,
  };

  const signed = await signSession(updatedSession as any);
  const res = NextResponse.json({ ok: true, user: updatedSession });
  res.cookies.set(getSessionCookieName(), signed, getSessionCookieOptions());
  return res;
}
