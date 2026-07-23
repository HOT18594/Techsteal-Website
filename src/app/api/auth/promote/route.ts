import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";
import { verifySession, signSession, getSessionCookieName, getSessionCookieOptions } from "@/lib/session";

// In-memory rate limiter for /api/auth/promote (per-IP, per-15min window)
// For production, use Redis/Upstash or Vercel KV for distributed rate limiting.
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_REQUESTS = 5; // max 5 attempts per window
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
  }
  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }
  entry.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - entry.count, resetAt: entry.resetAt };
}

const ADMIN_CODE = process.env.ADMIN_UNLOCK_CODE;

export async function POST(req: NextRequest) {
  if (!ADMIN_CODE) {
    return NextResponse.json({ error: "Admin unlock is not configured." }, { status: 503 });
  }

  // Rate limit by IP
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const rateLimit = checkRateLimit(ip);
  if (!rateLimit.allowed) {
    const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  const raw = req.cookies.get(getSessionCookieName())?.value;
  if (!raw) {
    return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  }

  // JWT verification ONLY - no legacy fallback (legacy was privilege escalation vector)
  const session = await verifySession(raw);
  if (!session) {
    return NextResponse.json({ error: "Invalid or expired session. Please re-login via Discord." }, { status: 401 });
  }

  let code: string | undefined;
  try {
    const body = await req.json();
    code = body?.code;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (code !== ADMIN_CODE) {
    return NextResponse.json({ error: "Invalid code." }, { status: 403 });
  }

  let error: { message?: string } | null = null;
  try {
    const result = await getServiceRoleClient()
      .from("user_roles")
      .update({ role: "admin" })
      .eq("discord_id", session.discordId);
    error = result.error;
  } catch {
    return NextResponse.json({ error: "Admin role updates are not configured." }, { status: 503 });
  }

  if (error) {
    return NextResponse.json({ error: "Failed to update role." }, { status: 500 });
  }

  const updated = { ...session, role: "admin" as const };
  const signed = await signSession(updated as any);
  const res = NextResponse.json({ ok: true, role: "admin" });
  res.cookies.set(getSessionCookieName(), signed, getSessionCookieOptions());
  // Add rate limit headers
  res.headers.set("X-RateLimit-Remaining", String(rateLimit.remaining));
  res.headers.set("X-RateLimit-Reset", String(Math.ceil(rateLimit.resetAt / 1000)));
  return res;
}
