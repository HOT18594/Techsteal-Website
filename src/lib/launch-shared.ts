export const DEFAULT_LAUNCH_AT = "2026-11-22T18:00:00.000Z";

export interface LaunchState {
  launchAt: string;
  enabled: boolean;
  autoStart: boolean;
  seasonLive: boolean;
  startedAt: string | null;
  configured: boolean;
}

export interface AdminLaunchState extends LaunchState {
  lastAttemptAt: string | null;
  startError: string | null;
  updatedAt: string | null;
}

export const INITIAL_LAUNCH_STATE: LaunchState = {
  launchAt: DEFAULT_LAUNCH_AT,
  enabled: true,
  autoStart: true,
  seasonLive: false,
  startedAt: null,
  configured: false,
};

export type LaunchRunResult =
  | "not_due"
  | "auto_start_disabled"
  | "already_started"
  | "attempt_pending"
  | "started"
  | "failed"
  | "unavailable";

export function formatLaunchEastern(iso: string, style: "short" | "full" = "short"): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(
    "en-US",
    style === "full"
      ? { dateStyle: "full", timeStyle: "short", timeZone: "America/New_York" }
      : {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZone: "America/New_York",
          timeZoneName: "short",
        }
  ).format(date);
}
