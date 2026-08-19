"use client";

import { useEffect, useState } from "react";
import { siteConfig } from "@/lib/site";
import { fallbackStatus } from "@/lib/fallback-data";
import type { ServerStatus } from "@/types";
import { useToast } from "@/components/Toast";
import { SubPage } from "@/components/SubPage";
import { useApi } from "@/lib/use-api";

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
  const { data: STATUS, refetch, loading: statusLoading } = useApi<ServerStatus>(
    "/api/status",
    fallbackStatus
  );

  // Auto-refresh the live status every 60s so the page stays current.
  useEffect(() => {
    const id = setInterval(() => void refetch(), 60000);
    return () => clearInterval(id);
  }, [refetch]);

  const copyIP = async () => {
    try {
      await navigator.clipboard.writeText(siteConfig.address);
      show("Server address copied", siteConfig.address);
    } catch {
      show("Couldn't copy address", siteConfig.address);
    }
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
        <div className="page-header rowed mb-8">
          <h1 className="page-title">Server Status</h1>
          <div className="flex items-center gap-3">
            <button
              className="btn-ghost py-2! px-3!"
              onClick={() => void refetch()}
              aria-label="Refresh status"
              title="Refresh now"
            >
              <i className="fa-solid fa-rotate-right" />
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
            </div>
            <div className="mt-3 text-xs text-[var(--muted-2)]">
              {siteConfig.software} · {siteConfig.version}
            </div>
          </div>
        </div>

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
            <button className="btn-primary w-full mt-5 py-3! text-xs!" onClick={copyIP}>
              <i className="fa-solid fa-copy" />
              Copy Server Address
            </button>
          </div>

          <div className="card p-6">
            <h2 className="font-display text-xl font-bold mb-5 flex items-center gap-2">
              <i className="fa-solid fa-compass text-[var(--accent)]" />
              How to Join
            </h2>
            <ol className="space-y-2">
              {[
                "Copy the server address above.",
                "Open Minecraft and go to Multiplayer.",
                "Add Server → paste the address → join.",
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-[var(--fg-2)]">
                  <span className="font-display text-xs text-[var(--accent)] flex-shrink-0">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </SubPage>
  );
}
