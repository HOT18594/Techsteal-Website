import { NextResponse } from "next/server";
import { isRateLimited, rateLimitIp } from "@/lib/rate-limit";
import { isValidMcName } from "@/lib/mc-name";

export const dynamic = "force-dynamic";

// Resolve a Minecraft username to its skin avatar via Mojang's public API
// (no key needed). Returns minotar render URLs — the SAME provider the
// forum/member avatars use (see forum-avatars.ts), so a username renders
// the same head everywhere on the site instead of bouncing between
// minotar and crafatar.
// GET /api/minecraft/skin?username=Notch
export async function GET(request: Request) {
  const username = new URL(request.url).searchParams.get("username")?.trim();
  if (!username) {
    return NextResponse.json({ error: "username is required" }, { status: 400 });
  }
  // Shared validator (lib/mc-name) — same rule the profile endpoint enforces.
  // Rejecting here (a) avoids relaying garbage to Mojang and (b) stops this
  // route being an open, unauthenticated proxy that hammers Mojang's
  // rate-limited API.
  if (!isValidMcName(username)) {
    return NextResponse.json(
      { error: "Minecraft usernames can only use letters, numbers and underscores (1–16 chars)." },
      { status: 400 }
    );
  }
  // Key by client IP (edge-appended entry — client-supplied XFF prefixes
  // are spoofable), else global — soft limit to be polite to Mojang.
  if (isRateLimited(`skin:${rateLimitIp(request)}`, 20, 60_000)) {
    return NextResponse.json(
      { error: "Too many skin lookups — wait a minute." },
      { status: 429 }
    );
  }

  try {
    const res = await fetch(
      `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`,
      { cache: "no-store", signal: AbortSignal.timeout(8_000) }
    );
    if (res.status === 204 || res.status === 404) {
      await res.body?.cancel().catch(() => {});
      return NextResponse.json({ error: "That Minecraft username doesn't exist." }, { status: 404 });
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return NextResponse.json({ error: "Mojang API error" }, { status: 502 });
    }
    const data = (await res.json()) as { id: string; name: string };
    const name = encodeURIComponent(data.name);
    return NextResponse.json({
      username: data.name,
      uuid: data.id,
      skin: `https://minotar.net/helm/${name}/64.png`,
      avatar: `https://minotar.net/avatar/${name}/128.png`,
    });
  } catch {
    return NextResponse.json({ error: "Couldn't reach Mojang" }, { status: 502 });
  }
}
