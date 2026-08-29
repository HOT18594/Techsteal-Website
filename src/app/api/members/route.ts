import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { profiles } from "@/lib/schema";
import { fallbackMembers } from "@/lib/fallback-data";
import { getLiveStatus } from "@/lib/live-status";
import { minotarUrl, colorFor } from "@/lib/forum-avatars";
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
  try {
    return await memberRoster(db);
  } catch (err) {
    console.error("api/members: query failed", err);
    return NextResponse.json(fallbackMembers);
  }
}

async function memberRoster(db: Exclude<ReturnType<typeof getDb>, null>): Promise<NextResponse> {
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
    // Removed (banned) accounts are a denylist, not directory entries —
    // every other account surface filters them out; this one must too.
    .where(eq(profiles.banned, false))
    .orderBy(profiles.username);

  // Fetch live status once and build a set of currently-online Minecraft
  // names so each account can be marked without per-row API calls. The
  // exaroton panel list is authoritative — ping-based lists (mcsrvstat)
  // are often empty even with players online.
  let onlineNames = new Set<string>();
  try {
    const status = await getLiveStatus();
    if (status.source === "live" && status.online) {
      onlineNames = new Set((status.playerList ?? []).map((n) => n.toLowerCase()));
    }
  } catch {
    // status unavailable — everyone shows offline, which is safe/honest.
  }

  const members: Member[] = rows
    .filter((row) => Boolean(row.minecraftUsername?.trim()))
    .map((row) => {
      const mcName = row.minecraftUsername!.trim();
      const online = onlineNames.has(mcName.toLowerCase());
      return {
        // The account id, not the array position: positional ids changed
        // whenever the roster reordered (it's sorted by username, and the
        // online filter runs first), so React reused the wrong rows and the
        // slideshow's `key` pointed at a different member after any rename.
        id: row.id,
        name: row.username,
        role: row.role === "admin" ? "Admin" : "Member",
        icon: row.role === "admin" ? "fa-shield-halved" : "fa-user",
        avatar: row.username.slice(0, 1).toUpperCase(),
        // Minecraft skin head only — this is the in-game roster.
        avatarUrl: minotarUrl(mcName),
        color: colorFor(row.id),
        status: online ? "online" : "offline",
        // `joined` is display text — format the stored ISO timestamp here so
        // the UI never renders a raw "2026-08-20T15:22:33.000Z".
        joined: formatJoined(row.createdAt),
        verified: row.discordVerified ?? false,
        minecraftUsername: mcName,
      };
    });

  return NextResponse.json(members);
}

/** "Aug 20, 2026" from an ISO timestamp; "" when absent/unparseable. */
function formatJoined(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
