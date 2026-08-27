import { NextResponse } from "next/server";
import { getSessionUser, clearSession } from "@/lib/auth";
import { findAccount, ACCOUNT_DB_ERROR_MESSAGE } from "@/lib/accounts";

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

  let account: Awaited<ReturnType<typeof findAccount>>;
  try {
    account = await findAccount(user.id);
  } catch (err) {
    // A pooler outage is NOT "logged out": answering { user: null } here
    // visually signed out every member site-wide during transient blips —
    // the exact lie `accountGate` was introduced to stop. 503 lets the
    // client distinguish "unknown" from a real sign-out.
    console.error("auth/me: account lookup failed", err);
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
  // Account gone or banned — the session must die with it, or a stale
  // 7-day cookie keeps reporting e.g. role: "admin" to the UI (and keeps
  // being sent on every request).
  if (!account || account.banned) {
    await clearSession().catch(() => {});
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({
    user: {
      ...user,
      avatarUrl: account.avatarUrl ?? user.avatarUrl,
      role: account.role,
      permissions: account.permissions,
      onboarded: account.onboarded ?? false,
      discordVerified: account.discordVerified ?? false,
      minecraftUsername: account.minecraftUsername ?? null,
    },
  });
}
