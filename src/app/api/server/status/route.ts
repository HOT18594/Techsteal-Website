import { NextRequest, NextResponse } from "next/server";

// GET /api/server/status
// Returns the live server status from the exaroton API (real-time, no caching).
// Falls back to mcsrvstat if exaroton is not configured.

const EXAROTON_API = "https://api.exaroton.com/v1";

export async function GET(req: NextRequest) {
  const token = process.env.EXAROTON_TOKEN;
  const serverId = process.env.EXAROTON_SERVER_ID;

  if (!token || !serverId) {
    return NextResponse.json({ error: "Server status is not configured." }, { status: 503 });
  }

  try {
    const res = await fetch(`${EXAROTON_API}/servers/${serverId}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ error: `exaroton error ${res.status}` }, { status: 502 });
    }
    const json = await res.json();
    const server = json?.data;
    if (!server) {
      return NextResponse.json({ error: "No server data." }, { status: 502 });
    }

    const online = server.status === 1;
    return NextResponse.json({
      online,
      players: {
        online: server.players?.count ?? 0,
        max: server.players?.max ?? 0,
        list: server.players?.list ?? [],
      },
      version: server.software?.version ?? null,
      hostname: server.address ?? null,
      source: "exaroton",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to fetch status." }, { status: 502 });
  }
}
