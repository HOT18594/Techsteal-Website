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
  const { data: STATUS, refetch } = useApi<ServerStatus>("/api/status", fallbackStatus);

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

  const online = STATUS.online;
  const players = STATUS.players ?? 0;
  const max = STATUS.max ?? siteConfig.maxPlayers;
  const playerList = STATUS.playerList ?? [];
  const stats = siteConfig.stats;

  return (
    <SubPage className="mx-auto max-w-7xl pt-6 pb-16">
      <div className="max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="page-header rowed mb-8">
          <div>
            <span className="page-kicker">
              <i className="fa-solid fa-signal" aria-hidden="true" />
              Live · Server Status
            </span>
            <h1 className="page-title">Server Status</h1>
          </div>
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
              <span>{online ? "Online" : "Offline"}</span>
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="card stat-card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="stat-icon">
                <i className="fa-solid fa-users" />
              </span>
              <span className="text-xs text-[var(--muted)] uppercase tracking-wider">Active</span>
            </div>
            <div className="stat-number mb-1">
              <span>{players}</span>
              <span className="text-[var(--muted-2)] text-xl">/{max}</span>
            </div>
            <div className="text-sm text-[var(--muted)]">Players online</div>
          </div>

          <div className="card stat-card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="stat-icon" style={{ color: "var(--diamond)", borderColor: "rgba(56,211,240,0.4)", background: "rgba(56,211,240,0.08)", boxShadow: "0 0 20px -8px rgba(56,211,240,0.5)" }}>
                <i className="fa-solid fa-bolt" />
              </span>
              <span className="text-xs text-[var(--muted)] uppercase tracking-wider">TPS</span>
            </div>
            <div className="stat-number mb-1">{stats.tps}</div>
            <div className="text-sm text-[var(--emerald)]">Tick rate</div>
          </div>

          <div className="card stat-card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="stat-icon">
                <i className="fa-solid fa-clock" />
              </span>
              <span className="text-xs text-[var(--muted)] uppercase tracking-wider">Uptime</span>
            </div>
            <div className="stat-number mb-1">
              {stats.uptimeDays}
              <span className="text-[var(--muted-2)] text-xl">d</span>
            </div>
            <div className="text-sm text-[var(--muted)]">Days uptime</div>
          </div>

          <div className="card stat-card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="stat-icon">
                <i className="fa-solid fa-cube" />
              </span>
              <span className="text-xs text-[var(--muted)] uppercase tracking-wider">World</span>
            </div>
            <div className="stat-number mb-1">
              {stats.worldSize}
              <span className="text-[var(--muted-2)] text-xl">GB</span>
            </div>
            <div className="text-sm text-[var(--muted)]">Map size · {stats.mapSize}</div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Currently in-realm */}
          <div className="lg:col-span-2 card p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="font-display text-xl font-bold">Currently In-Realm</h2>
                <p className="text-sm text-[var(--muted)] mt-1">
                  {playerList.length > 0
                    ? `${playerList.length} player${playerList.length === 1 ? "" : "s"} online`
                    : "No players online right now"}
                </p>
              </div>
              <div className="text-right">
                <div className="text-xs text-[var(--muted)] uppercase tracking-wider">In-game time</div>
                <div className="font-display text-lg text-[var(--accent)]">{time}</div>
              </div>
            </div>

            {playerList.length === 0 ? (
              <div className="text-sm text-[var(--muted)] py-10 text-center border border-dashed border-[var(--border)] rounded-lg">
                <i className="fa-solid fa-user-slash text-2xl text-[var(--muted-2)] mb-3 block" />
                The realm is quiet right now.
              </div>
            ) : (
              <div className="space-y-2">
                {playerList.map((name) => (
                  <div
                    key={name}
                    className="flex items-center gap-4 p-3 bg-[var(--bg-2)] border border-[var(--border)] rounded-lg"
                  >
                    <div className="relative">
                      <div className="avatar avatar-4 size-md">{name.charAt(0).toUpperCase()}</div>
                      <div className="status-online" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-display font-bold text-lg">{name}</div>
                      <div className="text-xs text-[var(--emerald)] uppercase tracking-wider">In-game</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Connection info */}
          <div className="space-y-6">
            <div className="card p-6">
              <h2 className="font-display text-lg font-bold mb-4 flex items-center gap-2">
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
                  <div key={label as string} className="flex justify-between items-center pb-2 border-b border-[var(--border)] last:border-b-0 last:pb-0">
                    <span className="text-sm text-[var(--muted)]">{label}</span>
                    {kind === "code" ? (
                      <code className="text-sm text-[var(--accent)] font-display">{value}</code>
                    ) : kind === "emerald" ? (
                      <span className="text-sm text-[var(--emerald)]">{value}</span>
                    ) : (
                      <span className="text-sm">{value}</span>
                    )}
                  </div>
                ))}
              </div>
              <button className="btn-primary w-full mt-5 py-3! text-xs!" onClick={copyIP}>
                <i className="fa-solid fa-copy" />
                Copy Server Address
              </button>
            </div>

            <div className="card p-6">
              <h2 className="font-display text-lg font-bold mb-4 flex items-center gap-2">
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
      </div>
    </SubPage>
  );
}