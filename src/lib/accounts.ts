import type { Account, Permission, SessionUser, UserRole } from "@/types";

// ------------------------------------------------------------------
// Demo account store
//
// Discord OAuth isn't wired up yet, so these seed accounts let the role
// system actually work. Admins can promote/demote and grant permissions
// from the /admin panel.
//
// NOTE: this is an in-memory store (resets when the server restarts).
// Swap it for the DB once DATABASE_URL is configured — the API surface
// (getAllAccounts / findAccount / updateAccount / removeAccount) is the
// same shape you'd implement against Postgres.
// ------------------------------------------------------------------

const SEED_ACCOUNTS: Account[] = [
  {
    id: "admin",
    username: "Admin",
    email: "admin@techsteal.space",
    role: "admin",
    permissions: ["server_control", "ai_access"],
    createdAt: "2026-08-18",
  },
  {
    id: "alex",
    username: "Alex",
    email: "alex@example.com",
    role: "member",
    permissions: ["ai_access"],
    createdAt: "2026-08-18",
  },
  {
    id: "sam",
    username: "Sam",
    email: "sam@example.com",
    role: "member",
    permissions: [],
    createdAt: "2026-08-18",
  },
  {
    id: "riley",
    username: "Riley",
    email: "riley@example.com",
    role: "member",
    permissions: [],
    createdAt: "2026-08-18",
  },
];

let accounts: Account[] = [...SEED_ACCOUNTS];

export function getAllAccounts(): Account[] {
  return accounts.map((a) => ({ ...a, permissions: [...a.permissions] }));
}

export function findAccount(id: string): Account | undefined {
  return accounts.find((a) => a.id === id);
}

export function addAccount(input: {
  id: string;
  username: string;
  email?: string;
  role: UserRole;
  permissions?: Permission[];
}): Account {
  const account: Account = {
    id: input.id,
    username: input.username,
    email: input.email,
    role: input.role,
    permissions: input.permissions ?? [],
    createdAt: new Date().toISOString().slice(0, 10),
  };
  accounts.push(account);
  return { ...account, permissions: [...account.permissions] };
}

export function updateAccount(
  id: string,
  patch: Partial<Pick<Account, "role" | "permissions" | "username" | "email">>
): Account | null {
  const idx = accounts.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  accounts[idx] = {
    ...accounts[idx],
    ...patch,
    permissions: patch.permissions
      ? [...patch.permissions]
      : [...accounts[idx].permissions],
  };
  return { ...accounts[idx], permissions: [...accounts[idx].permissions] };
}

export function removeAccount(id: string): boolean {
  const before = accounts.length;
  accounts = accounts.filter((a) => a.id !== id);
  return accounts.length < before;
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
 * Accounts are keyed `discord:<id>` so they never collide with demo
 * accounts. New sign-ins start as members with AI access.
 */
export function findOrCreateDiscordAccount(input: {
  id: string;
  username: string;
}): Account {
  const id = `discord:${input.id}`;
  const existing = findAccount(id);
  if (existing) return existing;

  const account: Account = {
    id,
    username: input.username,
    role: "member",
    permissions: ["ai_access"],
    createdAt: new Date().toISOString().slice(0, 10),
  };
  accounts.push(account);
  return { ...account, permissions: [...account.permissions] };
}
