import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { findAccount, updateAccount, VERIFIED_PERMISSIONS } from "@/lib/accounts";
import { isRateLimited } from "@/lib/rate-limit";
import type { Permission } from "@/types";

export const dynamic = "force-dynamic";

// Verify the signed-in user is a member of the official Discord server.
// Uses a bot token + guild id from the environment; if either is missing
// it reports `configured: false` and the client can offer to skip.
//
// Side effect: when Discord gives a DEFINITIVE answer (200 = member,
// 404 = not a member) the result is persisted to the account so the
// `discordVerified` badge is only ever set by the server. Transient
// failures (429 rate limit, 401/403 revoked bot token, 5xx, network
// errors) never touch stored state — otherwise one hiccup could mass-wipe
// every verified member's perks.
//
// POST-only: this endpoint mutates the account, so it must not be
// triggerable by cross-site GETs (img/prefetch) riding the session cookie.
export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (isRateLimited(`verify:${user.id}`, 10, 60_000)) {
    return NextResponse.json(
      { error: "Too many verification attempts — wait a minute." },
      { status: 429 }
    );
  }

  const botToken = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!botToken || !guildId) {
    return NextResponse.json({ configured: false, verified: false });
  }

  const discordId = user.id.replace(/^discord:/, "");
  let verified = false;
  let definitive = false; // true only when Discord definitively answered
  try {
    const res = await fetch(
      `https://discord.com/api/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(discordId)}`,
      {
        headers: { Authorization: `Bot ${botToken}` },
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (res.status === 200) {
      verified = true;
      definitive = true;
    } else if (res.status === 404) {
      // Definitive "not a member".
      definitive = true;
    }
    // 401/403/429/5xx → leave stored state untouched (report below).
  } catch {
    definitive = false; // Discord outage / timeout — don't wipe anything
  }

  if (!definitive) {
    return NextResponse.json(
      { error: "Discord didn't answer — try again in a moment." },
      { status: 503 }
    );
  }

  // Verified membership is the live permission source: verified members
  // earn AI, Gallery posting, and Server Control; anyone no longer in the
  // server loses them. (Admins bypass via role.)
  const account = await findAccount(user.id).catch(() => null);
  if (account && !account.banned) {
    if (verified) {
      // Idempotent: badge true + every verified perk present.
      const next: Permission[] = [
        ...new Set([...account.permissions, ...VERIFIED_PERMISSIONS]),
      ];
      await updateAccount(user.id, { discordVerified: true, permissions: next });
    } else {
      // Discord answered "not a member" → wipe the badge and the perks
      // they earned from it.
      const next: Permission[] = account.permissions.filter(
        (p) => !VERIFIED_PERMISSIONS.includes(p)
      );
      await updateAccount(user.id, { discordVerified: false, permissions: next });
    }
  }

  return NextResponse.json({ configured: true, verified });
}
