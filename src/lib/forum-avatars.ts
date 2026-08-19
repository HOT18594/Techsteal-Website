// Resolve forum authors to profile pictures.
//
// Threads and replies store the author's account id (`authorId`, e.g.
// "discord:1234..."). When that account has a Minecraft username set, we
// render their Minecraft skin head (via minotar — no key needed) as the
// avatar; otherwise the UI falls back to a letter tile.

import { inArray } from "drizzle-orm";
import { getDb } from "./db";
import { profiles } from "./schema";

export interface AuthorAvatar {
  /** Skin-head URL, or null when the author has no Minecraft username. */
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
    .select({ id: profiles.id, minecraftUsername: profiles.minecraftUsername })
    .from(profiles)
    .where(inArray(profiles.id, ids));

  const mcByAuthor = new Map(found.map((f) => [f.id, f.minecraftUsername]));
  for (const id of ids) {
    const mc = mcByAuthor.get(id);
    map.set(id, {
      avatarUrl: mc ? minotarUrl(mc) : null,
      color: colorFor(id),
    });
  }
  return map;
}
