import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { ACCOUNT_DB_ERROR_MESSAGE, requireAdminAccount } from "@/lib/accounts";
import { logAudit } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { getAdminLaunchState } from "@/lib/launch";
import { launchSettings } from "@/lib/schema";
import { siteConfig } from "@/lib/site";

export const dynamic = "force-dynamic";

async function adminGate() {
  const gate = await requireAdminAccount();
  if (gate.status === "db_error") {
    return { error: NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 }) };
  }
  if (gate.status === "no") {
    return { error: NextResponse.json({ error: "Admins only." }, { status: 403 }) };
  }
  return { admin: gate.account };
}

export async function GET() {
  const gate = await adminGate();
  if ("error" in gate) return gate.error;
  return NextResponse.json(await getAdminLaunchState(), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function PATCH(request: NextRequest) {
  const gate = await adminGate();
  if ("error" in gate) return gate.error;
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: ACCOUNT_DB_ERROR_MESSAGE }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const launchAt = typeof body?.launchAt === "string" ? new Date(body.launchAt) : null;
  if (!launchAt || !Number.isFinite(launchAt.getTime())) {
    return NextResponse.json({ error: "Choose a valid launch date and time." }, { status: 400 });
  }
  if (launchAt.getFullYear() < 2020 || launchAt.getFullYear() > 2100) {
    return NextResponse.json({ error: "Choose a launch date between 2020 and 2100." }, { status: 400 });
  }
  if (typeof body?.enabled !== "boolean" || typeof body?.autoStart !== "boolean") {
    return NextResponse.json({ error: "Invalid launch settings." }, { status: 400 });
  }
  const enabled = body.enabled;
  const autoStart = body.autoStart;
  const retryReset = body.retryReset === true;

  try {
    const currentRows = await db.select().from(launchSettings).where(eq(launchSettings.id, 1)).limit(1);
    const current = currentRows[0];
    const reset =
      !current || current.launchAt.getTime() !== launchAt.getTime() || current.enabled !== enabled;
    const values = {
      id: 1,
      launchAt,
      enabled,
      autoStart,
      startedAt: reset ? null : current.startedAt,
      lastAttemptAt: reset || retryReset ? null : current.lastAttemptAt,
      startError: reset || retryReset ? null : current.startError,
      updatedAt: new Date(),
    };
    await db.insert(launchSettings).values(values).onConflictDoUpdate({
      target: launchSettings.id,
      set: values,
    });
    await logAudit({
      actorId: gate.admin.id,
      actorName: gate.admin.username,
      action: "launch_schedule",
      targetName: siteConfig.season,
      detail: `${enabled ? "Scheduled" : "Disabled"} launch for ${launchAt.toISOString()}; automatic server start ${autoStart ? "enabled" : "disabled"}`,
    });
    return NextResponse.json(await getAdminLaunchState());
  } catch (err) {
    console.error("admin launch: save failed", err);
    return NextResponse.json({ error: "Couldn't save the launch schedule — try again." }, { status: 503 });
  }
}
