// Resolve forum authors to profile pictures.
//
// Threads and replies store the author's account id (`authorId`, e.g.
// "discord:1234..."). The account's Discord profile picture is preferred;
// accounts without one fall back to their Minecraft skin head (via
// minotar — no key needed), then to a letter tile.

import { inArray } from "drizzle-orm";
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
 * Given forum rows (threads or replies) that carry `authorId`, fetch the
 * matching profiles and return a map of authorId → avatar info.
 */
export async function resolveAuthorAvatars(
  rows: Array<{ authorId?: string | null }>
): Promise<Map<string, AuthorAvatar>> {
  const db = getDb();
  const map = new Map<string, AuthorAvatar>();
  if (!db) return map;

  const ids = [
    ...new Set(rows.map((r) => r.authorId).filter((x): x is string => Boolean(x))),
  ];
  if (ids.length === 0) return map;

  const found = await db
    .select({
      id: profiles.id,
      minecraftUsername: profiles.minecraftUsername,
      avatarUrl: profiles.avatarUrl,
    })
    .from(profiles)
    .where(inArray(profiles.id, ids));

  const byAuthor = new Map(found.map((f) => [f.id, f]));
  for (const id of ids) {
    const p = byAuthor.get(id);
    map.set(id, {
      // Discord profile picture first, Minecraft skin head as fallback.
      avatarUrl: p?.avatarUrl ?? (p?.minecraftUsername ? minotarUrl(p.minecraftUsername) : null),
      color: colorFor(id),
    });
  }
  return map;
}
