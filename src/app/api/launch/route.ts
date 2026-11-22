import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getLaunchState, runScheduledLaunch } from "@/lib/launch";
import { isRateLimited, rateLimitIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function isAuthorizedCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) return false;
  const supplied = createHash("sha256").update(request.headers.get("authorization") ?? "").digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(supplied, expected);
}

export async function GET(request: NextRequest) {
  if (isAuthorizedCron(request)) {
    const run = await runScheduledLaunch();
    return NextResponse.json(run, { headers: { "Cache-Control": "no-store" } });
  }
  const state = await getLaunchState();
  return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (isRateLimited(`launch:${rateLimitIp(request)}`, 15, 60_000)) {
    const state = await getLaunchState();
    return NextResponse.json(
      { result: "attempt_pending", state },
      { status: 429, headers: { "Cache-Control": "no-store" } }
    );
  }
  const run = await runScheduledLaunch();
  return NextResponse.json(run, { headers: { "Cache-Control": "no-store" } });
}