import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { profiles } from "./schema";
import type { Account, Permission, SessionUser, UserRole } from "@/types";

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
    role: (row.role === "admin" ? "admin" : "member") as UserRole,
    permissions: (row.permissions ?? []) as Permission[],
    minecraftUsername: row.minecraftUsername ?? undefined,
    discordVerified: row.discordVerified ?? false,
    onboarded: row.onboarded ?? false,
    createdAt: row.createdAt ?? undefined,
  };
}

export async function getAllAccounts(): Promise<Account[]> {
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

export async function addAccount(input: {
  id: string;
  username: string;
  email?: string;
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
      role: input.role,
      permissions: input.permissions ?? [],
      createdAt: new Date().toISOString().slice(0, 10),
    })
    .returning();
  return rowToAccount(rows[0]);
}

export async function updateAccount(
  id: string,
  patch: Partial<
    Pick<
      Account,
      "role" | "permissions" | "username" | "email" | "minecraftUsername" | "discordVerified" | "onboarded"
    >
  >
): Promise<Account | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .update(profiles)
    .set({
      ...(patch.username !== undefined ? { username: patch.username } : {}),
      ...(patch.email !== undefined ? { email: patch.email } : {}),
      ...(patch.role !== undefined ? { role: patch.role } : {}),
      ...(patch.permissions !== undefined ? { permissions: patch.permissions } : {}),
      ...(patch.minecraftUsername !== undefined
        ? { minecraftUsername: patch.minecraftUsername }
        : {}),
      ...(patch.discordVerified !== undefined
        ? { discordVerified: patch.discordVerified }
        : {}),
      ...(patch.onboarded !== undefined ? { onboarded: patch.onboarded } : {}),
    })
    .where(eq(profiles.id, id))
    .returning();
  return rows[0] ? rowToAccount(rows[0]) : null;
}

export async function removeAccount(id: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const rows = await db.delete(profiles).where(eq(profiles.id, id)).returning();
  return rows.length > 0;
}

/** Shape a stored Account into the SessionUser carried in the cookie. */
export function toSessionUser(account: Account): SessionUser {
  return {
    id: account.id,
    username: account.username,
    role: account.role,
    permissions: [...account.permissions],
  };
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
}): Promise<Account> {
  const id = `discord:${input.id}`;
  const existing = await findAccount(id);
  if (existing) return existing;
  return addAccount({
    id,
    username: input.username,
    role: "member",
    permissions: ["ai_access"],
  });
}

/** True if this account can do the given thing. */
export function hasPermission(account: Account | undefined, permission: Permission): boolean {
  if (!account) return false;
  if (account.role === "admin") return true;
  return account.permissions.includes(permission);
}
