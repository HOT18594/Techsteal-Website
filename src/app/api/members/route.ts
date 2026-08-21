import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { profiles } from "@/lib/schema";
import { fallbackMembers } from "@/lib/fallback-data";
import { getServerStatus } from "@/lib/mcsrv";
import { minotarUrl } from "@/lib/forum-avatars";
import type { Member } from "@/types";

export const dynamic = "force-dynamic";

// The in-game member directory — Minecraft identities only.
//
// This list is about who plays on the server, so it shows Minecraft skin
// heads (minotar) — never Discord profile pictures (those belong to the
// admin panel / forum). Accounts without a linked Minecraft username are
// excluded entirely: they aren't part of the in-game roster (and the
// homepage slideshow only ever cycles MC-linked members too).
//
// A profile counts as "online" if its Minecraft username is currently in the
// server's player list (queried from mcsrvstat.us).
export async function GET() {
  const db = getDb();
  if (!db) return NextResponse.json(fallbackMembers);

  const rows = await db
    .select({
      id: profiles.id,
      username: profiles.username,
      role: profiles.role,
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

  const members: Member[] = rows
    .filter((row) => Boolean(row.minecraftUsername?.trim()))
    .map((row, i) => {
      const mcName = row.minecraftUsername!.trim();
      const online = onlineNames.has(mcName.toLowerCase());
      return {
        id: i + 1,
        name: row.username,
        role: row.role === "admin" ? "Admin" : "Member",
        icon: row.role === "admin" ? "fa-shield-halved" : "fa-user",
        avatar: row.username.slice(0, 1).toUpperCase(),
        // Minecraft skin head only — this is the in-game roster.
        avatarUrl: minotarUrl(mcName),
        color: colorFor(row.id),
        status: online ? "online" : "offline",
        joined: row.createdAt ?? "",
        verified: row.discordVerified ?? false,
        minecraftUsername: mcName,
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
