"use client";

import type { CSSProperties } from "react";
import { siteConfig } from "@/lib/site";
import { useApi } from "@/lib/use-api";
import type { ServerStatus } from "@/types";
import { Reveal } from "./Reveal";
import { useToast } from "./Toast";

interface CubeSpec {
  size: number;
  diamond?: boolean;
  top?: string;
  left?: string;
  right?: string;
  bottom?: string;
  delay: string;
}

const CUBES: CubeSpec[] = [
  { size: 70, top: "18%", left: "8%", delay: "0s" },
  { size: 50, diamond: true, top: "28%", right: "12%", delay: "-6s" },
  { size: 90, bottom: "22%", left: "14%", delay: "-12s" },
  { size: 40, top: "40%", right: "22%", delay: "-18s" },
  { size: 60, diamond: true, bottom: "30%", right: "8%", delay: "-3s" },
];

function Cube({ size, diamond, style }: { size: number; diamond?: boolean; style: CSSProperties }) {
  const half = size / 2;
  const face: CSSProperties = { width: size, height: size };
  const faces = [
    { key: "front", transform: `translateZ(${half}px)` },
    { key: "back", transform: `translateZ(-${half}px) rotateY(180deg)` },
    { key: "right", transform: `rotateY(90deg) translateZ(${half}px)` },
    { key: "left", transform: `rotateY(-90deg) translateZ(${half}px)` },
    { key: "top", transform: `rotateX(90deg) translateZ(${half}px)` },
    { key: "bottom", transform: `rotateX(-90deg) translateZ(${half}px)` },
  ];

  return (
    <div className={`cube ${diamond ? "diamond" : ""}`} style={style}>
      {faces.map((f) => (
        <div key={f.key} className={`face ${f.key}`} style={{ ...face, transform: f.transform }} />
      ))}
    </div>
  );
}

export function Hero() {
  const { show } = useToast();
  const { data: status } = useApi<ServerStatus>("/api/status", {
    online: true,
    players: 0,
    max: siteConfig.maxPlayers,
  });

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

  return (
    <section id="home" className="relative min-h-screen flex items-center pt-24 pb-16 overflow-hidden z-10">
      <div className="grid-overlay" />

      <div className="scene">
        {CUBES.map((c, i) => (
          <Cube
            key={i}
            size={c.size}
            diamond={c.diamond}
            style={{
              top: c.top,
              left: c.left,
              right: c.right,
              bottom: c.bottom,
              animationDelay: c.delay,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-10 w-full">
        <div className="max-w-3xl">
          <Reveal>
            <div className="section-label mb-8">EST. {siteConfig.established} · PRIVATE SERVER</div>
          </Reveal>

          <Reveal delay={1}>
            <h1
              className="font-display font-bold leading-[0.85] mb-6 glow-text"
              style={{ fontSize: "clamp(72px, 14vw, 180px)" }}
            >
              {siteConfig.name}
            </h1>
          </Reveal>

          <Reveal delay={2}>
            <div className="pixel-divider my-8" />
          </Reveal>

          <Reveal delay={3}>
            <div className="flex flex-wrap gap-4 mb-12">
              <button className="btn-primary" onClick={copyIP}>
                <i className="fa-solid fa-play" />
                Join Server
              </button>
              <a href="#status" className="btn-secondary">
                <i className="fa-solid fa-signal" />
                View Status
              </a>
            </div>
          </Reveal>

          <Reveal delay={4}>
            <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
              <div className="flex items-center gap-3">
                <span className={`pulse-dot ${online ? "" : "muted"}`} />
                <div>
                  <div className="text-xs text-[var(--muted)] uppercase tracking-wider">Server Status</div>
                  <div className={`font-display text-lg ${online ? "text-[var(--emerald)]" : "text-[var(--muted)]"}`}>
                    {online ? "Online" : "Offline"}
                  </div>
                </div>
              </div>
              <div className="w-px h-8 bg-[var(--border)]" />
              <div>
                <div className="text-xs text-[var(--muted)] uppercase tracking-wider">Players</div>
                <div className="font-display text-lg">
                  <span>{players}</span>
                  <span className="text-[var(--muted)]">/{max}</span>
                </div>
              </div>
              <div className="w-px h-8 bg-[var(--border)]" />
              <div>
                <div className="text-xs text-[var(--muted)] uppercase tracking-wider">IP</div>
                <div className="font-display text-lg text-[var(--accent)]">{siteConfig.address}</div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-[var(--muted)] text-xs tracking-wider uppercase z-10">
        <span>Scroll to explore</span>
        <i className="fa-solid fa-chevron-down animate-bounce text-[var(--accent)]" />
      </div>
    </section>
  );
}
