import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { findAccount, canControlServer } from "@/lib/accounts";
import { getDb } from "@/lib/db";
import { exarotonAction, getExarotonConfig } from "@/lib/exaroton";

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
// POST starts/stops the server.

export async function GET() {
  const user = await getSessionUser();
  const allowed = await canControlNow(user?.id ?? null);
  return NextResponse.json({
    configured: getExarotonConfig() !== null,
    allowed,
  });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allowed = await canControlNow(user.id);
  if (!allowed) {
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
async function canControlNow(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  if (!getDb()) {
    // No database — trust the session (dev "no DB yet" mode).
    const user = await getSessionUser();
    return user?.role === "admin" || (user?.permissions.includes("server_control") ?? false);
  }
  const account = await findAccount(userId).catch(() => null);
  return canControlServer(account ?? undefined);
}