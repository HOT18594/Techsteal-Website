import { NextRequest, NextResponse } from "next/server";
import { verifySession, getSessionCookieName } from "@/lib/session";

const EXAROTON_API = "https://api.exaroton.com/v1";

// POST /api/server/control - secured: requires valid session + inGuild + admin/member check
export async function POST(req: NextRequest) {
  // Auth check
  const raw = req.cookies.get(getSessionCookieName())?.value;
  if (!raw) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const session = await verifySession(raw);
  if (!session) {
    // Try legacy JSON fallback once
    try {
      const legacy = JSON.parse(raw);
      if (!legacy?.discordId) throw new Error("invalid");
    } catch {
      return NextResponse.json({ error: "Invalid session." }, { status: 401 });
    }
  }

  const token = process.env.EXAROTON_TOKEN;
  const serverId = process.env.EXAROTON_SERVER_ID;

  if (!token || !serverId) {
    return NextResponse.json(
      { error: "Server control is not configured (missing EXAROTON_TOKEN or EXAROTON_SERVER_ID)." },
      { status: 503 }
    );
  }

  // Parse body early — needed for both SERVER_CONTROL_CODE bypass and action
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const action: string | undefined = body?.action;
  if (action !== "start" && action !== "stop") {
    return NextResponse.json({ error: "action must be 'start' or 'stop'." }, { status: 400 });
  }

  // Check for SERVER_CONTROL_CODE bypass (allows control without Discord guild membership)
  const serverControlBypass =
    Boolean(body?.code) &&
    Boolean(process.env.SERVER_CONTROL_CODE) &&
    body.code === process.env.SERVER_CONTROL_CODE;

  // Must be in Discord guild to control server (as per DESIGN.md) — unless bypassed with SERVER_CONTROL_CODE
  const finalSession = session as any;
  // If we had legacy session, we check inGuild from parsed legacy
  let inGuild = finalSession?.inGuild;
  if (inGuild === undefined) {
    try {
      const legacy = JSON.parse(raw);
      inGuild = legacy?.inGuild;
    } catch {}
  }
  if (!inGuild && !serverControlBypass) {
    return NextResponse.json({ error: "You must be a member of the Discord server to control the Minecraft server." }, { status: 403 });
  }

  // Only admins can stop server (destructive). Members can start.
  if (action === "stop" && finalSession?.role !== "admin") {
    return NextResponse.json({ error: "Only admins can stop the server." }, { status: 403 });
  }

  const endpoint = action === "start" ? "start" : "stop";

  try {
    const res = await fetch(`${EXAROTON_API}/servers/${serverId}/${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      // Don't leak raw exaroton response containing token info
      return NextResponse.json(
        { error: `exaroton error ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json().catch(() => ({}));
    return NextResponse.json({ ok: true, action, data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Request to exaroton failed." }, { status: 502 });
  }
}
