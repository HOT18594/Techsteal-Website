import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { findAccount, updateAccount } from "@/lib/accounts";
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
  try {
    const res = await fetch(
      `https://discord.com/api/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(discordId)}`,
      { headers: { Authorization: `Bot ${botToken}` } }
    );
    verified = res.ok;
  } catch {
    verified = false;
  }

  // Persist the badge only when the server actually ran the membership
  // check (so a flaky Discord outage doesn't wipe an existing badge).
  const account = await findAccount(user.id).catch(() => null);
  if (account && account.discordVerified !== verified) {
    await updateAccount(user.id, { discordVerified: verified });
  }

  // Verified members may post to the gallery — grant the bit so it shows up
  // (and can be toggled) in the Manage Panel. Re-granting is idempotent and
  // harmless; the real gate reads `discordVerified` live, so leaving the
  // server still revokes access even with the bit present.
  if (account && verified && !account.permissions.includes("gallery_post")) {
    const next: Permission[] = [...account.permissions, "gallery_post"];
    await updateAccount(user.id, { permissions: next });
  }

  return NextResponse.json({ configured: true, verified });
}
