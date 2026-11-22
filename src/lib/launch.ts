import { and, asc, eq, isNull, lt, or } from "drizzle-orm";
import { logAudit } from "@/lib/audit";
import { getDb, type Db } from "@/lib/db";
import { exarotonAction, getExarotonConfig, getExarotonSnapshot } from "@/lib/exaroton";
import { invalidateLiveStatus } from "@/lib/live-status";
import { invalidateServerTelemetry } from "@/lib/server-telemetry";
import { launchSettings, timelineEvents } from "@/lib/schema";
import { siteConfig } from "@/lib/site";
import {
  DEFAULT_LAUNCH_AT,
  type AdminLaunchState,
  type LaunchRunResult,
  type LaunchState,
} from "@/lib/launch-shared";

type LaunchRow = typeof launchSettings.$inferSelect;

const ACTIVE_STATES = new Set(["online", "starting", "loading", "restarting", "pending"]);

function defaultRow(): LaunchRow {
  return {
    id: 1,
    launchAt: new Date(DEFAULT_LAUNCH_AT),
    enabled: true,
    autoStart: true,
    startedAt: null,
    lastAttemptAt: null,
    startError: null,
    updatedAt: new Date(),
  };
}

function publicState(row: LaunchRow, configured: boolean, now = new Date()): LaunchState {
  const launchAt = row.launchAt.toISOString();
  return {
    launchAt,
    enabled: row.enabled,
    autoStart: row.autoStart,
    seasonLive:
      siteConfig.seasonLive ||
      (row.enabled && Number.isFinite(row.launchAt.getTime()) && row.launchAt.getTime() <= now.getTime()),
    startedAt: row.startedAt?.toISOString() ?? null,
    configured,
  };
}

async function readRow(): Promise<{ row: LaunchRow; configured: boolean }> {
  const db = getDb();
  if (!db) return { row: defaultRow(), configured: false };
  try {
    const rows = await db.select().from(launchSettings).where(eq(launchSettings.id, 1)).limit(1);
    return { row: rows[0] ?? defaultRow(), configured: true };
  } catch (err) {
    console.error("launch: settings lookup failed", err);
    return { row: defaultRow(), configured: false };
  }
}

export async function getLaunchState(): Promise<LaunchState> {
  const { row, configured } = await readRow();
  return publicState(row, configured);
}

export async function getAdminLaunchState(): Promise<AdminLaunchState> {
  const { row, configured } = await readRow();
  return {
    ...publicState(row, configured),
    lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
    startError: row.startError,
    updatedAt: row.updatedAt?.toISOString() ?? null,
  };
}

function formatLaunchDateLabel(launchAt: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(launchAt);
}

/**
 * Best-effort, idempotent sync of the History timeline when a scheduled launch
 * becomes due so `/history` automatically switches from "Coming soon" to the
 * opening date without waiting for a manual admin click.
 */
async function syncTimelineOnLaunch(db: Db, launchAt: Date): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      const rows = await tx.select().from(timelineEvents).orderBy(asc(timelineEvents.id)).for("update");
      const currentPrefix = siteConfig.season.toLowerCase();
      const matchingCurrent = rows.filter((r) => r.title.toLowerCase().startsWith(currentPrefix));
      const currentRow = matchingCurrent.length > 0 ? matchingCurrent[matchingCurrent.length - 1] : null;
      if (!currentRow || currentRow.date.trim().toLowerCase() !== "coming soon") return;

      const prevPrefix = siteConfig.previousSeason.toLowerCase();
      for (const row of rows) {
        if (row.title.toLowerCase().startsWith(prevPrefix) && row.era === "Current Season") {
          const lower = row.date.trim().toLowerCase();
          await tx
            .update(timelineEvents)
            .set({
              era: "Past Seasons",
              date: lower === "live" || lower === "current" ? "Concluded" : row.date,
            })
            .where(eq(timelineEvents.id, row.id));
        }
      }

      const prepPrefix = `${siteConfig.season} is coming soon —`;
      const livePrefix = `${siteConfig.season} is live —`;
      const nextDescription = currentRow.description?.startsWith(prepPrefix)
        ? currentRow.description.replace(prepPrefix, livePrefix)
        : currentRow.description;

      await tx
        .update(timelineEvents)
        .set({
          date: formatLaunchDateLabel(launchAt),
          era: "Current Season",
          major: true,
          description: nextDescription,
        })
        .where(eq(timelineEvents.id, currentRow.id));
    });
  } catch (err) {
    console.error("launch: timeline sync failed", err);
  }
}

async function isServerAlreadyActive(): Promise<boolean> {
  const snap = await getExarotonSnapshot().catch(() => null);
  return Boolean(snap && (snap.online || ACTIVE_STATES.has(snap.state)));
}

export async function runScheduledLaunch(): Promise<{
  result: LaunchRunResult;
  state: LaunchState;
}> {
  const db = getDb();
  if (!db) return { result: "unavailable", state: await getLaunchState() };

  try {
    await db.insert(launchSettings).values({ id: 1 }).onConflictDoNothing();
    const rows = await db.select().from(launchSettings).where(eq(launchSettings.id, 1)).limit(1);
    const settings = rows[0];
    if (!settings) return { result: "unavailable", state: await getLaunchState() };

    const now = new Date();
    if (!settings.enabled || settings.launchAt.getTime() > now.getTime()) {
      return { result: "not_due", state: publicState(settings, true, now) };
    }

    await syncTimelineOnLaunch(db, settings.launchAt);

    if (settings.startedAt) {
      return { result: "already_started", state: publicState(settings, true, now) };
    }
    if (!settings.autoStart) {
      return { result: "auto_start_disabled", state: publicState(settings, true, now) };
    }

    const claimRows = await db
      .update(launchSettings)
      .set({ lastAttemptAt: now, startError: null, updatedAt: now })
      .where(
        and(
          eq(launchSettings.id, 1),
          isNull(launchSettings.startedAt),
          or(
            isNull(launchSettings.lastAttemptAt),
            lt(launchSettings.lastAttemptAt, new Date(now.getTime() - 60_000))
          )
        )
      )
      .returning({ id: launchSettings.id });
    if (claimRows.length === 0) {
      return { result: "attempt_pending", state: publicState(settings, true, now) };
    }

    if (!getExarotonConfig()) {
      await db
        .update(launchSettings)
        .set({ startError: "Exaroton hosting credentials are not configured.", updatedAt: new Date() })
        .where(eq(launchSettings.id, 1));
      return { result: "failed", state: await getLaunchState() };
    }

    try {
      const alreadyActive = await isServerAlreadyActive();
      if (!alreadyActive) {
        await exarotonAction("start");
      }
      await db
        .update(launchSettings)
        .set({ startedAt: new Date(), startError: null, updatedAt: new Date() })
        .where(eq(launchSettings.id, 1));
      invalidateLiveStatus();
      invalidateServerTelemetry();
      await logAudit({
        actorId: "system:launch-scheduler",
        actorName: "Launch scheduler",
        action: "server_start",
        targetName: siteConfig.address,
        detail: alreadyActive
          ? `Verified server was already active for ${siteConfig.season} launch (${settings.launchAt.toISOString()})`
          : `Automatically started the server for ${siteConfig.season} at ${settings.launchAt.toISOString()}`,
      });
      return { result: "started", state: await getLaunchState() };
    } catch (err) {
      if (await isServerAlreadyActive()) {
        await db
          .update(launchSettings)
          .set({ startedAt: new Date(), startError: null, updatedAt: new Date() })
          .where(eq(launchSettings.id, 1));
        invalidateLiveStatus();
        invalidateServerTelemetry();
        return { result: "started", state: await getLaunchState() };
      }
      const detail = err instanceof Error ? err.message.slice(0, 300) : "Server start failed";
      await db
        .update(launchSettings)
        .set({ startError: detail, updatedAt: new Date() })
        .where(eq(launchSettings.id, 1));
      console.error("launch: automatic server start failed", err);
      return { result: "failed", state: await getLaunchState() };
    }
  } catch (err) {
    console.error("launch: scheduled run failed", err);
    return { result: "unavailable", state: await getLaunchState() };
  }
}