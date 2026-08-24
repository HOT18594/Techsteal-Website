import { NextResponse } from "next/server";
import { listAccounts, updateAccount, removeAccount, isAdminUser } from "@/lib/accounts";
import { getSessionUser } from "@/lib/auth";
import type { Permission } from "@/types";

export const dynamic = "force-dynamic";

const VALID_PERMISSIONS: Permission[] = ["server_control", "ai_access", "gallery_post"];

// Checks the CURRENT database role, not the (up to 7-day-old) session
// cookie, so demoting/removing an admin takes effect immediately.
async function requireAdmin() {
  if (!(await isAdminUser())) return null;
  return getSessionUser();
}

// The account store throws on a pooler outage — surface a 503 with a
// human message instead of an opaque 500.
const DB_DOWN = { error: "The member database is unreachable right now — try again in a moment." };

// List all accounts (admin only). Banned (removed) accounts are included
// separately so they can be restored.
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let all;
  try {
    all = await listAccounts();
  } catch {
    return NextResponse.json(DB_DOWN, { status: 503 });
  }
  return NextResponse.json({
    accounts: all.filter((a) => !a.banned),
    bannedAccounts: all.filter((a) => a.banned),
  });
}

// Update an account's role/permissions (admin only).
// Body: { id, role?, permissions? }
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  // Never let an admin demote themselves — that would lock them out of
  // the Manage Panel with no way back in.
  if (id === admin.id && body.role === "member") {
    return NextResponse.json({ error: "You can't demote yourself." }, { status: 400 });
  }

  const patch: Parameters<typeof updateAccount>[1] = {};
  if (body.role === "admin" || body.role === "member") patch.role = body.role;
  if (Array.isArray(body.permissions)) patch.permissions = sanitizePermissions(body.permissions);

  // An empty patch would emit a malformed `UPDATE … SET  WHERE id = …`.
  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "Nothing to update — send role and/or permissions." },
      { status: 400 }
    );
  }

  let updated: Awaited<ReturnType<typeof updateAccount>>;
  try {
    updated = await updateAccount(id, patch);
  } catch {
    return NextResponse.json(DB_DOWN, { status: 503 });
  }
  if (!updated) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  return NextResponse.json({ account: updated });
}

// Remove an account (admin only). This BANS the user — see removeAccount.
export async function DELETE(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  // Never let an admin remove their own account.
  if (id === admin.id) {
    return NextResponse.json({ error: "You can't remove yourself." }, { status: 400 });
  }

  let removed: boolean;
  try {
    removed = await removeAccount(id);
  } catch {
    return NextResponse.json(DB_DOWN, { status: 503 });
  }
  if (!removed) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// Restore a banned account (admin only). Body: { id }
export async function PUT(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  let restored: Awaited<ReturnType<typeof updateAccount>>;
  try {
    restored = await updateAccount(id, { banned: false });
  } catch {
    return NextResponse.json(DB_DOWN, { status: 503 });
  }
  if (!restored) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  return NextResponse.json({ account: restored });
}

function sanitizePermissions(value: unknown): Permission[] {
  if (!Array.isArray(value)) return [];
  return value.filter((p): p is Permission =>
    VALID_PERMISSIONS.includes(p as Permission)
  );
}
