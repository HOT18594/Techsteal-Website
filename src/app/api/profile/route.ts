import { NextResponse } from "next/server";
import { findAccount, updateAccount } from "@/lib/accounts";
import { getSessionUser, setSession } from "@/lib/auth";
import { ADMIN_CODE } from "@/lib/admin-code";
import type { Account } from "@/types";

export const dynamic = "force-dynamic";

// Current user's full profile (includes onboarding fields).
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = await findAccount(user.id);
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ profile: account });
}

// Update profile fields. Body may include:
//   { minecraftUsername?, onboarded?, discordVerified?, adminCode? }
// Passing the correct adminCode promotes the account to admin.
export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const patch: Parameters<typeof updateAccount>[1] = {};

  if (typeof body.minecraftUsername === "string") {
    patch.minecraftUsername = body.minecraftUsername.trim();
  }
  if (typeof body.onboarded === "boolean") patch.onboarded = body.onboarded;
  if (typeof body.discordVerified === "boolean") patch.discordVerified = body.discordVerified;

  const account: Account | null = await findAccount(user.id);
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Admin code claim — exact match promotes to admin.
  if (typeof body.adminCode === "string" && body.adminCode.trim() === ADMIN_CODE) {
    patch.role = "admin";
    const perms = new Set(account.permissions);
    perms.add("server_control");
    patch.permissions = [...perms];
  }

  const updated = await updateAccount(account.id, patch);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Role/permissions changed → re-sign the session so it's immediately true.
  await setSession({
    id: updated.id,
    username: updated.username,
    role: updated.role,
    permissions: updated.permissions,
  });

  return NextResponse.json({ profile: updated });
}
