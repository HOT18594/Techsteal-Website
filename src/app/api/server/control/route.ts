import { NextRequest, NextResponse } from "next/server";

// POST /api/server/control
// Body: { action: "start" | "stop" }
// Proxies to the exaroton API to start/stop the Minecraft server.
// Requires EXAROTON_TOKEN and EXAROTON_SERVER_ID in the environment.

const EXAROTON_API = "https://api.exaroton.com/v1";

export async function POST(req: NextRequest) {
  const token = process.env.EXAROTON_TOKEN;
  const serverId = process.env.EXAROTON_SERVER_ID;

  if (!token || !serverId) {
    return NextResponse.json(
      { error: "Server control is not configured (missing EXAROTON_TOKEN or EXAROTON_SERVER_ID)." },
      { status: 503 }
    );
  }

  let action: string | undefined;
  try {
    const body = await req.json();
    action = body?.action;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (action !== "start" && action !== "stop") {
    return NextResponse.json({ error: "action must be 'start' or 'stop'." }, { status: 400 });
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
      return NextResponse.json(
        { error: `exaroton error ${res.status}: ${text}` },
        { status: 502 }
      );
    }

    const data = await res.json().catch(() => ({}));
    return NextResponse.json({ ok: true, action, data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Request to exaroton failed." }, { status: 502 });
  }
}
