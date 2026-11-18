import { NextResponse } from "next/server";
import {
  ACCOUNT_DB_ERROR_MESSAGE,
  addPermissions,
  applyDiscordVerification,
  findAccount,
  listAccounts,
  removeAccount,
  removePermissions,
  requireAdminAccount,
  updateAccount,
} from "@/lib/accounts";
import { logAudit } from "@/lib/audit";
import { checkDiscordGuildMembership } from "@/lib/discord";
import { isValidMcName } from "@/lib/mc-name";
import type { Account, Permission } from "@/types";

export const dynamic = "force-dynamic";

const VALID_PERMISSIONS: Permission[] = ["server_control", "ai_access", "gallery_post"];

const DB_DOWN = { error: ACCOUNT_DB_ERROR_MESSAGE };

// Checks the CURRENT database role and loads the fresh admin profile so
// demotions take effect immediately and audit entries always use the live
// username rather than a stale 7-day JWT claim.
async function requireAdmin(): Promise<
  { ok: true; admin: Account } | { ok: false; response: NextResponse }
> {
  const gate = await requireAdminAccount();
  if (gate.status === "db_error") {
    return { ok: false, response: NextResponse.json(DB_DOWN, { status: 503 }) };
  }
  if (gate.status === "no") {
    return { ok: false, response: NextResponse.json({ error: "Admins only." }, { status: 403 }) };
  }
  return { ok: true, admin: gate.account };
}

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const record = err as { code?: string; cause?: unknown };
  if (record.code === "23505") return true;
  if (record.cause && typeof record.cause === "object") {
    return (record.cause as { code?: string }).code === "23505";
  }
  return false;
}

// List all accounts (admin only). Banned (removed) accounts are included
// separately so they can be restored.
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  let all: Account[];
  try {
    all = await listAccounts();
  } catch (err) {
    console.error("api/admin/members GET: listAccounts failed", err);
    return NextResponse.json(DB_DOWN, { status: 503 });
  }
  return NextResponse.json({
    accounts: all.filter((a) => !a.banned),
    bannedAccounts: all.filter((a) => a.banned),
  });
}

// Update an account's role, permissions, Minecraft username, onboarding state,
// or Discord verification (admin only).
//
// Body: {
//   id: string,
//   role?: "admin" | "member",
//   grant?: Permission[],
//   revoke?: Permission[],
//   permissions?: Permission[],
//   minecraftUsername?: string | null,
//   onboarded?: boolean,
//   discordVerified?: boolean,
//   reverifyDiscord?: true,
// }
export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const admin = guard.admin;

  const body = await request.json().catch(() => ({}));
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  // Live Discord guild re-check path.
  if (raw.reverifyDiscord === true) {
    let existing: Account | null;
    try {
      existing = await findAccount(id);
    } catch (err) {
      console.error("api/admin/members POST: findAccount failed", err);
      return NextResponse.json(DB_DOWN, { status: 503 });
    }
    if (!existing) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const res = await checkDiscordGuildMembership(id);
    if (res.status === "unconfigured") {
      return NextResponse.json(
        { error: "Discord server verification isn't configured right now." },
        { status: 503 }
      );
    }
    if (res.status === "transient_error") {
      return NextResponse.json(
        { error: "Couldn't reach Discord right now — give it a moment and try again." },
        { status: 503 }
      );
    }

    let updated: Account | null;
    try {
      updated = await applyDiscordVerification(id, res.verified);
    } catch (err) {
      console.error("api/admin/members POST: applyDiscordVerification failed", err);
      return NextResponse.json(DB_DOWN, { status: 503 });
    }
    if (!updated) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    await logAudit({
      actorId: admin.id,
      actorName: admin.username,
      action: "member_verify",
      targetId: id,
      targetName: updated.username,
      detail: res.verified
        ? "Discord verified via guild check"
        : "Not in Discord guild — perks revoked",
    });

    return NextResponse.json({ account: updated, discordVerified: res.verified });
  }

  // Never let an admin demote themselves — that would lock them out of
  // the Manage Panel with no way back in.
  if (id === admin.id && raw.role === "member") {
    return NextResponse.json({ error: "You can't demote yourself." }, { status: 400 });
  }

  const patch: Parameters<typeof updateAccount>[1] = {};
  if (raw.role === "admin" || raw.role === "member") patch.role = raw.role;
  if (Array.isArray(raw.permissions)) patch.permissions = sanitizePermissions(raw.permissions);

  // Minecraft username: null or "" clears it; non-empty validates against Mojang rules.
  if (raw.minecraftUsername !== undefined) {
    if (raw.minecraftUsername === null) {
      patch.minecraftUsername = null;
    } else if (typeof raw.minecraftUsername === "string") {
      const trimmedMc = raw.minecraftUsername.trim();
      if (trimmedMc === "") {
        patch.minecraftUsername = null;
      } else if (!isValidMcName(trimmedMc)) {
        return NextResponse.json(
          { error: "Minecraft usernames must be 1–16 letters, numbers, or underscores." },
          { status: 400 }
        );
      } else {
        patch.minecraftUsername = trimmedMc;
      }
    } else {
      return NextResponse.json({ error: "Invalid Minecraft username." }, { status: 400 });
    }
  }

  if (raw.onboarded !== undefined) {
    if (typeof raw.onboarded !== "boolean") {
      return NextResponse.json({ error: "Invalid onboarded flag." }, { status: 400 });
    }
    patch.onboarded = raw.onboarded;
  }

  let manualDiscordVerified: boolean | undefined;
  if (raw.discordVerified !== undefined) {
    if (typeof raw.discordVerified !== "boolean") {
      return NextResponse.json({ error: "Invalid discordVerified flag." }, { status: 400 });
    }
    manualDiscordVerified = raw.discordVerified;
  }

  const grant = sanitizePermissions(raw.grant);
  const revoke = sanitizePermissions(raw.revoke);
  // A perk in both lists is a contradictory request, not something to guess at.
  const conflict = grant.find((p) => revoke.includes(p));
  if (conflict) {
    return NextResponse.json(
      { error: `"${conflict}" can't be granted and revoked in the same request.` },
      { status: 400 }
    );
  }

  if (
    Object.keys(patch).length === 0 &&
    manualDiscordVerified === undefined &&
    grant.length === 0 &&
    revoke.length === 0
  ) {
    return NextResponse.json(
      {
        error:
          "Nothing to update — send role, permissions, grant, revoke, minecraftUsername, onboarded, or discordVerified.",
      },
      { status: 400 }
    );
  }

  let updated: Account | null = null;
  let partialCommit = false;
  try {
    if (Object.keys(patch).length > 0) {
      updated = await updateAccount(id, patch);
      if (!updated) return NextResponse.json({ error: "Account not found" }, { status: 404 });
      partialCommit = true;
    }
    if (manualDiscordVerified !== undefined) {
      updated = await applyDiscordVerification(id, manualDiscordVerified);
      if (!updated) return NextResponse.json({ error: "Account not found" }, { status: 404 });
      partialCommit = true;
    }
    if (grant.length > 0) {
      updated = await addPermissions(id, grant);
      if (!updated) return NextResponse.json({ error: "Account not found" }, { status: 404 });
      partialCommit = true;
    }
    if (revoke.length > 0) {
      updated = await removePermissions(id, revoke);
      if (!updated) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json(
        { error: "Another member has already linked that Minecraft username." },
        { status: 409 }
      );
    }
    console.error("api/admin/members POST: update failed", err);
    return NextResponse.json(
      partialCommit
        ? {
            error:
              "Part of the update was saved, but a follow-up step hit a database hiccup — refresh the member list and re-check their settings.",
          }
        : DB_DOWN,
      { status: 503 }
    );
  }
  if (!updated) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  // Record each privileged change against the actor and target. Best-effort:
  // logAudit never throws, so a trail failure can't undo a committed change.
  const actor = { actorId: admin.id, actorName: admin.username };
  const target = { targetId: id, targetName: updated.username };
  if (patch.role !== undefined) {
    await logAudit({ ...actor, ...target, action: "role_change", detail: `Role set to ${updated.role}` });
  }
  if (patch.minecraftUsername !== undefined) {
    await logAudit({
      ...actor,
      ...target,
      action: "member_update",
      detail: patch.minecraftUsername
        ? `MC set to ${patch.minecraftUsername}`
        : "Cleared Minecraft username",
    });
  }
  if (patch.onboarded !== undefined) {
    await logAudit({
      ...actor,
      ...target,
      action: "member_update",
      detail: patch.onboarded ? "Marked onboarding complete" : "Reset onboarding status",
    });
  }
  if (manualDiscordVerified !== undefined) {
    await logAudit({
      ...actor,
      ...target,
      action: "member_verify",
      detail: manualDiscordVerified
        ? "Discord verified (manual override)"
        : "Discord verification revoked (manual override)",
    });
  }
  if (grant.length > 0) {
    await logAudit({ ...actor, ...target, action: "permission_grant", detail: grant.join(", ") });
  }
  if (revoke.length > 0) {
    await logAudit({ ...actor, ...target, action: "permission_revoke", detail: revoke.join(", ") });
  }
  if (patch.permissions !== undefined) {
    await logAudit({
      ...actor,
      ...target,
      action: "permissions_set",
      detail: patch.permissions.length ? patch.permissions.join(", ") : "Cleared all permissions",
    });
  }

  return NextResponse.json({ account: updated });
}

// Remove an account (admin only). This BANS the user — see removeAccount.
export async function DELETE(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const admin = guard.admin;

  const body = await request.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  // Never let an admin remove their own account.
  if (id === admin.id) {
    return NextResponse.json({ error: "You can't remove yourself." }, { status: 400 });
  }

  let removed: boolean;
  let targetName = "";
  try {
    // Read the name before banning so the audit trail records who was removed.
    targetName = (await findAccount(id))?.username ?? "";
    removed = await removeAccount(id);
  } catch (err) {
    console.error("api/admin/members DELETE: removeAccount failed", err);
    return NextResponse.json(DB_DOWN, { status: 503 });
  }
  if (!removed) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  await logAudit({ actorId: admin.id, actorName: admin.username, action: "ban", targetId: id, targetName });
  return NextResponse.json({ ok: true });
}

// Restore a banned account (admin only). Body: { id }
export async function PUT(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const admin = guard.admin;

  const body = await request.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  let restored: Account | null;
  try {
    restored = await updateAccount(id, { banned: false });
  } catch (err) {
    console.error("api/admin/members PUT: restore failed", err);
    return NextResponse.json(DB_DOWN, { status: 503 });
  }
  if (!restored) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  await logAudit({
    actorId: admin.id,
    actorName: admin.username,
    action: "unban",
    targetId: id,
    targetName: restored.username,
  });
  return NextResponse.json({ account: restored });
}

function sanitizePermissions(value: unknown): Permission[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter((p): p is Permission => VALID_PERMISSIONS.includes(p as Permission))
    ),
  ];
}
