import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { addPermissions, findAccount, updateAccount } from "@/lib/accounts";
import { getSessionUser, setSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getAdminCode } from "@/lib/admin-code";
import { isValidMcName } from "@/lib/mc-name";
import { isRateLimited, rateLimitIp } from "@/lib/rate-limit";
import { profiles } from "@/lib/schema";
import type { Account } from "@/types";

export const dynamic = "force-dynamic";

// Current user's full profile (includes onboarding fields).
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let account: Account | null = null;
  try {
    account = await findAccount(user.id);
  } catch {
    // Pooler outage — must not read as "profile not found" (the settings
    // page would flip every badge to "Setup incomplete").
    return NextResponse.json(
      { error: "The member database is unreachable right now — try again in a moment." },
      { status: 503 }
    );
  }
  if (!account) {
    if (!process.env.DATABASE_URL) {
      // No-DB fallback mode: shape a minimal profile from the signed
      // session so settings/onboarding still work.
      return NextResponse.json({
        profile: {
          id: user.id,
          username: user.username,
          avatarUrl: user.avatarUrl,
          role: user.role,
          permissions: user.permissions,
          discordVerified: false,
          onboarded: true,
          banned: false,
        } satisfies Account,
      });
    }
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ profile: account });
}

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

  // Edge-appended XFF entry — client-supplied prefixes are spoofable.
  const ip = rateLimitIp(request);

  const body = await request.json().catch(() => ({}));
  const patch: Parameters<typeof updateAccount>[1] = {};
  let claimedAdmin = false;

  if (typeof body.minecraftUsername === "string") {
    const name = body.minecraftUsername.trim();
    if (name.length > 0 && !isValidMcName(name)) {
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

  let account: Account | null = null;
  try {
    account = await findAccount(user.id);
  } catch {
    return NextResponse.json(
      { error: "The member database is unreachable right now — try again in a moment." },
      { status: 503 }
    );
  }
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // A removed (banned) account's cookie may still be unexpired — it must
  // not keep editing its profile or claiming the admin code.
  if (account.banned) {
    return NextResponse.json({ error: "This account has been removed." }, { status: 403 });
  }

  // A linked Minecraft name must belong to exactly one member: the client
  // checks Mojang before saving, but a direct API caller could otherwise
  // claim any name — including one another member already wears — and read
  // as them in the directory and forum avatar fallbacks.
  if (patch.minecraftUsername) {
    const db = getDb();
    if (db) {
      const [taken] = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(
          and(eq(profiles.minecraftUsername, patch.minecraftUsername), ne(profiles.id, account.id))
        )
        .limit(1);
      if (taken) {
        return NextResponse.json(
          { error: "That Minecraft username is already linked to another member." },
          { status: 409 }
        );
      }
    }
  }

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
    const configuredCode = getAdminCode();
    if (!configuredCode) {
      return NextResponse.json(
        { error: "The admin code isn't configured on this server yet." },
        { status: 403 }
      );
    }
    // Compare SHA-256 digests instead of raw strings — constant-time-ish and
    // avoids any early-exit string comparison leaking length/prefix info.
    const attempt = createHash("sha256").update(body.adminCode.trim()).digest();
    const expected = createHash("sha256").update(configuredCode).digest();
    if (!timingSafeEqual(attempt, expected)) {
      return NextResponse.json(
        { error: "That admin code isn't right." },
        { status: 403 }
      );
    }
    patch.role = "admin";
    claimedAdmin = true;
  }

  let updated: Awaited<ReturnType<typeof updateAccount>>;
  try {
    updated = await updateAccount(account.id, patch);
  } catch (err) {
    // 23505 = unique violation on profiles_mc_name_uq. The SELECT above is a
    // check-then-write that races under concurrent claims; the partial unique
    // index is the real guarantee — surface the same friendly 409 here.
    if ((err as { code?: string } | null)?.code === "23505") {
      return NextResponse.json(
        { error: "That Minecraft username is already linked to another member." },
        { status: 409 }
      );
    }
    // Anything else here is a database failure, not a bad request. Rethrowing
    // surfaced Next's generic 500 ("Internal Server Error") and the settings
    // page rendered it as an unexplained save failure; a 503 with the same
    // wording as every other outage path is both truthful and retryable.
    console.error("profile PATCH: update failed", err);
    return NextResponse.json(
      { error: "The member database is unreachable right now — try again in a moment." },
      { status: 503 }
    );
  }
  if (updated && claimedAdmin) {
    // The server_control grant is merged in SQL — the old read-modify-write
    // of the whole array could erase a permission an admin granted a moment
    // earlier (or be erased by a concurrent verify).
    updated = (await addPermissions(account.id, ["server_control"])) ?? updated;
  }
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
