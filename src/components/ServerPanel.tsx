"use client";

// Admin → Server. Live state plus start/stop. Actions post to
// /api/server/control, which re-checks the account in the database on every
// call, so removing an admin revokes control immediately. Admins can use this
// before launch to prepare the world; players cannot.

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { siteConfig } from "@/lib/site";
import type { ServerStatus } from "@/types";

export function ServerPanel() {
  const { show } = useToast();
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "start" | "stop">(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, controlRes] = await Promise.all([
        fetch("/api/status"),
        fetch("/api/server/control"),
      ]);
      const statusData = (await statusRes.json().catch(() => null)) as ServerStatus | null;
      const controlData = (await controlRes.json().catch(() => ({}))) as {
        configured?: boolean;
        allowed?: boolean;
      };
      if (statusData) setStatus(statusData);
      setConfigured(controlData.configured ?? false);
      setAllowed(controlData.allowed ?? false);
    } catch {
      /* keep the last known state */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (action: "start" | "stop") => {
    setBusy(action);
    try {
      const res = await fetch("/api/server/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "The server didn't respond.");
      show(action === "start" ? "Starting" : "Stopping", "Give it a few seconds.");
      setTimeout(() => void load(), 4000);
    } catch (err) {
      show("Action failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setBusy(null);
    }
  };

  const online = status?.online === true;
  const stateLabel = status?.stateLabel ?? (online ? "Online" : "Offline");

  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`h-2 w-2 rounded-full ${online ? "bg-[var(--accent)]" : "bg-[var(--muted-2)]"}`}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <h2 className="font-display text-lg leading-tight">
            {loading && !status ? "Checking…" : stateLabel}
          </h2>
          <p className="text-xs text-[var(--muted)]">
            {siteConfig.address}
            {online && status?.players !== undefined
              ? ` · ${status.players} / ${status.max ?? siteConfig.maxPlayers} players`
              : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="ml-auto rounded-[10px] border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--fg)]"
        >
          <i className={`fa-solid fa-rotate ${loading ? "fa-spin" : ""}`} aria-hidden="true" /> Refresh
        </button>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void act("start")}
          disabled={!allowed || busy !== null || online}
          className="btn-primary btn-sm disabled:opacity-40"
        >
          <i className="fa-solid fa-play" aria-hidden="true" /> {busy === "start" ? "Starting…" : "Start"}
        </button>
        <button
          type="button"
          onClick={() => void act("stop")}
          disabled={!allowed || busy !== null || !online}
          className="btn-secondary btn-sm disabled:opacity-40"
        >
          <i className="fa-solid fa-stop" aria-hidden="true" /> {busy === "stop" ? "Stopping…" : "Stop"}
        </button>
      </div>

      {configured === false ? (
        <p className="mt-4 text-xs text-[#ffd166]">
          Hosting API not configured — set the Exaroton token and server id.
        </p>
      ) : !allowed ? (
        <p className="mt-4 text-xs text-[#ffd166]">
          Control is locked until {siteConfig.season} launches for non-admins.
        </p>
      ) : null}

      {status?.source && status.source !== "live" ? (
        <p className="mt-2 text-xs text-[var(--muted)]">Showing a cached fallback state.</p>
      ) : null}
    </section>
  );
}
