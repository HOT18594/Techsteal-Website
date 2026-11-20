import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { applyDiscordVerification, findAccount } from "@/lib/accounts";
import { checkDiscordGuildMembership } from "@/lib/discord";
import { isGuestId } from "@/lib/guest";
import { isRateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Verify the signed-in user is a member of the official Discord server.
// Uses a bot token + guild id from the environment; if either is missing
// it reports `configured: false` and the client can offer to skip.
//
// Side effect: when Discord gives a DEFINITIVE answer (200 = member,
// 404 code 10007 = not a member) the result is persisted to the account so
// the `discordVerified` badge is only ever set by the server. Transient
// failures (429 rate limit, 401/403 revoked bot token, 5xx, network
// errors) never touch stored state — otherwise one hiccup could mass-wipe
// every verified member's perks.
//
// POST-only: this endpoint mutates the account, so it must not be
// triggerable by cross-site GETs (img/prefetch) riding the session cookie.
export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Guests have no Discord account to check — their perks are explicit grants.
  if (isGuestId(user.id)) {
    return NextResponse.json({ configured: true, verified: false });
  }

  if (isRateLimited(`verify:${user.id}`, 10, 60_000)) {
    return NextResponse.json(
      { error: "Too many verification attempts — wait a minute." },
      { status: 429 }
    );
  }

  const membership = await checkDiscordGuildMembership(user.id);
  if (membership.status === "unconfigured") {
    return NextResponse.json({ configured: false, verified: false });
  }
  if (membership.status === "transient_error") {
    return NextResponse.json(
      { error: "Discord didn't answer — try again in a moment." },
      { status: 503 }
    );
  }
  const { verified } = membership;

  // Verified membership is the live permission source: verified members
  // earn AI, Gallery posting, and Server Control; anyone no longer in the
  // server loses them. (Admins bypass via role.) The permission delta is
  // applied in SQL so a concurrent admin grant can't be erased by this
  // write (and vice versa) — the old read-merge-overwrite lost updates.
  const account = await findAccount(user.id).catch(() => null);
  if (!account) {
    // A definitive Discord answer that can't be persisted must not answer
    // 200 — the client would show "verified" while the DB badge stays
    // false until some later successful verify. The store is down; retry.
    return NextResponse.json(
      { error: "Couldn't save the verification result — try again in a moment." },
      { status: 503 }
    );
  }
  if (account.banned) {
    // A banned account must not be told it's "verified" — nothing was
    // persisted and the answer would be a lie.
    return NextResponse.json(
      { error: "Your account no longer exists on this server." },
      { status: 403 }
    );
  }
  try {
    // Idempotent for verify; for a "left the server" answer it revokes
    // exactly the perks earned from verification.
    const updated = await applyDiscordVerification(user.id, verified);
    if (!updated) {
      return NextResponse.json(
        { error: "Couldn't save the verification result — try again in a moment." },
        { status: 503 }
      );
    }
  } catch (err) {
    console.error("discord verify: persistence failed", err);
    return NextResponse.json(
      { error: "Couldn't save the verification result — try again in a moment." },
      { status: 503 }
    );
  }

  return NextResponse.json({ configured: true, verified });
}
