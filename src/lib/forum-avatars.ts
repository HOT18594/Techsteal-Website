// Resolve forum authors to profile pictures.
//
// Threads and replies store the author's account id (`authorId`, e.g.
// "discord:1234..."). The account's Discord profile picture is preferred;
// accounts without one fall back to their Minecraft skin head (via
// minotar — no key needed), then to a letter tile.

import { inArray, or } from "drizzle-orm";
import { getDb } from "./db";
import { profiles } from "./schema";

export interface AuthorAvatar {
  /** Discord PFP (preferred) or skin-head URL, or null for a letter tile. */
  avatarUrl: string | null;
  /** Deterministic letter-tile color for this author. */
  color: string;
}

const COLORS = [
  "avatar-1",
  "avatar-2",
  "avatar-3",
  "avatar-4",
  "avatar-5",
  "avatar-6",
  "avatar-7",
  "avatar-8",
];

/** Skin head URL for a Minecraft username (same service as settings). */
export function minotarUrl(username: string): string {
  return `https://minotar.net/helm/${encodeURIComponent(username)}/64.png`;
}

function colorFor(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return COLORS[h % COLORS.length];
}

/**
 * Given forum rows (threads or replies), fetch the matching profiles and
 * return a map of avatar info. Keyed by account id when available, and
 * ALSO by lowercase username so legacy posts (which predate authorId)
 * still resolve their author's Discord profile picture.
 */
export async function resolveAuthorAvatars(
  rows: Array<{ authorId?: string | null; author?: string | null }>
): Promise<Map<string, AuthorAvatar>> {
  const db = getDb();
  const map = new Map<string, AuthorAvatar>();
  if (!db) return map;

  const ids = [
    ...new Set(rows.map((r) => r.authorId).filter((x): x is string => Boolean(x))),
  ];
  const names = [
    ...new Set(
      rows
        .filter((r) => !r.authorId)
        .map((r) => r.author?.trim())
        .filter((x): x is string => Boolean(x))
    ),
  ];
  if (ids.length === 0 && names.length === 0) return map;

  const conditions = [];
  if (ids.length > 0) conditions.push(inArray(profiles.id, ids));
  if (names.length > 0) conditions.push(inArray(profiles.username, names));

  const found = await db
    .select({
      id: profiles.id,
      username: profiles.username,
      minecraftUsername: profiles.minecraftUsername,
      avatarUrl: profiles.avatarUrl,
    })
    .from(profiles)
    .where(conditions.length === 1 ? conditions[0] : or(...conditions));

  const byId = new Map(found.map((f) => [f.id, f]));
  const byName = new Map(found.map((f) => [f.username.toLowerCase(), f]));

  const infoFor = (p: (typeof found)[number] | undefined, key: string) => ({
    // Discord profile picture first, Minecraft skin head as fallback.
    avatarUrl: p?.avatarUrl ?? (p?.minecraftUsername ? minotarUrl(p.minecraftUsername) : null),
    color: colorFor(key),
  });

  for (const id of ids) map.set(id, infoFor(byId.get(id), id));
  for (const name of names) {
    const p = byName.get(name.toLowerCase());
    if (p) map.set(name.toLowerCase(), infoFor(p, p.id));
  }
  return map;
}

/** Look up a forum row's avatar info — by account id first, then username. */
export function avatarInfoFor(
  map: Map<string, AuthorAvatar>,
  row: { authorId?: string | null; author?: string | null }
): AuthorAvatar | undefined {
  if (row.authorId) {
    const byId = map.get(row.authorId);
    if (byId) return byId;
  }
  if (row.author) return map.get(row.author.trim().toLowerCase());
  return undefined;
}
