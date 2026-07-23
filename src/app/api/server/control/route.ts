import { NextRequest, NextResponse } from "next/server";
import { DISCORD_GUILD_ID } from "@/lib/discord";
import { fetchUserRole } from "@/lib/supabase";
import { verifySession, getSessionCookieName } from "@/lib/session";

const EXAROTON_API = "https://api.exaroton.com/v1";

// Revalidate guild membership using the user's own Discord OAuth access token
// (stored in the signed session JWT at login time). This avoids the bot-based
// member lookup, which is blocked by the guild's moderation settings.
async function isLiveGuildMember(accessToken: string): Promise<boolean> {
  let after: string | undefined;
  let attempts = 0;
  while (attempts < 5) {
    attempts++;
    const url = new URL("https://discord.com/api/users/@me/guilds");
    url.searchParams.set("limit", "100");
    if (after) url.searchParams.set("after", after);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Discord guild check failed with ${res.status}`);
    const guilds = await res.json();
    if (!Array.isArray(guilds) || guilds.length === 0) return false;
    if (guilds.some((g: any) => String(g.id) === DISCORD_GUILD_ID)) return true;
    if (guilds.length < 100) return false;
    after = String(guilds[guilds.length - 1].id);
  }
  return false;
}

// POST /api/server/control - secured: requires a valid session and Discord guild membership.
export async function POST(req: NextRequest) {
  // Auth check
  const raw = req.cookies.get(getSessionCookieName())?.value;
  if (!raw) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const session = await verifySession(raw);
  if (!session) {
    return NextResponse.json({ error: "Invalid session." }, { status: 401 });
  }

  const token = process.env.EXAROTON_TOKEN;
  const serverId = process.env.EXAROTON_SERVER_ID;

  if (!token || !serverId) {
    return NextResponse.json(
      { error: "Server control is not configured (missing EXAROTON_TOKEN or EXAROTON_SERVER_ID)." },
      { status: 503 }
    );
  }

  // Parse body early — needed for action validation and request parsing
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

  // Revalidate guild membership using the user's OAuth token (fail closed if
  // the token is missing — means they logged in before this change and need
  // to re-login, or the token was revoked).
  if (!session.discordAccessToken) {
    return NextResponse.json(
      { error: "Your session is stale. Please re-login via Discord to use server controls." },
      { status: 401 }
    );
  }

  try {
    if (!(await isLiveGuildMember(session.discordAccessToken))) {
      return NextResponse.json(
        { error: "You must be a member of the Discord server to control the Minecraft server." },
        { status: 403 }
      );
    }
  } catch {
    return NextResponse.json({ error: "Unable to verify Discord server membership." }, { status: 503 });
  }

  let liveRole: "admin" | "member";
  try {
    liveRole = await fetchUserRole(session.discordId);
  } catch {
    return NextResponse.json({ error: "Unable to verify role." }, { status: 503 });
  }

  // Only admins can stop server (destructive). Members can start.
  if (action === "stop" && liveRole !== "admin") {
    return NextResponse.json(
      { error: "Only admins can stop the server." },
      { status: 403 }
    );
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
