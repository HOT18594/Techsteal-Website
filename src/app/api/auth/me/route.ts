import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Current session user, or { user: null } when logged out.
export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json({ user });
}
