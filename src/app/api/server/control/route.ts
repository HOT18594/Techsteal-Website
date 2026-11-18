import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { ACCOUNT_DB_ERROR_MESSAGE, accountGate, canControlServer } from "@/lib/accounts";
import { logAudit } from "@/lib/audit";
import { exarotonAction, getExarotonConfig } from "@/lib/exaroton";
import { invalidateLiveStatus } from "@/lib/live-status";
import { isRateLimited } from "@/lib/rate-limit";
import { invalidateServerTelemetry } from "@/lib/server-telemetry";
import { siteConfig } from "@/lib/site";
import type { Account, SessionUser } from "@/types";

export const dynamic = "force-dynamic";

// Server control (start/stop/restart the Minecraft server via Exaroton).
//
// Who can control:
//   - admins always (including pre-launch while preparing the season),
//   - members verified in the official Discord server (once seasonLive is true),
//   - anyone with an explicit `server_control` permission (admin override).
// The account is re-read from the DB once per request so role/verification
// changes take effect immediately without redundant lookups.
//
// GET returns capability info for the UI (configured + allowed).
// POST starts/stops/restarts the server. Rate-limited: every call costs
// Exaroton hosting credits, so a stuck loop must not churn the queue.

function sessionFallbackAccount(user: SessionUser): Account {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    permissions: user.permissions,
    avatarUrl: user.avatarUrl,
    onboarded: user.onboarded,
    discordVerified: user.discordVerified,
    minecraftUsername: user.minecraftUsername ?? undefined,
  };
}

export async function GET() {
  const configured = getExarotonConfig() !== null;
  const user = await getSessionUser();
  // Signed out can't control anything — answer from the cookie alone and skip
  // the account lookup entirely.
  if (!user) {
    return NextResponse.json({ configured, allowed: false });
  }

  // The status page polls this alongside /api/status (and re-probes on every
  // manual refresh). Cap it generously: enough for normal polling, not enough
  // to hammer the pooler.
  if (isRateLimited(`controlget:${user.id}`, 30, 60_000)) {
    return NextResponse.json(
      { configured, allowed: false, error: "Too many requests — slow down." },
      { status: 429 }
    );
  }

  // Single live DB lookup handles both pre-launch admin check and permission
  // resolution, surfacing 503 on transient DB outages even before launch.
  const gate = await accountGate(user.id);
  if (gate.status === "db_error") {
    return NextResponse.json(
      { configured, allowed: false, error: ACCOUNT_DB_ERROR_MESSAGE },
      { status: 503 }
    );
  }
  if (gate.status === "missing" || gate.status === "banned") {
    return NextResponse.json({ configured, allowed: false });
  }

  const account = gate.status === "ok" ? gate.account : sessionFallbackAccount(user);
  if (!siteConfig.seasonLive && account.role !== "admin") {
    return NextResponse.json({ configured, allowed: false });
  }

  return NextResponse.json({
    configured,
    allowed: canControlServer(account),
  });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Single live DB lookup: surfaces 503 on DB blips (never a false pre-launch
  // 403 for admins) and checks ban/role/permissions in one round-trip.
  const gate = await accountGate(user.id);
  if (gate.status === "db_error") {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
  if (gate.status === "missing" || gate.status === "banned") {
    return NextResponse.json(
      { error: "Your account no longer exists on this server." },
      { status: 403 }
    );
  }

  const account = gate.status === "ok" ? gate.account : sessionFallbackAccount(user);

  // Fail closed before launch — except for admins, who need the controls to
  // prepare the season. Everyone else is refused even on a hand-crafted
  // request, not just by the hidden UI.
  if (!siteConfig.seasonLive && account.role !== "admin") {
    return NextResponse.json(
      { error: `Server control opens when ${siteConfig.season} launches.` },
      { status: 403 }
    );
  }

  if (!canControlServer(account)) {
    return NextResponse.json(
      { error: "Verify you're in the official Discord server to control the server." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const action: unknown = body?.action;
  if (action !== "start" && action !== "stop" && action !== "restart") {
    return NextResponse.json(
      { error: "action must be 'start', 'stop', or 'restart'." },
      { status: 400 }
    );
  }

  if (isRateLimited(`control:${user.id}`, 6, 60_000)) {
    return NextResponse.json(
      { error: "Too many control requests — wait a minute." },
      { status: 429 }
    );
  }

  try {
    await exarotonAction(action);
  } catch (err) {
    // Technical detail (env var names, fetch errors) stays in the server log —
    // the client gets a short, warm message.
    console.error("server control: action failed", err);
    const notConfigured = err instanceof Error && /not configured/i.test(err.message);
    return NextResponse.json(
      {
        error: notConfigured
          ? "Server control isn't set up yet."
          : "The server didn't respond — try again in a moment.",
      },
      { status: notConfigured ? 503 : 502 }
    );
  }

  invalidateLiveStatus();
  invalidateServerTelemetry();

  const auditMeta = {
    start: { action: "server_start", detail: "Started the Minecraft server" },
    stop: { action: "server_stop", detail: "Stopped the Minecraft server" },
    restart: { action: "server_restart", detail: "Restarted the Minecraft server" },
  } as const;

  await logAudit({
    actorId: account.id,
    actorName: account.username,
    action: auditMeta[action].action,
    targetName: siteConfig.address,
    detail: auditMeta[action].detail,
  });

  return NextResponse.json({ ok: true, action });
}
