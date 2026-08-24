import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { applyDiscordVerification, findAccount } from "@/lib/accounts";
import { isRateLimited } from "@/lib/rate-limit";

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
      // A 404 only means "not a member" when Discord names the MEMBER as
      // unknown (code 10007). The same status also covers an unknown GUILD
      // (code 10004 — bot kicked or the guild id changed), which must not
      // wipe stored state; treat that like any other hiccup.
      try {
        const payload = (await res.json()) as { code?: number } | null;
        definitive = payload?.code === 10007;
      } catch {
        definitive = false;
      }
    } else {
      // 401/403/429/5xx → leave stored state untouched (report below);
      // cancel the unread body so the connection returns to the pool.
      await res.body?.cancel().catch(() => {});
    }
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
  // server loses them. (Admins bypass via role.) The permission delta is
  // applied in SQL so a concurrent admin grant can't be erased by this
  // write (and vice versa) — the old read-merge-overwrite lost updates.
  const account = await findAccount(user.id).catch(() => null);
  if (account && !account.banned) {
    // Idempotent for verify; for a "left the server" answer it revokes
    // exactly the perks earned from verification.
    await applyDiscordVerification(user.id, verified);
  }

  return NextResponse.json({ configured: true, verified });
}
