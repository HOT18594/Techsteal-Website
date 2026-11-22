import { NextRequest, NextResponse } from "next/server";
import { ACCOUNT_DB_ERROR_MESSAGE, requireAdminAccount } from "@/lib/accounts";
import { logAudit } from "@/lib/audit";
import {
  exarotonGetConfigOptions,
  exarotonSetConfigOptions,
  getExarotonConfig,
  sanitizeExarotonPath,
} from "@/lib/exaroton";
import { invalidateLiveStatus } from "@/lib/live-status";
import { isRateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const gate = await requireAdminAccount();
  if (gate.status === "db_error") {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
  if (gate.status === "no") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }
  if (!getExarotonConfig()) {
    return NextResponse.json({ error: "Exaroton is not configured." }, { status: 503 });
  }

  const rawPath = request.nextUrl.searchParams.get("path") ?? "server.properties";
  const path = sanitizeExarotonPath(rawPath);
  if (!path) {
    return NextResponse.json({ error: "Invalid config file path." }, { status: 400 });
  }

  try {
    const options = await exarotonGetConfigOptions(path);
    return NextResponse.json(
      { path, options },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("api/admin/server/config GET: failed", err);
    return NextResponse.json(
      { error: "Couldn't load that configuration file from Exaroton." },
      { status: 502 }
    );
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireAdminAccount();
  if (gate.status === "db_error") {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }
  if (gate.status === "no") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }
  const admin = gate.account;

  if (isRateLimited(`adminserver-config:${admin.id}`, 12, 60_000)) {
    return NextResponse.json({ error: "Slow down a little." }, { status: 429 });
  }
  if (!getExarotonConfig()) {
    return NextResponse.json({ error: "Exaroton is not configured." }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;
  const path = sanitizeExarotonPath(typeof raw.path === "string" ? raw.path : "server.properties");
  if (!path) {
    return NextResponse.json({ error: "Invalid config file path." }, { status: 400 });
  }
  if (!raw.values || typeof raw.values !== "object" || Array.isArray(raw.values)) {
    return NextResponse.json({ error: "Provide configuration values to update." }, { status: 400 });
  }

  const cleanValues: Record<string, string | number | boolean | string[]> = {};
  for (const [k, v] of Object.entries(raw.values as Record<string, unknown>)) {
    if (!k || k.length > 100) continue;
    if (typeof v === "string") {
      cleanValues[k] = v.slice(0, 400);
    } else if (typeof v === "number" && Number.isFinite(v)) {
      cleanValues[k] = v;
    } else if (typeof v === "boolean") {
      cleanValues[k] = v;
    } else if (Array.isArray(v)) {
      cleanValues[k] = v.filter((item): item is string => typeof item === "string").slice(0, 50);
    }
  }
  const changedKeys = Object.keys(cleanValues);
  if (changedKeys.length === 0) {
    return NextResponse.json({ error: "No valid configuration values supplied." }, { status: 400 });
  }

  try {
    const options = await exarotonSetConfigOptions(path, cleanValues);
    invalidateLiveStatus();
    await logAudit({
      actorId: admin.id,
      actorName: admin.username,
      action: "server_config",
      targetName: path,
      detail: `Updated ${changedKeys.slice(0, 8).join(", ")}${changedKeys.length > 8 ? ` (+${changedKeys.length - 8})` : ""}`,
    });
    return NextResponse.json({ ok: true, path, options });
  } catch (err) {
    console.error("api/admin/server/config POST: failed", err);
    return NextResponse.json(
      { error: "Couldn't save configuration changes — stop the server first if it's running." },
      { status: 502 }
    );
  }
}
