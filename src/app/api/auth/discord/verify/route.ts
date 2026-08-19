import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Verify the signed-in user is a member of the official Discord server.
// Uses a bot token + guild id from the environment; if either is missing
// it reports `configured: false` and the client can offer to skip.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const botToken = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!botToken || !guildId) {
    return NextResponse.json({ configured: false, verified: false });
  }

  const discordId = user.id.replace(/^discord:/, "");
  try {
    const res = await fetch(
      `https://discord.com/api/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(discordId)}`,
      { headers: { Authorization: `Bot ${botToken}` } }
    );
    return NextResponse.json({ configured: true, verified: res.ok });
  } catch {
    return NextResponse.json({ configured: true, verified: false });
  }
}
