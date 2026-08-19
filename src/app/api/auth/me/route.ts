import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { findAccount } from "@/lib/accounts";

export const dynamic = "force-dynamic";

// Current session user, or { user: null } when logged out.
//
// The profile is re-read from the database on every call so the client
// always sees the freshest truth: Discord profile picture, role, and
// permission changes take effect immediately instead of waiting for the
// JWT in the cookie to expire.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ user: null });

  const account = await findAccount(user.id).catch(() => null);
  if (!account) return NextResponse.json({ user });

  return NextResponse.json({
    user: {
      ...user,
      avatarUrl: account.avatarUrl ?? user.avatarUrl,
      role: account.role,
      permissions: account.permissions,
      onboarded: account.onboarded ?? false,
    },
  });
}
