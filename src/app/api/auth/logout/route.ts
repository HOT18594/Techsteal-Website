import { NextResponse } from "next/server";

// POST /api/auth/logout
// Clears the session cookie.
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("ts_session");
  return res;
}
