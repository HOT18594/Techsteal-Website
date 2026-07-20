import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// POST /api/auth/promote
// Body: { code: string }
// If the code matches the admin unlock code, promote the logged-in user to
// admin in user_roles and return the updated session fields.
// The code is compared server-side so it can't be bypassed client-side.

const ADMIN_CODE = process.env.ADMIN_UNLOCK_CODE;

export async function POST(req: NextRequest) {
  // Admin unlock must be configured server-side; fail closed if missing.
  if (!ADMIN_CODE) {
    return NextResponse.json({ error: "Admin unlock is not configured." }, { status: 503 });
  }

  const raw = req.cookies.get("ts_session")?.value;
  if (!raw) {
    return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  }

  let session: any;
  try {
    session = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid session." }, { status: 401 });
  }

  const discordId = session?.discordId;
  if (!discordId) {
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

  const { error } = await supabase
    .from("user_roles")
    .update({ role: "admin" })
    .eq("discord_id", discordId);
  if (error) {
    return NextResponse.json({ error: "Failed to update role." }, { status: 500 });
  }

  // Update the session cookie role.
  const updated = { ...session, role: "admin" };
  const res = NextResponse.json({ ok: true, role: "admin" });
  res.cookies.set("ts_session", JSON.stringify(updated), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
  return res;
}
