import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { profiles } from "@/lib/schema";
import { fallbackMembers } from "@/lib/fallback-data";
import { getServerStatus } from "@/lib/mcsrv";
import { minotarUrl } from "@/lib/forum-avatars";
import type { Member } from "@/types";

export const dynamic = "force-dynamic";

// Real member directory: backed by the `profiles` table (Discord accounts),
// not the static `members` content table. Each entry carries the account's
// Discord profile picture (or a Minecraft skin-head fallback) and an
// online/offline status derived from the live server player list.
//
// A profile counts as "online" if its Minecraft username is currently in the
// server's player list (queried from mcsrvstat.us). Accounts without a
// Minecraft username are "offline" — we can't know their in-game presence.
export async function GET() {
  const db = getDb();
  if (!db) return NextResponse.json(fallbackMembers);

  const rows = await db
    .select({
      id: profiles.id,
      username: profiles.username,
      role: profiles.role,
      avatarUrl: profiles.avatarUrl,
      minecraftUsername: profiles.minecraftUsername,
      discordVerified: profiles.discordVerified,
      createdAt: profiles.createdAt,
    })
    .from(profiles)
    .orderBy(profiles.username);

  // Fetch live status once and build a set of currently-online Minecraft
  // names so each account can be marked without per-row API calls.
  let onlineNames = new Set<string>();
  try {
    const status = await getServerStatus();
    if (status.source === "live" && status.online) {
      onlineNames = new Set((status.playerList ?? []).map((n) => n.toLowerCase()));
    }
  } catch {
    // status unavailable — everyone shows offline, which is safe/honest.
  }

  const members: Member[] = rows.map((row, i) => {
    const mcName = row.minecraftUsername?.trim();
    const online = mcName ? onlineNames.has(mcName.toLowerCase()) : false;
    return {
      id: i + 1,
      name: row.username,
      role: row.role === "admin" ? "Admin" : "Member",
      icon: row.role === "admin" ? "fa-shield-halved" : "fa-user",
      avatar: row.username.slice(0, 1).toUpperCase(),
      // Discord PFP first; Minecraft skin head fallback; null → letter tile.
      avatarUrl: row.avatarUrl ?? (mcName ? minotarUrl(mcName) : null),
      color: colorFor(row.id),
      status: online ? "online" : "offline",
      joined: row.createdAt ?? "",
      playtime: row.discordVerified ? "verified" : "member",
    };
  });

  return NextResponse.json(members);
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

/** Deterministic letter-tile color for an account id. */
function colorFor(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return COLORS[h % COLORS.length];
}
