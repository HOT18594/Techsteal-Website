import { NextRequest, NextResponse } from "next/server";
import { isRateLimited, rateLimitIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const BUCKET = "modpacks";
const OBJECT_PATH = "season-6/TECHSTEAL-Season-6.zip";
const FILENAME = "TECHSTEAL-Season-6.zip";

export async function GET(request: NextRequest) {
  if (isRateLimited(`modpack:${rateLimitIp(request)}`, 12, 60_000)) {
    return NextResponse.json(
      { error: "Too many download requests — wait a minute and try again." },
      { status: 429, headers: { "Cache-Control": "no-store" } }
    );
  }

  const baseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !serviceKey) {
    return NextResponse.json(
      { error: "The pack download isn't available right now." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const upstream = await fetch(`${baseUrl}/storage/v1/object/${BUCKET}/${OBJECT_PATH}`, {
      headers: { Authorization: `Bearer ${serviceKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (!upstream.ok) {
      await upstream.body?.cancel().catch(() => {});
      console.error(`modpack: storage returned ${upstream.status}`);
      return NextResponse.json(
        { error: "Couldn't fetch the pack — try again in a moment." },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }

    const headers = new Headers({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${FILENAME}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    const length = upstream.headers.get("content-length");
    if (length) headers.set("Content-Length", length);
    return new NextResponse(upstream.body, { status: 200, headers });
  } catch (err) {
    console.error("modpack: storage request failed", err);
    return NextResponse.json(
      { error: "Couldn't fetch the pack — try again in a moment." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
