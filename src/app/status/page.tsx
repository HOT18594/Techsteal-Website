"use client";

import { useEffect, useState } from "react";
import { siteConfig } from "@/lib/site";
import { fallbackStatus } from "@/lib/fallback-data";
import type { ServerStatus } from "@/types";
import { useToast } from "@/components/Toast";
import { CopyIpButton } from "@/components/CopyIpButton";
import { SubPage } from "@/components/SubPage";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/use-session";
import Link from "next/link";

function useClock() {
  const [time, setTime] = useState("--:--");
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const hh = now.getHours().toString().padStart(2, "0");
      const mm = now.getMinutes().toString().padStart(2, "0");
      setTime(`${hh}:${mm}`);
    };
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, []);
  return time;
}

export default function StatusPage() {
  const time = useClock();
  const { show } = useToast();
  const { user, loading: sessionLoading } = useSession();
  const { data: STATUS, refetch, loading: statusLoading } = useApi<ServerStatus>(
    "/api/status",
    fallbackStatus
  );

  // Server control capability (start/stop via Exaroton).
  const [control, setControl] = useState<{
    configured: boolean;
    allowed: boolean;
  } | null>(null);
  const [controlBusy, setControlBusy] = useState<"start" | "stop" | null>(null);

  useEffect(() => {
    if (sessionLoading) return; // wait for the session before deciding
    if (!user) {
      setControl(null);
      return;
    }
    let cancelled = false;
    fetch("/api/server/control")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { configured?: boolean; allowed?: boolean } | null) => {
        if (!cancelled && d) setControl({ configured: !!d.configured, allowed: !!d.allowed });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, sessionLoading]);

  const runControl = async (action: "start" | "stop") => {
    if (controlBusy) return;
    if (action === "stop" && !window.confirm("Stop the server? Players will be kicked off.")) {
      return;
    }
    setControlBusy(action);
    try {
      const res = await fetch("/api/server/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        show("Couldn't " + (action === "start" ? "start" : "stop"), data.error ?? "Try again soon.");
        return;
      }
      show(
        action === "start" ? "Server starting" : "Server stopping",
        action === "start"
          ? "Kicking it up — give it a minute to come online."
          : "Shutting down — players have been kicked."
      );
      void refetch();
    } catch {
      show("Couldn't " + (action === "start" ? "start" : "stop"), "Something went wrong.", "error");
    } finally {
      setControlBusy(null);
    }
  };

  // Auto-refresh the live status every 60s so the page stays current.
  useEffect(() => {
    const id = setInterval(() => void refetch(), 60000);
    return () => clearInterval(id);
  }, [refetch]);

  // Manual refresh shows its own spinner (the hook's `loading` is only true
  // for the first load, so the pill never flickers on background refreshes).
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  // Only trust numbers that came from the live match query — when the status
  // API is unreachable we show "offline / unavailable" instead of pretending.
  const statusLive = STATUS.source === "live";
  const online = statusLive && STATUS.online;
  const players = statusLive ? (STATUS.players ?? 0) : 0;
  const max = STATUS.max ?? siteConfig.maxPlayers;
  const playerList = statusLive ? (STATUS.playerList ?? []) : [];
  const stats = siteConfig.stats;
  const tpsPct = Math.min(100, Math.round((parseFloat(stats.tps) / 20) * 100));

  return (
    <SubPage>
      <div className="w-full">
        {/* Header */}
        <div className="page-header rowed mb-8 gap-4">
          <div>
            <p className="page-kicker">
              <i className="fa-solid fa-signal" aria-hidden="true" />
              Live telemetry
            </p>
            <h1 className="page-title">Server Status</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              className="btn-ghost btn-sm"
              onClick={() => void refresh()}
              disabled={refreshing}
              aria-label="Refresh status"
              title="Refresh now"
            >
              <i className={`fa-solid fa-rotate-right ${refreshing ? "fa-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <div className={`status-pill ${online ? "" : "offline"}`}>
              <span className={`pulse-dot ${online ? "" : "muted"}`} />
              <span>{statusLoading ? "Checking…" : online ? "Online" : "Offline"}</span>
            </div>
          </div>
        </div>

        {/* Console stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5 stagger">
          {/* Players */}
          <div className="card stat-card p-5 flex flex-col">
            <div className="stat-icon">
              <i className="fa-solid fa-users" />
            </div>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="stat-number">{players}</span>
              <span className="font-display text-lg text-[var(--muted-2)]">/{max}</span>
            </div>
            <div className="mt-1 text-xs text-[var(--muted)] uppercase tracking-wider">
              players online
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {playerList.length > 0 ? (
                playerList.map((name) => (
                  <span key={name} className="tag tag-emerald">{name}</span>
                ))
              ) : (
                <span className="text-xs text-[var(--muted-2)]">
                  {statusLive
                    ? "The realm is quiet right now."
                    : "Status data unavailable right now."}
                </span>
              )}
            </div>
          </div>

          {/* TPS */}
          <div className="card stat-card p-5 flex flex-col">
            <div
              className="stat-icon"
              style={{
                color: "var(--diamond)",
                borderColor: "rgba(56,211,240,0.4)",
                background: "rgba(56,211,240,0.08)",
              }}
            >
              <i className="fa-solid fa-bolt" />
            </div>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="stat-number">{stats.tps}</span>
            </div>
            <div className="mt-1 text-xs text-[var(--muted)] uppercase tracking-wider">
              tick rate
              <span className="normal-case tracking-normal text-[var(--muted-2)]"> · reported</span>
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-[var(--bg-3)] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[var(--emerald)] to-[var(--diamond)]"
                style={{ width: `${tpsPct}%` }}
              />
            </div>
          </div>

          {/* Uptime */}
          <div className="card stat-card p-5 flex flex-col">
            <div className="stat-icon">
              <i className="fa-solid fa-clock" />
            </div>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="stat-number">{stats.uptimeDays}</span>
              <span className="font-display text-lg text-[var(--muted-2)]">d</span>
            </div>
            <div className="mt-1 text-xs text-[var(--muted)] uppercase tracking-wider">
              days of uptime
              <span className="normal-case tracking-normal text-[var(--muted-2)]"> · reported</span>
            </div>
            <div className="mt-3 text-xs text-[var(--muted-2)]">
              your local time:{" "}
              <span className="font-display text-sm text-[var(--accent)]">{time}</span>
            </div>
          </div>

          {/* World */}
          <div className="card stat-card p-5 flex flex-col">
            <div className="stat-icon">
              <i className="fa-solid fa-cube" />
            </div>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="stat-number">{stats.worldSize}</span>
              <span className="font-display text-lg text-[var(--muted-2)]">GB</span>
            </div>
            <div className="mt-1 text-xs text-[var(--muted)] uppercase tracking-wider">
              map size · {stats.mapSize}
              <span className="normal-case tracking-normal text-[var(--muted-2)]"> · reported</span>
            </div>
            <div className="mt-3 text-xs text-[var(--muted-2)]">
              {siteConfig.software} · {siteConfig.version}
            </div>
          </div>
        </div>

        <p className="text-xs text-[var(--muted-2)] mt-3">
          Player count and the online list come from the live status query; TPS, uptime and world
          size are the last values reported by the server.
        </p>

        {/* Connection info */}
        <div className="grid lg:grid-cols-3 gap-6 mt-10">
          <div className="lg:col-span-2 card p-6">
            <h2 className="font-display text-xl font-bold mb-5 flex items-center gap-2">
              <i className="fa-solid fa-server text-[var(--accent)]" />
              Connection
            </h2>
            <div className="space-y-2">
              {[
                ["Address", siteConfig.address, "code"],
                ["Version", `${siteConfig.version} · ${siteConfig.software}`, "text"],
                ["Difficulty", siteConfig.difficulty, "text"],
                ["Whitelist", siteConfig.whitelist, "emerald"],
                ["Location", siteConfig.location, "text"],
              ].map(([label, value, kind]) => (
                <div key={label as string} className="flex justify-between items-center gap-4 pb-2 border-b border-[var(--border)] last:border-b-0 last:pb-0">
                  <span className="text-sm text-[var(--muted)] flex-shrink-0">{label}</span>
                  <span className="min-w-0 text-right break-all">
                    {kind === "code" ? (
                      <code className="text-sm text-[var(--accent)] font-display">{value}</code>
                    ) : kind === "emerald" ? (
                      <span className="text-sm text-[var(--emerald)]">{value}</span>
                    ) : (
                      <span className="text-sm">{value}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-5">
              <CopyIpButton />
            </div>
          </div>

          {/* Pointer to the full how-to-join steps — one source of truth
              (this used to duplicate /join with a different step count). */}
          <div className="card p-6 flex flex-col">
            <h2 className="font-display text-xl font-bold mb-5 flex items-center gap-2">
              <i className="fa-solid fa-compass text-[var(--accent)]" />
              New here?
            </h2>
            <p className="text-sm text-[var(--muted)] mb-5 flex-1">
              The full step-by-step guide to joining the server — versions,
              whitelist and all.
            </p>
            <Link href="/join" className="btn-secondary justify-center">
              <i className="fa-solid fa-arrow-right" />
              How to Join
            </Link>
          </div>
        </div>

        {/* Server Control — start/stop the Minecraft server (verified members) */}
        {control && control.configured && (
          <div className="card p-6 mt-10">
            <h2 className="font-display text-xl font-bold mb-1 flex items-center gap-2">
              <i className="fa-solid fa-power-off text-[var(--accent)]" />
              Server Control
            </h2>
            <p className="text-sm text-[var(--muted)] mb-5">
              Start or stop the Minecraft server. Requires Discord verification.
            </p>
            {control.allowed ? (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  className="btn-primary"
                  onClick={() => void runControl("start")}
                  disabled={controlBusy !== null || online}
                >
                  {controlBusy === "start" ? (
                    <i className="fa-solid fa-spinner fa-spin" />
                  ) : (
                    <i className="fa-solid fa-play" />
                  )}
                  Start Server
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => void runControl("stop")}
                  disabled={controlBusy !== null || !online}
                >
                  {controlBusy === "stop" ? (
                    <i className="fa-solid fa-spinner fa-spin" />
                  ) : (
                    <i className="fa-solid fa-stop" />
                  )}
                  Stop Server
                </button>
                <span className="text-xs text-[var(--muted-2)]">
                  {online
                    ? "Server is online — stop it to save resources."
                    : "The server is offline right now."}
                </span>
              </div>
            ) : user ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <p className="text-sm text-[var(--muted)]">
                  Verify you&apos;re in the official Discord server to control the server.
                </p>
                <Link href="/settings" className="btn-primary sm:ml-auto shrink-0 justify-center">
                  <i className="fa-solid fa-user-check" />
                  Verify in Settings
                </Link>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <p className="text-sm text-[var(--muted)]">
                  Sign in with Discord to control the server.
                </p>
                <Link href="/login" className="btn-primary sm:ml-auto shrink-0 justify-center">
                  <i className="fa-brands fa-discord" />
                  Log in with Discord
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </SubPage>
  );
}
