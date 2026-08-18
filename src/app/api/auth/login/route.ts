import { NextResponse } from "next/server";
import { findAccount, toSessionUser } from "@/lib/accounts";
import { setSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Sign in to a demo account (Discord OAuth replaces this later).
// Body: { accountId }
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const accountId = typeof body?.accountId === "string" ? body.accountId : "";

  const account = findAccount(accountId);
  if (!account) {
    return NextResponse.json({ error: "Unknown account" }, { status: 401 });
  }

  const user = toSessionUser(account);
  await setSession(user);

  return NextResponse.json({ user });
}
