import { NextRequest, NextResponse } from "next/server";
import { findUser } from "@/lib/supabase";
import { verifySession, signSession, getSessionCookieName, getSessionCookieOptions } from "@/lib/session";
import { requireAdminClient } from "@/lib/server-auth";

// POST /api/auth/setup
export async function POST(req: NextRequest) {
  const raw = req.cookies.get(getSessionCookieName())?.value;
  if (!raw) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const session = await verifySession(raw);
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

  const cleanUsername = username.replace(/[<>]/g, "").slice(0, 32);

  try {
    const existing = await findUser(session.discordId);
    if (!existing) {
      const { error } = await requireAdminClient()
        .from("user_roles")
        .insert({ discord_id: session.discordId, role: "member", username: cleanUsername });
      if (error) throw error;
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "create_failed" }, { status: 500 });
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
