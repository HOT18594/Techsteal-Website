"use client";

import { useEffect, useState } from "react";
import { siteConfig } from "@/lib/site";
import { fallbackStatus } from "@/lib/fallback-data";
import type { ServerStatus } from "@/types";
import { useToast } from "@/components/Toast";
import { SubPage } from "@/components/SubPage";
import { useApi } from "@/lib/use-api";
import { Carousel } from "@/components/Carousel";

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

/** Count from 0 → target when `active` flips true (rAF, 900ms, ease-out). */
function useCountUp(target: number, active: boolean, decimals = 0) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const duration = 900;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active]);
  return value.toFixed(decimals);
}

export default function StatusPage() {
  const time = useClock();
  const { show } = useToast();
  const { data: STATUS, refetch } = useApi<ServerStatus>("/api/status", fallbackStatus);
  const [active, setActive] = useState(0);

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

  const countPlayers = useCountUp(players, active === 0);
  const countTps = useCountUp(parseFloat(stats.tps), active === 1, 1);
  const countUptime = useCountUp(parseInt(stats.uptimeDays, 10), active === 2);
  const countWorld = useCountUp(parseFloat(stats.worldSize), active === 3, 1);

  const slides = [
    // 1 — Live status
    <div key="live" className="card stat-slide">
      <div className={`status-pill text-base! ${online ? "" : "offline"}`}>
        <span className={`pulse-dot ${online ? "" : "muted"}`} />
        {online ? "All systems online" : "Server offline"}
      </div>
      <div className="mt-6 font-display text-6xl md:text-7xl font-bold leading-none text-[var(--fg)]">
        {countPlayers}
        <span className="text-[var(--muted-2)] text-3xl">/{max}</span>
      </div>
      <p className="mt-3 text-sm text-[var(--muted)]">players online right now</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {playerList.length > 0 ? (
          playerList.map((name) => (
            <span key={name} className="tag tag-emerald">{name}</span>
          ))
        ) : (
          <span className="text-xs text-[var(--muted-2)]">The realm is quiet right now.</span>
        )}
      </div>
    </div>,
    // 2 — TPS
    <div key="tps" className="card stat-slide">
      <div className="stat-slide-icon" style={{ color: "var(--diamond)", borderColor: "rgba(56,211,240,0.4)", background: "rgba(56,211,240,0.08)" }}>
        <i className="fa-solid fa-bolt" />
      </div>
      <div className="mt-5 font-display text-6xl md:text-7xl font-bold leading-none text-[var(--fg)]">
        {countTps}
      </div>
      <p className="mt-3 text-sm text-[var(--emerald)]">tick rate · butter smooth</p>
      <div className="mt-5 w-full max-w-xs h-1.5 rounded-full bg-[var(--bg-3)] overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[var(--emerald)] to-[var(--diamond)] transition-all duration-1000"
          style={{ width: active === 1 ? "100%" : "0%" }}
        />
      </div>
    </div>,
    // 3 — Uptime
    <div key="uptime" className="card stat-slide">
      <div className="stat-slide-icon">
        <i className="fa-solid fa-clock" />
      </div>
      <div className="mt-5 font-display text-6xl md:text-7xl font-bold leading-none text-[var(--fg)]">
        {countUptime}
        <span className="text-[var(--muted-2)] text-3xl">d</span>
      </div>
      <p className="mt-3 text-sm text-[var(--muted)]">days of uninterrupted uptime</p>
      <p className="mt-2 text-xs text-[var(--muted-2)]">
        in-game time now: <span className="text-[var(--accent)] font-display text-sm">{time}</span>
      </p>
    </div>,
    // 4 — World
    <div key="world" className="card stat-slide">
      <div className="stat-slide-icon">
        <i className="fa-solid fa-cube" />
      </div>
      <div className="mt-5 font-display text-6xl md:text-7xl font-bold leading-none text-[var(--fg)]">
        {countWorld}
        <span className="text-[var(--muted-2)] text-3xl">GB</span>
      </div>
      <p className="mt-3 text-sm text-[var(--muted)]">map size · {stats.mapSize}</p>
      <p className="mt-2 text-xs text-[var(--muted-2)]">{siteConfig.software} · {siteConfig.version}</p>
    </div>,
  ];

  return (
    <SubPage className="mx-auto max-w-7xl pt-6 pb-16">
      <div className="max-w-7xl mx-auto w-full">
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
              <span>{online ? "Online" : "Offline"}</span>
            </div>
          </div>
        </div>

        {/* Stats slideshow */}
        <Carousel
          slides={slides}
          label="Server statistics"
          interval={6000}
          onIndexChange={setActive}
        />

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
