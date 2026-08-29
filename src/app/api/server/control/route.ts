import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { ACCOUNT_DB_ERROR_MESSAGE, canControlServer, findAccount } from "@/lib/accounts";
import { getDb } from "@/lib/db";
import { exarotonAction, getExarotonConfig } from "@/lib/exaroton";
import { isRateLimited } from "@/lib/rate-limit";
import type { Account } from "@/types";

export const dynamic = "force-dynamic";

// Server control (start/stop the Minecraft server via Exaroton).
//
// Who can control:
//   - admins always,
//   - members verified in the official Discord server,
//   - anyone with an explicit `server_control` permission (admin override).
// The account is re-read from the DB (not the session cookie) so a member
// who leaves the server loses control immediately.
//
// GET returns capability info for the UI (configured + allowed).
// POST starts/stops the server. Rate-limited: every call costs Exaroton
// hosting credits, so a stuck loop must not churn the queue.

export async function GET() {
  const user = await getSessionUser();
  // Signed out can't control anything — answer from the cookie alone and skip
  // the account lookup entirely.
  if (!user) {
    return NextResponse.json({ configured: getExarotonConfig() !== null, allowed: false });
  }
  // The status page polls this alongside /api/status (and re-probes on every
  // manual refresh), and each probe was an unthrottled `findAccount`. Cap it
  // generously: enough for normal polling, not enough to hammer the pooler.
  if (isRateLimited(`controlget:${user.id}`, 30, 60_000)) {
    return NextResponse.json(
      { configured: getExarotonConfig() !== null, allowed: false, error: "Too many requests — slow down." },
      { status: 429 }
    );
  }
  const outcome = await canControlNow(user.id);
  if (outcome === "db_error") {
    // A pooler outage must not read as "not allowed" — the UI would hide
    // the panel from verified members and tell them to re-verify.
    return NextResponse.json(
      { configured: getExarotonConfig() !== null, allowed: false, error: ACCOUNT_DB_ERROR_MESSAGE },
      { status: 503 }
    );
  }
  return NextResponse.json({
    configured: getExarotonConfig() !== null,
    allowed: outcome === "ok",
  });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (isRateLimited(`control:${user.id}`, 6, 60_000)) {
    return NextResponse.json(
      { error: "Too many control requests — wait a minute." },
      { status: 429 }
    );
  }

  const outcome = await canControlNow(user.id);
  if (outcome === "db_error") {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
  if (outcome !== "ok") {
    return NextResponse.json(
      { error: "Verify you're in the official Discord server to control the server." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const action: unknown = body?.action;
  if (action !== "start" && action !== "stop") {
    return NextResponse.json({ error: "action must be 'start' or 'stop'." }, { status: 400 });
  }

  try {
    await exarotonAction(action);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server control failed.";
    const status = /not configured/i.test(msg) ? 503 : 502;
    return NextResponse.json({ error: msg }, { status });
  }

  return NextResponse.json({ ok: true, action });
}

/** Resolve permission against the DB (live), or null when signed out. */
async function canControlNow(
  userId: string | null
): Promise<"ok" | "denied" | "db_error"> {
  if (!userId) return "denied";
  if (!getDb()) {
    // No database — trust the session (dev "no DB yet" mode).
    const user = await getSessionUser();
    return user?.role === "admin" || (user?.permissions.includes("server_control") ?? false)
      ? "ok"
      : "denied";
  }
  let account: Account | null;
  try {
    account = await findAccount(userId);
  } catch {
    return "db_error";
  }
  return canControlServer(account ?? undefined) ? "ok" : "denied";
}
