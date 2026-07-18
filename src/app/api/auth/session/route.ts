import { NextRequest, NextResponse } from "next/server";
import type { AuthUser } from "@/lib/auth-context";

// GET /api/auth/session
// Returns the current user from the session cookie (if any).
export async function GET(req: NextRequest) {
  const raw = req.cookies.get("ts_session")?.value;
  if (!raw) return NextResponse.json({ user: null });
  try {
    const session = JSON.parse(raw) as AuthUser;
    return NextResponse.json({ user: session });
  } catch {
    return NextResponse.json({ user: null });
  }
}
