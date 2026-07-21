import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabase } from "@/lib/supabase";
import { verifySession, signSession, getSessionCookieName, getSessionCookieOptions } from "@/lib/session";

const ADMIN_CODE = process.env.ADMIN_UNLOCK_CODE;

export async function POST(req: NextRequest) {
  if (!ADMIN_CODE) {
    return NextResponse.json({ error: "Admin unlock is not configured." }, { status: 503 });
  }

  const raw = req.cookies.get(getSessionCookieName())?.value;
  if (!raw) {
    return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  }

  let session = await verifySession(raw);
  if (!session) {
    // fallback legacy for migration
    try {
      const legacy = JSON.parse(raw);
      if (legacy?.discordId) {
        session = {
          discordId: String(legacy.discordId),
          username: String(legacy.username || ""),
          avatar: String(legacy.avatar || ""),
          role: "member" as any,
          isNewUser: false,
          inGuild: Boolean(legacy.inGuild),
        };
      }
    } catch {}
  }

  if (!session) {
    return NextResponse.json({ error: "Invalid session." }, { status: 401 });
  }

  let code: string | undefined;
  try {
    const body = await req.json();
    code = body?.code;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (code !== ADMIN_CODE) {
    return NextResponse.json({ error: "Invalid code." }, { status: 403 });
  }

  // Use service role if available to bypass restrictive RLS
  const client = supabaseAdmin || supabase;
  const { error } = await client
    .from("user_roles")
    .update({ role: "admin" })
    .eq("discord_id", session.discordId);

  if (error) {
    return NextResponse.json({ error: "Failed to update role." }, { status: 500 });
  }

  const updated = { ...session, role: "admin" as const };
  const signed = await signSession(updated as any);
  const res = NextResponse.json({ ok: true, role: "admin" });
  res.cookies.set(getSessionCookieName(), signed, getSessionCookieOptions());
  return res;
}
