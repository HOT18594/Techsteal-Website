import { NextRequest, NextResponse } from "next/server";
import type { AuthUser } from "@/lib/auth-context";
import { createUser, findUser } from "@/lib/supabase";

// POST /api/auth/setup
// Called by new users when they finish the account setup form.
// Creates a row in user_roles (role defaults to "member") and updates the
// session cookie to clear the isNewUser flag.
export async function POST(req: NextRequest) {
  const raw = req.cookies.get("ts_session")?.value;
  if (!raw) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  let session: AuthUser;
  try {
    session = JSON.parse(raw) as AuthUser;
  } catch {
    return NextResponse.json({ error: "invalid_session" }, { status: 400 });
  }

  // Parse the requested username from the body.
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

  // If the user already exists (e.g., they ran setup twice), don't duplicate.
  const existing = await findUser(session.discordId);
  if (!existing) {
    const created = await createUser(session.discordId, username);
    if (!created) {
      return NextResponse.json({ error: "create_failed" }, { status: 500 });
    }
  }

  // Update the session cookie: clear isNewUser, set the chosen username.
  const updatedSession: AuthUser = {
    ...session,
    username,
    isNewUser: false,
  };
  const res = NextResponse.json({ ok: true, user: updatedSession });
  res.cookies.set("ts_session", JSON.stringify(updatedSession), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  });
  return res;
}
