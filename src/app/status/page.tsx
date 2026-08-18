"use client";

import { useEffect, useState } from "react";
import { siteConfig } from "@/lib/site";
import { useApi } from "@/lib/use-api";
import type { ServerStatus } from "@/types";
import { Reveal } from "@/components/Reveal";
import { useToast } from "@/components/Toast";

const INITIAL_STATUS: ServerStatus = {
  online: false,
  players: 0,
  max: siteConfig.maxPlayers,
  playerList: [],
  version: siteConfig.version,
  hostname: siteConfig.address,
};

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
  const { data: status } = useApi<ServerStatus>("/api/status", INITIAL_STATUS);
  const time = useClock();
  const { show } = useToast();

  const copyIP = async () => {
    try {
      await navigator.clipboard.writeText(siteConfig.address);
      show("Server address copied", siteConfig.address);
    } catch {
      show("Couldn't copy address", siteConfig.address);
    }
  };

  const online = status.online;
  const players = status.players ?? 0;
  const max = status.max ?? siteConfig.maxPlayers;
  const playerList = status.playerList ?? [];
  const stats = siteConfig.stats;

  return (
    <section className="py-24 lg:py-32 px-6 lg:px-10">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-16">
            <div>
              <div className="section-label mb-4">01 / Server Status</div>
              <h1 className="font-display text-5xl md:text-6xl font-bold mb-3">Server Status</h1>
            </div>
            <div className={`status-pill mt-6 md:mt-0 ${online ? "" : "offline"}`}>
              <span className={`pulse-dot ${online ? "" : "muted"}`} />
              <span>{online ? "All systems nominal" : "Server offline"}</span>
            </div>
          </div>
        </Reveal>

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          <Reveal delay={1}>
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <i className="fa-solid fa-users text-[var(--accent)] text-xl" />
                <span className="text-xs text-[var(--muted)] uppercase tracking-wider">Active</span>
              </div>
              <div className="font-display text-4xl font-bold mb-1">
                <span>{players}</span>
                <span className="text-[var(--muted-2)] text-2xl">/{max}</span>
              </div>
              <div className="text-sm text-[var(--muted)]">Players online</div>
            </div>
          </Reveal>

          <Reveal delay={2}>
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <i className="fa-solid fa-bolt text-[var(--diamond)] text-xl" />
                <span className="text-xs text-[var(--muted)] uppercase tracking-wider">TPS</span>
              </div>
              <div className="font-display text-4xl font-bold mb-1">{stats.tps}</div>
              <div className="text-sm text-[var(--emerald)]">Tick rate</div>
            </div>
          </Reveal>

          <Reveal delay={3}>
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <i className="fa-solid fa-clock text-[var(--accent)] text-xl" />
                <span className="text-xs text-[var(--muted)] uppercase tracking-wider">Uptime</span>
              </div>
              <div className="font-display text-4xl font-bold mb-1">
                {stats.uptimeDays}
                <span className="text-[var(--muted-2)] text-2xl">d</span>
              </div>
              <div className="text-sm text-[var(--muted)]">Days uptime</div>
            </div>
          </Reveal>

          <Reveal delay={4}>
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <i className="fa-solid fa-cube text-[var(--accent)] text-xl" />
                <span className="text-xs text-[var(--muted)] uppercase tracking-wider">World</span>
              </div>
              <div className="font-display text-4xl font-bold mb-1">
                {stats.worldSize}
                <span className="text-[var(--muted-2)] text-2xl">GB</span>
              </div>
              <div className="text-sm text-[var(--muted)]">Map size · {stats.mapSize}</div>
            </div>
          </Reveal>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Currently in-realm */}
          <Reveal>
            <div className="lg:col-span-2 card p-6 lg:p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="font-display text-2xl font-bold">Currently In-Realm</h2>
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
                <div className="text-sm text-[var(--muted)] py-12 text-center border border-dashed border-[var(--border)] rounded-lg">
                  <i className="fa-solid fa-user-slash text-3xl text-[var(--muted-2)] mb-3 block" />
                  The realm is quiet right now.
                </div>
              ) : (
                <div className="space-y-3">
                  {playerList.map((name) => (
                    <div
                      key={name}
                      className="flex items-center gap-4 p-4 bg-[var(--bg-2)] border border-[var(--border)] hover:border-[var(--border-strong)] transition rounded-lg"
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
          </Reveal>

          {/* Connection info */}
          <Reveal>
            <div className="space-y-6">
              <div className="card p-6">
                <h2 className="font-display text-lg font-bold mb-4 flex items-center gap-2">
                  <i className="fa-solid fa-server text-[var(--accent)]" />
                  Connection
                </h2>
                <div className="space-y-3">
                  <div className="flex justify-between items-center pb-3 border-b border-[var(--border)]">
                    <span className="text-sm text-[var(--muted)]">Address</span>
                    <code className="text-sm text-[var(--accent)] font-display">{siteConfig.address}</code>
                  </div>
                  <div className="flex justify-between items-center pb-3 border-b border-[var(--border)]">
                    <span className="text-sm text-[var(--muted)]">Version</span>
                    <span className="text-sm">{siteConfig.version} · {siteConfig.software}</span>
                  </div>
                  <div className="flex justify-between items-center pb-3 border-b border-[var(--border)]">
                    <span className="text-sm text-[var(--muted)]">Difficulty</span>
                    <span className="text-sm">{siteConfig.difficulty}</span>
                  </div>
                  <div className="flex justify-between items-center pb-3 border-b border-[var(--border)]">
                    <span className="text-sm text-[var(--muted)]">Whitelist</span>
                    <span className="text-sm text-[var(--emerald)]">{siteConfig.whitelist}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[var(--muted)]">Location</span>
                    <span className="text-sm">{siteConfig.location}</span>
                  </div>
                </div>
                <button className="btn-primary w-full mt-5" onClick={copyIP}>
                  <i className="fa-solid fa-copy" />
                  <span>Copy Server Address</span>
                </button>
              </div>

              <div className="card p-6">
                <h2 className="font-display text-lg font-bold mb-4 flex items-center gap-2">
                  <i className="fa-solid fa-compass text-[var(--accent)]" />
                  How to Join
                </h2>
                <ol className="space-y-3">
                  {[
                    "Copy the server address above.",
                    "Open Minecraft and go to Multiplayer.",
                    "Click Add Server, paste the address, and join.",
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

              {/* Asset placeholder for status page */}
              <div className="asset-placeholder aspect-video rounded-lg">
                <div className="asset-placeholder-content">
                  <i className="fa-solid fa-video asset-placeholder-icon" />
                  <span className="asset-placeholder-text">Server Trailer / Gameplay</span>
                  <span className="asset-placeholder-hint">Add video or screenshot</span>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}