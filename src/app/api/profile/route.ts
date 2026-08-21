import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { findAccount, updateAccount } from "@/lib/accounts";
import { getSessionUser, setSession } from "@/lib/auth";
import { getAdminCode } from "@/lib/admin-code";
import { isRateLimited } from "@/lib/rate-limit";
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

// Valid Minecraft usernames: 1–16 chars of letters, digits or underscore.
// (Since 2022 Mojang allows any length ≥1 and prefixes like "." are illegal.)
const MC_NAME_RE = /^[A-Za-z0-9_]{1,16}$/;

// Update profile fields. Body may include:
//   { minecraftUsername?, onboarded?, adminCode? }
//
// NOTE: `discordVerified` is intentionally NOT settable here — it's a trust
// badge that can only be flipped by the server after a real Discord
// guild-membership check (`/api/auth/discord/verify`), never by the client.
//
// Passing the correct adminCode promotes the account to admin.
export async function PATCH(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const body = await request.json().catch(() => ({}));
  const patch: Parameters<typeof updateAccount>[1] = {};

  if (typeof body.minecraftUsername === "string") {
    const name = body.minecraftUsername.trim();
    if (name.length > 0 && !MC_NAME_RE.test(name)) {
      return NextResponse.json(
        { error: "Minecraft usernames can only use letters, numbers and underscores (1–16 chars)." },
        { status: 400 }
      );
    }
    // An empty string means "clear" — same as sending null.
    patch.minecraftUsername = name.length ? name : null;
  } else if (body.minecraftUsername === null) {
    // Explicitly clearing the field (settings sends `null`).
    patch.minecraftUsername = null;
  }
  if (typeof body.onboarded === "boolean") patch.onboarded = body.onboarded;

  const account: Account | null = await findAccount(user.id);
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Admin code claim — exact match promotes to admin. Failures are explicit
  // (403, rate-limited) so onboarding can tell a wrong code apart from a
  // success, and slow down brute-forcing.
  if (typeof body.adminCode === "string" && body.adminCode.trim().length > 0) {
    // Key the limiter on the signed-in user too — x-forwarded-for alone is
    // spoofable on misconfigured hosts and would let an attacker rotate IPs.
    if (
      isRateLimited(`admincode:${user.id}`, 10, 10 * 60 * 1000) ||
      isRateLimited(`admincode:${ip}`, 30, 10 * 60 * 1000)
    ) {
      return NextResponse.json(
        { error: "Too many attempts — wait a bit before trying the admin code again." },
        { status: 429 }
      );
    }
    if (!getAdminCode()) {
      return NextResponse.json(
        { error: "The admin code isn't configured on this server yet." },
        { status: 403 }
      );
    }
    // Compare SHA-256 digests instead of raw strings — constant-time-ish and
    // avoids any early-exit string comparison leaking length/prefix info.
    const configuredCode = getAdminCode();
    const attempt = createHash("sha256").update(body.adminCode.trim()).digest();
    const expected = createHash("sha256").update(configuredCode ?? "").digest();
    if (!timingSafeEqual(attempt, expected)) {
      return NextResponse.json(
        { error: "That admin code isn't right." },
        { status: 403 }
      );
    }
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
    avatarUrl: updated.avatarUrl,
  });

  return NextResponse.json({ profile: updated });
}
