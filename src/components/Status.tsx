"use client";

import { useEffect, useState } from "react";
import { siteConfig } from "@/lib/site";
import { useApi } from "@/lib/use-api";
import type { ServerStatus } from "@/types";
import { Reveal } from "./Reveal";
import { useToast } from "./Toast";

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

export function Status() {
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
    <section id="status" className="relative py-24 lg:py-32 z-10">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <Reveal>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-16">
            <div>
              <div className="section-label mb-4">01 / Server Status</div>
              <h2 className="font-display text-5xl md:text-6xl font-bold mb-3">Server Status</h2>
            </div>
            <div className={`status-pill mt-6 md:mt-0 ${online ? "" : "offline"}`}>
              <span className={`pulse-dot ${online ? "" : "muted"}`} />
              <span>{online ? "All systems nominal" : "Server offline"}</span>
            </div>
          </div>
        </Reveal>

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
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

          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <i className="fa-solid fa-bolt text-[var(--diamond)] text-xl" />
              <span className="text-xs text-[var(--muted)] uppercase tracking-wider">TPS</span>
            </div>
            <div className="font-display text-4xl font-bold mb-1">{stats.tps}</div>
            <div className="text-sm text-[var(--emerald)]">Tick rate</div>
          </div>

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
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Currently in-realm */}
          <div className="lg:col-span-2 card p-6 lg:p-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-display text-2xl font-bold">Currently In-Realm</h3>
                <p className="text-sm text-[var(--muted)] mt-1">
                  {playerList.length > 0 ? `${playerList.length} player${playerList.length === 1 ? "" : "s"} online` : "No players online right now"}
                </p>
              </div>
              <div className="text-right">
                <div className="text-xs text-[var(--muted)] uppercase tracking-wider">In-game time</div>
                <div className="font-display text-lg text-[var(--accent)]">{time}</div>
              </div>
            </div>

            {playerList.length === 0 ? (
              <div className="text-sm text-[var(--muted)] py-6 text-center border border-dashed border-[var(--border)]">
                The realm is quiet right now.
              </div>
            ) : (
              <div className="space-y-3">
                {playerList.map((name) => (
                  <div
                    key={name}
                    className="flex items-center gap-4 p-4 bg-[var(--bg-2)] border border-[var(--border)] hover:border-[var(--border-strong)] transition"
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

          {/* Connection + how to join */}
          <div className="space-y-6">
            <div className="card p-6">
              <h3 className="font-display text-lg font-bold mb-4 flex items-center gap-2">
                <i className="fa-solid fa-server text-[var(--accent)]" />
                Connection
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center pb-3 border-b border-[var(--border)]">
                  <span className="text-sm text-[var(--muted)]">Address</span>
                  <code className="text-sm text-[var(--accent)]">{siteConfig.address}</code>
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
              <button className="btn-secondary w-full mt-5 !py-2.5 !text-xs" onClick={copyIP}>
                <i className="fa-solid fa-copy" />
                Copy Address
              </button>
            </div>

            <div className="card p-6">
              <h3 className="font-display text-lg font-bold mb-4 flex items-center gap-2">
                <i className="fa-solid fa-compass text-[var(--accent)]" />
                How to Join
              </h3>
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
          </div>
        </div>
      </div>
    </section>
  );
}
