import { NextResponse } from "next/server";
import {
  addPermissions,
  checkAdmin,
  listAccounts,
  removeAccount,
  removePermissions,
  updateAccount,
} from "@/lib/accounts";
import { getSessionUser } from "@/lib/auth";
import type { Permission } from "@/types";

export const dynamic = "force-dynamic";

const VALID_PERMISSIONS: Permission[] = ["server_control", "ai_access", "gallery_post"];

type AdminSession = NonNullable<Awaited<ReturnType<typeof getSessionUser>>>;

// Checks the CURRENT database role, not the (up to 7-day-old) session
// cookie, so demoting/removing an admin takes effect immediately.
// A DB outage is NOT a demotion: it must answer 503, not 403 "Forbidden"
// that tells a real admin they aren't one.
async function requireAdmin(): Promise<
  { ok: true; admin: AdminSession } | { ok: false; status: 403 | 503 }
> {
  const verdict = await checkAdmin();
  if (verdict === "yes") {
    const admin = await getSessionUser();
    return admin ? { ok: true, admin } : { ok: false, status: 403 };
  }
  return { ok: false, status: verdict === "db_error" ? 503 : 403 };
}

// The account store throws on a pooler outage — surface a 503 with a
// human message instead of an opaque 500.
const DB_DOWN = { error: "The member database is unreachable right now — try again in a moment." };

function denyResponse(guard: { ok: false; status: 403 | 503 }): NextResponse {
  return NextResponse.json(guard.status === 503 ? DB_DOWN : { error: "Forbidden" }, {
    status: guard.status,
  });
}

// List all accounts (admin only). Banned (removed) accounts are included
// separately so they can be restored.
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return denyResponse(guard);
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

// Update an account's role and/or permissions (admin only).
//
// Body: { id, role?, grant?: Permission[], revoke?: Permission[], permissions? }
//
// `grant`/`revoke` are the preferred form and are applied as SQL deltas
// (addPermissions/removePermissions), so two admins toggling different perks
// on the same member at the same time — or a member re-verifying Discord
// mid-toggle — can't clobber each other. `permissions` (the whole array) is
// still accepted for a deliberate "set exactly these" write.
export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return denyResponse(guard);
  const admin = guard.admin;

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
  const grant = sanitizePermissions(body.grant);
  const revoke = sanitizePermissions(body.revoke);
  // A perk in both lists is a contradictory request, not something to guess at.
  const conflict = grant.find((p) => revoke.includes(p));
  if (conflict) {
    return NextResponse.json(
      { error: `"${conflict}" can't be granted and revoked in the same request.` },
      { status: 400 }
    );
  }

  // An empty patch would emit a malformed `UPDATE … SET  WHERE id = …`.
  if (Object.keys(patch).length === 0 && grant.length === 0 && revoke.length === 0) {
    return NextResponse.json(
      { error: "Nothing to update — send role, permissions, grant or revoke." },
      { status: 400 }
    );
  }

  let updated: Awaited<ReturnType<typeof updateAccount>> = null;
  try {
    if (Object.keys(patch).length > 0) {
      updated = await updateAccount(id, patch);
      // Report a missing account before spending more round-trips on it.
      if (!updated) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    if (grant.length > 0) updated = await addPermissions(id, grant);
    if (revoke.length > 0) updated = await removePermissions(id, revoke);
  } catch {
    return NextResponse.json(DB_DOWN, { status: 503 });
  }
  if (!updated) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  return NextResponse.json({ account: updated });
}

// Remove an account (admin only). This BANS the user — see removeAccount.
export async function DELETE(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return denyResponse(guard);
  const admin = guard.admin;

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
//
// Clearing the ban flag is the whole restore: removeAccount no longer wipes
// role/permissions/verification, so the account comes back exactly as it was.
export async function PUT(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return denyResponse(guard);

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
  return [...new Set(
    value.filter((p): p is Permission => VALID_PERMISSIONS.includes(p as Permission))
  )];
}
