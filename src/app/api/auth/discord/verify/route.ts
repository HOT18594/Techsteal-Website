import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { findAccount, updateAccount, VERIFIED_PERMISSIONS } from "@/lib/accounts";
import type { Permission } from "@/types";

export const dynamic = "force-dynamic";

// Verify the signed-in user is a member of the official Discord server.
// Uses a bot token + guild id from the environment; if either is missing
// it reports `configured: false` and the client can offer to skip.
//
// Side effect: when it CAN verify, it persists the result to the account so
// the `discordVerified` badge is only ever set by the server (the profile
// PATCH endpoint refuses to accept it from clients).
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const botToken = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!botToken || !guildId) {
    return NextResponse.json({ configured: false, verified: false });
  }

  const discordId = user.id.replace(/^discord:/, "");
  let verified = false;
  let checked = false; // true only when Discord actually answered
  try {
    const res = await fetch(
      `https://discord.com/api/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(discordId)}`,
      { headers: { Authorization: `Bot ${botToken}` } }
    );
    checked = true;
    verified = res.ok;
  } catch {
    checked = false; // Discord outage — leave stored state untouched
  }

  // Verified membership is the live permission source: verified members
  // earn AI, Gallery posting, and Server Control; anyone no longer in the
  // server loses them. (Admins bypass via role.) Only mutate when Discord
  // actually answered, so a flaky outage never wipes an existing badge.
  const account = await findAccount(user.id).catch(() => null);
  if (account && checked) {
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
