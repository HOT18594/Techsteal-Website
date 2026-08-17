"use client";

// Full-screen ambient particle field (gold + diamond pixels floating upward).
// Ported from the original single-file build into a reusable component.

import { useEffect, useRef } from "react";

interface ParticleState {
  x: number;
  y: number;
  size: number;
  speedY: number;
  speedX: number;
  baseOpacity: number;
  opacity: number;
  flicker: number;
  color: "gold" | "diamond";
}

export function Particles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const make = (): ParticleState => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() * 2 + 0.5,
      speedY: -(Math.random() * 0.3 + 0.1),
      speedX: (Math.random() - 0.5) * 0.15,
      baseOpacity: Math.random() * 0.4 + 0.1,
      opacity: Math.random() * 0.4 + 0.1,
      flicker: Math.random() * 0.015 + 0.005,
      color: Math.random() > 0.7 ? "diamond" : "gold",
    });

    const particles = Array.from({ length: 70 }, make);

    const frame = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.y += p.speedY;
        p.x += p.speedX;
        p.opacity += (Math.random() - 0.5) * p.flicker;
        p.opacity = Math.max(0.05, Math.min(p.baseOpacity * 1.5, p.opacity));

        if (p.y < -10) {
          const fresh = make();
          fresh.y = canvas.height + 10;
          Object.assign(p, fresh);
        }
        if (p.x < -10) p.x = canvas.width;
        if (p.x > canvas.width + 10) p.x = 0;

        ctx.fillStyle =
          p.color === "diamond"
            ? `rgba(109, 213, 247, ${p.opacity})`
            : `rgba(244, 185, 66, ${p.opacity})`;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
      rafId = requestAnimationFrame(frame);
    };
    frame();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas id="particles" ref={canvasRef} aria-hidden="true" />;
}
