import { eq, sql } from "drizzle-orm";
import { getSessionUser } from "./auth";
import { getDb } from "./db";
import { profiles } from "./schema";
import type { Account, Permission, UserRole } from "@/types";

// ------------------------------------------------------------------
// Account store — backed by the `profiles` table in Postgres
// (Supabase). Accounts are created by Discord OAuth and extended by
// onboarding. No demo accounts — every account is a real person.
// ------------------------------------------------------------------

function rowToAccount(row: typeof profiles.$inferSelect): Account {
  return {
    id: row.id,
    username: row.username,
    email: row.email ?? undefined,
    avatarUrl: row.avatarUrl ?? undefined,
    role: (row.role === "admin" ? "admin" : "member") as UserRole,
    permissions: (row.permissions ?? []) as Permission[],
    minecraftUsername: row.minecraftUsername ?? undefined,
    discordVerified: row.discordVerified ?? false,
    onboarded: row.onboarded ?? false,
    banned: row.banned ?? false,
    createdAt: row.createdAt ?? undefined,
  };
}

/** All accounts including banned ones (for the admin panel's ban list). */
export async function listAccounts(): Promise<Account[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.select().from(profiles);
  return rows.map(rowToAccount);
}

export async function findAccount(id: string): Promise<Account | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db.select().from(profiles).where(eq(profiles.id, id)).limit(1);
  return rows[0] ? rowToAccount(rows[0]) : null;
}

export type AccountGate =
  | { status: "ok"; account: Account }
  | { status: "unconfigured" }
  | { status: "missing" }
  | { status: "banned" }
  | { status: "db_error" };

/**
 * Live-account gate for write routes, distinguishing the failure modes
 * that `.catch(() => null)` used to collapse into one:
 *   missing/banned → a REAL 403 (the account was removed after login),
 *   db_error       → must be a 503. During a pooler outage every lookup
 *                    failed and members were told "Your account no longer
 *                    exists on this server" — a lie that locked them out
 *                    of chat, posting and uploads site-wide.
 *   unconfigured   → site running without a database (fallback mode);
 *                    routes proceed on the session cookie's claims.
 */
export async function accountGate(id: string): Promise<AccountGate> {
  if (!getDb()) return { status: "unconfigured" };
  try {
    const account = await findAccount(id);
    if (!account) return { status: "missing" };
    if (account.banned) return { status: "banned" };
    return { status: "ok", account };
  } catch (err) {
    console.error("accountGate: lookup failed", err);
    return { status: "db_error" };
  }
}

/** The 503 body for db_error — shared by every gated route. */
export const ACCOUNT_DB_ERROR_MESSAGE =
  "The member database is unreachable right now — give it a moment and try again.";

export async function addAccount(input: {
  id: string;
  username: string;
  email?: string;
  avatarUrl?: string;
  role: UserRole;
  permissions?: Permission[];
}): Promise<Account> {
  const db = getDb();
  if (!db) throw new Error("Database not configured");
  const rows = await db
    .insert(profiles)
    .values({
      id: input.id,
      username: input.username,
      email: input.email,
      avatarUrl: input.avatarUrl,
      role: input.role,
      permissions: input.permissions ?? [],
      createdAt: new Date().toISOString(),
    })
    // Two simultaneous first logins for the same Discord id must not both
    // try to insert (primary-key violation → one login fails). If we lost
    // the race the second INSERT is a no-op and we fall back to the read.
    .onConflictDoNothing({ target: profiles.id })
    .returning();
  if (rows[0]) return rowToAccount(rows[0]);
  const existing = await findAccount(input.id);
  if (existing) return existing;
  throw new Error("Account creation failed");
}

export async function updateAccount(
  id: string,
  patch: Partial<
    Pick<
      Account,
      "role" | "permissions" | "username" | "email" | "discordVerified" | "onboarded" | "banned"
    > & { avatarUrl?: string | null; minecraftUsername?: string | null }
  >
): Promise<Account | null> {
  const db = getDb();
  if (!db) return null;
  // An empty patch would emit a malformed `UPDATE … SET  WHERE id = …`.
  // Skip the write and just return the current row.
  if (Object.keys(patch).length === 0) {
    return findAccount(id);
  }
  const rows = await db
    .update(profiles)
    .set({
      ...(patch.username !== undefined ? { username: patch.username } : {}),
      ...(patch.email !== undefined ? { email: patch.email } : {}),
      ...(patch.avatarUrl !== undefined ? { avatarUrl: patch.avatarUrl } : {}),
      ...(patch.role !== undefined ? { role: patch.role } : {}),
      ...(patch.permissions !== undefined ? { permissions: patch.permissions } : {}),
      ...(patch.minecraftUsername !== undefined
        ? { minecraftUsername: patch.minecraftUsername }
        : {}),
      ...(patch.discordVerified !== undefined
        ? { discordVerified: patch.discordVerified }
        : {}),
      ...(patch.onboarded !== undefined ? { onboarded: patch.onboarded } : {}),
      ...(patch.banned !== undefined ? { banned: patch.banned } : {}),
    })
    .where(eq(profiles.id, id))
    .returning();
  return rows[0] ? rowToAccount(rows[0]) : null;
}

// Removing an account BANS it instead of deleting the row: Discord OAuth
// recreates accounts on login, so a deleted row would just let the user
// back in. A banned row denies login and all capabilities until an admin
// restores it.
export async function removeAccount(id: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const rows = await db
    .update(profiles)
    .set({
      banned: true,
      role: "member",
      permissions: [],
      discordVerified: false,
      onboarded: false,
    })
    .where(eq(profiles.id, id))
    .returning();
  return rows.length > 0;
}

// ------------------------------------------------------------------
// Permission grants/revokes done in SQL instead of read-modify-write.
// The naive form (read array in JS → merge → overwrite the column)
// loses updates when two writers race — e.g. an admin granting a perk
// at the same moment the member re-verifies Discord, and whichever
// wrote last silently erased the other's change. Both helpers below
// let Postgres merge into the CURRENT column value atomically.
// ------------------------------------------------------------------

/** Grant permissions, deduped, without clobbering concurrent grants. */
export async function addPermissions(
  id: string,
  perms: Permission[]
): Promise<Account | null> {
  const db = getDb();
  if (!db) return null;
  if (perms.length === 0) return findAccount(id);
  const rows = await db
    .update(profiles)
    .set({
      permissions: sql`(select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from jsonb_array_elements(${profiles.permissions} || ${JSON.stringify(perms)}::jsonb) as t(x))`,
    })
    .where(eq(profiles.id, id))
    .returning();
  return rows[0] ? rowToAccount(rows[0]) : null;
}

/** Revoke permissions without touching anything else concurrently granted. */
export async function removePermissions(
  id: string,
  perms: Permission[]
): Promise<Account | null> {
  const db = getDb();
  if (!db) return null;
  if (perms.length === 0) return findAccount(id);
  const rows = await db
    .update(profiles)
    .set({
      // jsonb `- text[]` drops every matching string element.
      permissions: sql`${profiles.permissions} - ${sql.param(perms)}::text[]`,
    })
    .where(eq(profiles.id, id))
    .returning();
  return rows[0] ? rowToAccount(rows[0]) : null;
}

/**
 * Persist a definitive Discord verification answer. The permission delta is
 * applied in SQL (see above) so it can't erase a concurrent admin grant.
 */
export async function applyDiscordVerification(
  id: string,
  verified: boolean
): Promise<Account | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .update(profiles)
    .set(
      verified
        ? {
            discordVerified: true,
            permissions: sql`(select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from jsonb_array_elements(${profiles.permissions} || ${JSON.stringify(VERIFIED_PERMISSIONS)}::jsonb) as t(x))`,
          }
        : {
            discordVerified: false,
            permissions: sql`${profiles.permissions} - ${sql.param(VERIFIED_PERMISSIONS)}::text[]`,
          }
    )
    .where(eq(profiles.id, id))
    .returning();
  return rows[0] ? rowToAccount(rows[0]) : null;
}

/**
 * Find an account by Discord user id, creating one on first login.
 * Accounts are keyed `discord:<id>` so they never collide with anything.
 * New sign-ins start as members with AI access and onboarded=false, so
 * they get sent through onboarding.
 */
export async function findOrCreateDiscordAccount(input: {
  id: string;
  username: string;
  avatarUrl?: string | null;
}): Promise<Account> {
  const id = `discord:${input.id}`;
  const existing = await findAccount(id);
  if (existing?.banned) {
    // Removed by an admin — the denylisted row must not resurrect itself.
    throw new Error("ACCOUNT_BANNED");
  }
  if (existing) {
    // Refresh the profile picture on every login so avatar changes on
    // Discord show up here too — including REMOVING it (avatarUrl null),
    // otherwise a deleted Discord PFP leaves a stale, soon-404ing URL.
    if ((input.avatarUrl ?? null) !== (existing.avatarUrl ?? null)) {
      const updated = await updateAccount(id, { avatarUrl: input.avatarUrl ?? null });
      if (updated) return updated;
    }
    return existing;
  }
  // New members start with NO permissions — everything is earned:
  // verifying they're in the official Discord server unlocks AI, Gallery
  // posting, and Server Control, and the admin code promotes to admin.
  return addAccount({
    id,
    username: input.username,
    avatarUrl: input.avatarUrl ?? undefined,
    role: "member",
    permissions: [],
  });
}

/**
 * Permissions a member earns by verifying they're in the official Discord
 * server. Verification is the live source of truth for these three
 * capabilities — see each `can*` helper below.
 */
export const VERIFIED_PERMISSIONS: Permission[] = [
  "ai_access",
  "gallery_post",
  "server_control",
];

/**
 * Can this account chat with the AI assistant?
 *
 * Admins always can. Otherwise: verified Discord members can, and an
 * explicit `ai_access` permission grants it too (admin override). Reading
 * `discordVerified` live means a member who leaves the server loses AI
 * access immediately even if the bit was granted earlier.
 */
export function canUseAiAssistant(account: Account | undefined): boolean {
  if (!account || account.banned) return false;
  if (account.role === "admin") return true;
  if (account.discordVerified === true) return true;
  return account.permissions.includes("ai_access");
}

/**
 * Can this account post to the gallery?
 *
 * Verified Discord members are always allowed (verification is the live
 * source of truth), admins are always allowed, and an explicit `gallery_post`
 * permission grants it too (for manual admin override). Reading
 * `discordVerified` live means a member who leaves the server loses the
 * ability immediately even if they were granted the bit earlier.
 */
export function canPostToGallery(account: Account | undefined): boolean {
  if (!account || account.banned) return false;
  if (account.role === "admin") return true;
  if (account.discordVerified === true) return true;
  return account.permissions.includes("gallery_post");
}

/**
 * Can this account start/stop the Minecraft server?
 *
 * Same rule as AI + gallery: admins always, verified members always,
 * or an explicit `server_control` grant (admin override).
 */
export function canControlServer(account: Account | undefined): boolean {
  if (!account || account.banned) return false;
  if (account.role === "admin") return true;
  if (account.discordVerified === true) return true;
  return account.permissions.includes("server_control");
}

/**
 * Admin check with the CURRENT database role, not the session cookie.
 *
 * The session JWT lives for 7 days, so `user.role` from the cookie goes
 * stale the moment an admin is demoted (or removed) in the Manage Panel —
 * without this, a demoted admin keeps admin powers (and a removed one
 * keeps the role) until the cookie expires. Re-reading the account from
 * the database makes role changes take effect immediately, matching what
 * `/api/auth/me` already does for the client UI.
 *
 * Falls back to the session role when no database is configured, so the
 * site still works in "no DB yet" mode.
 *
 * Tri-state on purpose: "db_error" is a TRANSIENT OUTAGE, not a demotion.
 * Collapsing it into "no" made every admin route answer 403 "Forbidden"
 * (and /admin bounce its admins home) during exactly the kind of pooler
 * incident `accountGate` was written to stop lying about. Callers must
 * answer db_error with a 503 instead.
 */
export async function checkAdmin(): Promise<"yes" | "no" | "db_error"> {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") return "no";
  if (!getDb()) return "yes"; // no database — trust the signed session
  try {
    const account = await findAccount(user.id);
    return account?.role === "admin" && !account.banned ? "yes" : "no";
  } catch (err) {
    console.error("checkAdmin: lookup failed", err);
    return "db_error";
  }
}
// No boolean isAdminUser() wrapper is provided on purpose: every caller must
// handle the "db_error" tri-state (fail closed) instead of collapsing the
// outage case into a plain false and silently locking admins out.
