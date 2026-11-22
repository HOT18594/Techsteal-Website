"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useLaunchState } from "@/components/LaunchProvider";
import { formatLaunchEastern, type LaunchState } from "@/lib/launch-shared";
import { siteConfig } from "@/lib/site";

const XP_SEGMENTS = 18;
const XP_WINDOW_SECONDS = 86_400; // 24 hours leading up to launch

const PIXEL_COLORS = [
  "#7dff2b", // Minecraft XP lime
  "#22c55e", // Emerald
  "#38bdf8", // Diamond
  "#facc15", // Gold ingot
  "#fb7185", // Redstone
  "#c084fc", // Amethyst
  "#fb923c", // Torch flame
  "#f4f0e5", // Quartz
];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  spin: number;
  kind: "block" | "diamond" | "spark";
  life: number;
  maxLife: number;
}

function subscribeToClock(onTick: () => void): () => void {
  const id = setInterval(onTick, 1_000);
  return () => clearInterval(id);
}

function currentSecond(): number {
  return Math.floor(Date.now() / 1_000);
}

function serverSecond(): number {
  return 0;
}

function PixelGrassBlock() {
  return (
    <svg viewBox="0 0 16 16" className="mc-pixel-icon" aria-hidden="true" shapeRendering="crispEdges">
      <rect width="16" height="16" fill="#5b3b24" />
      <rect x="0" y="0" width="16" height="4" fill="#5db637" />
      <rect x="2" y="4" width="3" height="2" fill="#5db637" />
      <rect x="8" y="4" width="2" height="2" fill="#5db637" />
      <rect x="12" y="4" width="3" height="1" fill="#5db637" />
      <rect x="1" y="1" width="3" height="1" fill="#82dc52" />
      <rect x="7" y="0" width="4" height="2" fill="#82dc52" />
      <rect x="12" y="2" width="2" height="1" fill="#469229" />
      <rect x="3" y="8" width="2" height="2" fill="#462b19" />
      <rect x="10" y="7" width="3" height="2" fill="#774e31" />
      <rect x="6" y="11" width="2" height="2" fill="#462b19" />
      <rect x="12" y="12" width="2" height="2" fill="#774e31" />
    </svg>
  );
}

function PixelDiamond() {
  return (
    <svg viewBox="0 0 16 16" className="mc-pixel-icon" aria-hidden="true" shapeRendering="crispEdges">
      <rect x="5" y="2" width="6" height="1" fill="#134e6f" />
      <rect x="3" y="3" width="2" height="2" fill="#134e6f" />
      <rect x="11" y="3" width="2" height="2" fill="#134e6f" />
      <rect x="2" y="5" width="1" height="5" fill="#134e6f" />
      <rect x="13" y="5" width="1" height="5" fill="#134e6f" />
      <rect x="3" y="10" width="2" height="2" fill="#134e6f" />
      <rect x="11" y="10" width="2" height="2" fill="#134e6f" />
      <rect x="5" y="12" width="6" height="2" fill="#134e6f" />
      <rect x="5" y="3" width="6" height="9" fill="#38bdf8" />
      <rect x="3" y="5" width="2" height="5" fill="#38bdf8" />
      <rect x="11" y="5" width="2" height="5" fill="#0ea5e9" />
      <rect x="5" y="4" width="3" height="3" fill="#bae6fd" />
      <rect x="4" y="6" width="2" height="2" fill="#e0f2fe" />
      <rect x="7" y="9" width="4" height="3" fill="#0284c7" />
    </svg>
  );
}

function spawnBurst(
  particles: Particle[],
  originX: number,
  originY: number,
  count: number,
  spread: number,
  upwardBias: number,
  speedRange: [number, number] = [4.5, 10.5]
) {
  const [minSpeed, extraSpeed] = speedRange;
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * spread;
    const speed = minSpeed + Math.random() * extraSpeed;
    const roll = Math.random();
    particles.push({
      x: originX + (Math.random() - 0.5) * 44,
      y: originY + (Math.random() - 0.5) * 24,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - upwardBias,
      size: 8 + Math.floor(Math.random() * 8),
      color: PIXEL_COLORS[Math.floor(Math.random() * PIXEL_COLORS.length)],
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.2,
      kind: roll > 0.78 ? "diamond" : roll > 0.62 ? "spark" : "block",
      life: 0,
      maxLife: 135 + Math.floor(Math.random() * 65),
    });
  }
}

export function LaunchCountdown({ initialLaunch }: { initialLaunch?: LaunchState }) {
  const { launch, runLaunch } = useLaunchState();
  const active = launch.configured ? launch : (initialLaunch ?? launch);
  const second = useSyncExternalStore(subscribeToClock, currentSecond, serverSecond);
  const attempted = useRef(false);
  const sawPreLaunch = useRef(false);
  const ambientStep = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number | null>(null);
  const timersRef = useRef<number[]>([]);
  const cardRef = useRef<HTMLElement | null>(null);
  const [hasActiveConfetti, setHasActiveConfetti] = useState(false);

  const target = new Date(active.launchAt).getTime();
  const now = second * 1_000;
  const ready = second > 0;
  const live = active.seasonLive || (active.enabled && ready && Number.isFinite(target) && now >= target);
  const remaining = Number.isFinite(target) && ready ? Math.max(0, target - now) : 0;
  const totalSeconds = Math.floor(remaining / 1_000);
  const finalMinute = !live && ready && totalSeconds > 0 && totalSeconds < 60;

  const seasonNumber = siteConfig.season.match(/\d+/)?.[0] ?? "";
  const xpProgress = live
    ? 1
    : ready && Number.isFinite(target)
      ? Math.max(0.06, Math.min(0.99, 1 - totalSeconds / XP_WINDOW_SECONDS))
      : 0.15;
  const filledSegments = live ? XP_SEGMENTS : Math.max(1, Math.round(xpProgress * XP_SEGMENTS));

  const splashes = [
    "Fresh world awaits!",
    "No whitelist — hop in!",
    `Java ${siteConfig.version} · ${siteConfig.software}`,
    "Grab the modpack on /join!",
    `${siteConfig.maxPlayers} slots · Claim your base!`,
    "Sharpening diamond pickaxes!",
  ];
  const splash = splashes[(ready ? Math.floor(second / 6) : 0) % splashes.length];

  const startLoop = useCallback(() => {
    setHasActiveConfetti(true);
    if (rafRef.current !== null) return;
    const tick = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) {
        if (particlesRef.current.length > 0) {
          rafRef.current = window.requestAnimationFrame(tick);
        } else {
          rafRef.current = null;
          setHasActiveConfetti(false);
        }
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const width = window.innerWidth;
      const height = window.innerHeight;
      if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const list = particlesRef.current;
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.life += 1;
        p.vy += 0.19;
        p.vx *= 0.988;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.spin;

        const alpha = p.life > p.maxLife - 28 ? Math.max(0, (p.maxLife - p.life) / 28) : 1;
        if (p.life >= p.maxLife || p.y > height + 40) {
          list.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;

        if (p.kind === "diamond") {
          const half = p.size * 0.65;
          ctx.beginPath();
          ctx.moveTo(0, -half);
          ctx.lineTo(half, 0);
          ctx.lineTo(0, half);
          ctx.lineTo(-half, 0);
          ctx.closePath();
          ctx.fill();
        } else if (p.kind === "spark") {
          const s = p.size * 0.42;
          ctx.fillRect(-s * 1.4, -s * 0.45, s * 2.8, s * 0.9);
          ctx.fillRect(-s * 0.45, -s * 1.4, s * 0.9, s * 2.8);
        } else {
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.82);
        }
        ctx.restore();
      }

      if (list.length > 0) {
        rafRef.current = window.requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, width, height);
        rafRef.current = null;
        setHasActiveConfetti(false);
      }
    };

    rafRef.current = window.requestAnimationFrame(tick);
  }, []);

  const launchConfetti = useCallback(
    (mode: "grand" | "pop" | "ambient", clientX?: number, clientY?: number) => {
      if (typeof window === "undefined") return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      const width = window.innerWidth;
      const height = window.innerHeight;
      const rect = cardRef.current?.getBoundingClientRect();
      const centerX = clientX ?? (rect ? rect.left + rect.width / 2 : width / 2);
      const centerY = clientY ?? (rect ? rect.top + rect.height / 2 : height * 0.48);

      if (mode === "ambient") {
        // Gentle alternating bursts around the countdown card while waiting
        if (particlesRef.current.length > 180) return;
        const step = ambientStep.current % 3;
        ambientStep.current += 1;
        const bx = rect
          ? step === 0
            ? rect.left + rect.width * 0.16
            : step === 1
              ? rect.left + rect.width * 0.84
              : rect.left + rect.width * 0.5
          : width * (0.25 + step * 0.25);
        const by = rect ? rect.top + rect.height * 0.35 : height * 0.42;
        spawnBurst(particlesRef.current, bx, by, 30, Math.PI * 1.15, 3.8, [3.5, 7.5]);
        setHasActiveConfetti(true);
        window.requestAnimationFrame(() => startLoop());
        return;
      }

      if (mode === "pop") {
        spawnBurst(particlesRef.current, centerX, centerY, 72, Math.PI * 1.35, 5.2);
        spawnBurst(
          particlesRef.current,
          rect ? rect.left + rect.width * 0.5 : centerX,
          rect ? Math.max(80, rect.top + 12) : height * 0.28,
          36,
          Math.PI * 1.2,
          2.2
        );
        setHasActiveConfetti(true);
        window.requestAnimationFrame(() => startLoop());
        return;
      }

      // Grand launch celebration when the countdown crosses 00:00:00
      spawnBurst(particlesRef.current, width * 0.14, height * 0.76, 65, Math.PI * 0.55, 7);
      spawnBurst(particlesRef.current, width * 0.86, height * 0.76, 65, Math.PI * 0.55, 7);
      spawnBurst(particlesRef.current, centerX, centerY, 70, Math.PI * 1.5, 5);
      setHasActiveConfetti(true);
      window.requestAnimationFrame(() => startLoop());

      const wave2 = window.setTimeout(() => {
        for (let i = 0; i < 6; i++) {
          spawnBurst(
            particlesRef.current,
            width * (0.1 + i * 0.16),
            height * 0.12,
            16,
            Math.PI * 0.9,
            -1
          );
        }
        startLoop();
      }, 420);

      const wave3 = window.setTimeout(() => {
        spawnBurst(particlesRef.current, width * 0.25, height * 0.42, 45, Math.PI * 1.2, 4);
        spawnBurst(particlesRef.current, width * 0.75, height * 0.42, 45, Math.PI * 1.2, 4);
        startLoop();
      }, 900);

      timersRef.current.push(wave2, wave3);
    },
    [startLoop]
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const id of timers) window.clearTimeout(id);
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Consistent ambient pops of confetti while the countdown is active.
  useEffect(() => {
    if (!ready || live || !active.enabled) return;
    sawPreLaunch.current = true;
    const initialTimer = window.setTimeout(() => {
      if (document.visibilityState === "visible") {
        launchConfetti("ambient");
      }
    }, 800);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        launchConfetti("ambient");
      }
    }, 3_400);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, [ready, live, active.enabled, launchConfetti]);

  // At launch moment, run auto-start and fire one final celebration burst if watched live.
  useEffect(() => {
    if (!ready || !live || !active.enabled) return;
    if (!attempted.current) {
      attempted.current = true;
      void runLaunch();
    }
    if (sawPreLaunch.current) {
      const key = `techsteal-launch-celebrated:${active.launchAt}`;
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        launchConfetti("grand");
      }
    }
  }, [ready, live, active.enabled, active.launchAt, runLaunch, launchConfetti]);

  const showCountdown = active.enabled && !live;

  if (!showCountdown && !hasActiveConfetti) return null;

  const values = [
    { label: "Days", value: Math.floor(totalSeconds / 86_400) },
    { label: "Hours", value: Math.floor((totalSeconds % 86_400) / 3_600) },
    { label: "Mins", value: Math.floor((totalSeconds % 3_600) / 60) },
    { label: "Secs", value: totalSeconds % 60 },
  ];

  const easternDate = formatLaunchEastern(active.launchAt, "short");
  const viewerZone = ready
    ? new Intl.DateTimeFormat("en-US", { timeZoneName: "short" })
        .formatToParts(new Date(active.launchAt))
        .find((p) => p.type === "timeZoneName")?.value
    : undefined;
  const showLocalToo =
    ready &&
    viewerZone &&
    viewerZone !== "EST" &&
    viewerZone !== "EDT";
  const localTime = showLocalToo
    ? new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(new Date(active.launchAt))
    : null;

  return (
    <>
      {ready && typeof document !== "undefined"
        ? createPortal(
            <canvas ref={canvasRef} className="launch-confetti-canvas" aria-hidden="true" />,
            document.body
          )
        : null}
      {showCountdown ? (
        <section
          ref={cardRef}
          className={`launch-countdown ${finalMinute ? "is-final-minute" : ""}`}
          aria-label={`${siteConfig.season} launch countdown`}
        >
          <div className="launch-countdown-head">
            <div className="launch-countdown-heading">
              <PixelDiamond />
              <span>{siteConfig.season} launches in</span>
            </div>
            <span className="launch-splash" aria-hidden="true">
              <PixelGrassBlock />
              <span>{splash}</span>
            </span>
          </div>

          <div className="launch-countdown-grid" role="timer" aria-live="off">
            {values.map((part) => (
              <button
                type="button"
                className="launch-time-block"
                key={part.label}
                onClick={(event) => launchConfetti("pop", event.clientX, event.clientY)}
                title="Click for confetti!"
                aria-label={`${ready ? part.value : 0} ${part.label}`}
              >
                <strong>{ready ? String(part.value).padStart(2, "0") : "--"}</strong>
                <span>{part.label}</span>
              </button>
            ))}
          </div>

          <div className="launch-xp-wrap" aria-hidden="true">
            <div className="launch-xp-level">LVL {seasonNumber || "UP"}</div>
            <div className="launch-xp-bar">
              {Array.from({ length: XP_SEGMENTS }, (_, index) => (
                <span
                  key={index}
                  className={`launch-xp-seg ${index < filledSegments ? "is-filled" : ""}`}
                />
              ))}
            </div>
          </div>

          <div className="launch-countdown-footer">
            <span className="launch-date-meta">
              <i className="fa-regular fa-calendar" aria-hidden="true" />
              <span>
                {easternDate}
                {localTime ? ` (${localTime} your time)` : ""}
              </span>
            </span>
            <div className="launch-footer-actions">
              {active.autoStart ? (
                <span className="launch-auto-note">
                  <i className="fa-solid fa-bolt" aria-hidden="true" /> Auto-opens server
                </span>
              ) : null}
              <button
                type="button"
                className="launch-party-btn"
                onClick={(event) => launchConfetti("pop", event.clientX, event.clientY)}
              >
                <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true" />
                <span>Pop confetti</span>
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
