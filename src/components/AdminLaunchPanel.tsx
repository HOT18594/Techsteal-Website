"use client";

import { useCallback, useEffect, useState } from "react";
import { useLaunchState } from "@/components/LaunchProvider";
import { useToast } from "@/components/Toast";
import {
  DEFAULT_LAUNCH_AT,
  formatLaunchEastern,
  type AdminLaunchState,
} from "@/lib/launch-shared";
import { siteConfig } from "@/lib/site";

function toLocalInput(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function AdminLaunchPanel() {
  const { show } = useToast();
  const { launch, refreshLaunch, runLaunch } = useLaunchState();
  const [state, setState] = useState<AdminLaunchState | null>(null);
  const [launchInput, setLaunchInput] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [autoStart, setAutoStart] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const applyState = useCallback((next: AdminLaunchState) => {
    setState(next);
    setLaunchInput(toLocalInput(next.launchAt));
    setEnabled(next.enabled);
    setAutoStart(next.autoStart);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/launch", { cache: "no-store" });
      const json = (await res.json()) as AdminLaunchState & { error?: string };
      if (!res.ok) throw new Error(json.error || "Couldn't load the launch schedule.");
      applyState(json);
    } catch (err) {
      show("Launch schedule unavailable", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setLoading(false);
    }
  }, [applyState, show]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitSchedule = async (
    targetIso: string,
    nextEnabled: boolean,
    nextAutoStart: boolean,
    options?: { retryReset?: boolean; triggerStart?: boolean }
  ) => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/launch", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          launchAt: targetIso,
          enabled: nextEnabled,
          autoStart: nextAutoStart,
          retryReset: options?.retryReset === true,
        }),
      });
      const json = (await res.json()) as AdminLaunchState & { error?: string };
      if (!res.ok) throw new Error(json.error || "Couldn't save the launch schedule.");
      applyState(json);
      await refreshLaunch();
      if (options?.triggerStart && nextEnabled && nextAutoStart) {
        const result = await runLaunch();
        await load();
        if (result === "started" || result === "already_started") {
          show(`${siteConfig.season} launched`, "Website is live and the server is starting.");
          return;
        }
        if (result === "failed") {
          show("Website is live", "Auto-start hit an error — check the status note below.", "error");
          return;
        }
      }
      show(
        nextEnabled ? "Launch schedule saved" : "Scheduled launch paused",
        nextEnabled ? `${formatLaunchEastern(json.launchAt, "full")} Eastern.` : "Pre-launch mode stays active."
      );
    } catch (err) {
      show("Couldn't save launch", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (!launchInput) return;
    const launchAt = new Date(launchInput);
    if (!Number.isFinite(launchAt.getTime())) {
      show("Invalid launch time", "Choose a valid date and time.", "error");
      return;
    }
    const isPastOrNow = enabled && launchAt.getTime() <= Date.now();
    await submitSchedule(launchAt.toISOString(), enabled, autoStart, {
      triggerStart: isPastOrNow && autoStart,
    });
  };

  const launchNow = async () => {
    if (!window.confirm(`Launch ${siteConfig.season} across the website right now${autoStart ? " and start the server" : ""}?`)) {
      return;
    }
    await submitSchedule(new Date().toISOString(), true, autoStart, {
      retryReset: true,
      triggerStart: autoStart,
    });
  };

  const retryStart = async () => {
    if (!state) return;
    await submitSchedule(state.launchAt, true, true, {
      retryReset: true,
      triggerStart: true,
    });
  };

  const setDefaultEst = () => {
    setLaunchInput(toLocalInput(DEFAULT_LAUNCH_AT));
    setEnabled(true);
  };

  const isDue = Boolean(state?.enabled && (state.seasonLive || launch.seasonLive));

  return (
    <section className="admin-directory" aria-labelledby="launch-schedule-title">
      <div className="admin-directory-head">
        <div>
          <h2 id="launch-schedule-title">{siteConfig.season} automatic launch</h2>
          <p>Auto-update the website, unlock server controls, and boot the exaroton server at launch.</p>
        </div>
        <span className={`admin-pill ${state?.seasonLive ? "is-good" : enabled ? "is-accent" : "is-warn"}`}>
          {state?.seasonLive ? "Website live" : enabled ? "Scheduled" : "Paused"}
        </span>
      </div>

      <div className="p-5 grid gap-5 lg:grid-cols-[minmax(240px,1fr)_minmax(280px,1.5fr)] lg:items-end">
        <label className="grid gap-2 text-xs font-medium text-[var(--fg-2)]">
          Launch date and time (your local time)
          <input
            type="datetime-local"
            className="input"
            value={launchInput}
            onChange={(event) => setLaunchInput(event.target.value)}
            disabled={loading || saving}
          />
          {launchInput && Number.isFinite(new Date(launchInput).getTime()) ? (
            <span className="text-xs text-[var(--muted)]">
              {formatLaunchEastern(new Date(launchInput).toISOString(), "full")} Eastern
            </span>
          ) : state ? (
            <span className="text-xs text-[var(--muted)]">
              {formatLaunchEastern(state.launchAt, "full")} Eastern
            </span>
          ) : null}
        </label>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 lg:justify-end">
          <label className="flex items-center gap-2 text-xs text-[var(--fg-2)]">
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} disabled={loading || saving} />
            Auto-update website at launch
          </label>
          <label className="flex items-center gap-2 text-xs text-[var(--fg-2)]">
            <input type="checkbox" checked={autoStart} onChange={(event) => setAutoStart(event.target.checked)} disabled={loading || saving} />
            Auto-start server
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="admin-action-btn" disabled={loading || saving} onClick={setDefaultEst}>
              Nov 22 · 1 PM EST
            </button>
            {!state?.seasonLive ? (
              <button type="button" className="admin-action-btn" disabled={loading || saving} onClick={() => void launchNow()}>
                <i className="fa-solid fa-rocket" aria-hidden="true" /> Launch now
              </button>
            ) : null}
            {isDue && state?.autoStart && !state?.startedAt ? (
              <button type="button" className="admin-action-btn" disabled={loading || saving} onClick={() => void retryStart()}>
                <i className="fa-solid fa-play" aria-hidden="true" /> Retry start
              </button>
            ) : null}
            <button type="button" className="btn-primary btn-sm" disabled={loading || saving || !launchInput} onClick={() => void save()}>
              <i className={`fa-solid ${saving ? "fa-spinner fa-spin" : "fa-floppy-disk"}`} aria-hidden="true" />
              {saving ? "Saving…" : "Save schedule"}
            </button>
          </div>
        </div>
      </div>

      <div className="px-5 pb-5 -mt-1 text-xs leading-relaxed text-[var(--muted)]">
        At launch time, the countdown switches to live celebration with confetti, the website unlocks{" "}
        {siteConfig.season} everywhere, and the duplicate-safe server start triggers automatically via the
        scheduled check and incoming site visits.
        {state?.startedAt ? ` Server start confirmed ${formatLaunchEastern(state.startedAt, "full")} Eastern.` : ""}
        {state?.startError ? <span className="block mt-2 text-[#ffd166]">Last start attempt: {state.startError}</span> : null}
      </div>
    </section>
  );
}
