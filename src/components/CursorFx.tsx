"use client";

import { useEffect } from "react";

/**
 * Custom glowing cursor (dependency-free).
 *
 * Two layers that chase the mouse with different lerp speeds:
 * - `.cursor-dot`  — small bright core, snaps closely,
 * - `.cursor-ring` — larger trailing halo, floats lazily behind.
 *
 * On hover over interactive elements (links, buttons, tiles, chips) the ring
 * grows and fills with an accent glow; while typing in an input/textarea the
 * custom cursor fades out so the native text caret takes over.
 *
 * Disabled entirely on touch devices and for reduced-motion users.
 */
export function CursorFx() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    document.documentElement.classList.add("custom-cursor");

    const dot = document.createElement("div");
    dot.className = "cursor-dot";
    const ring = document.createElement("div");
    ring.className = "cursor-ring";
    document.body.append(dot, ring);

    let mx = -100, my = -100;
    let dx = -100, dy = -100;
    let rx = -100, ry = -100;
    let shown = false;
    let raf = 0;

    const onMove = (e: MouseEvent) => {
      mx = e.clientX;
      my = e.clientY;
      if (!shown) {
        shown = true;
        dot.classList.add("cursor-visible");
        ring.classList.add("cursor-visible");
        dx = rx = mx;
        dy = ry = my;
      }
      const t = e.target as HTMLElement | null;
      const onText = !!t?.closest("input, textarea, select, [contenteditable]");
      const interactive = !onText && !!t?.closest("a, button, [role='button'], summary, .tile, .prompt-chip, .tag");
      document.documentElement.classList.toggle("cursor-on-text", onText);
      ring.classList.toggle("cursor-hover", interactive);
      dot.classList.toggle("cursor-hover", interactive);
    };

    const onDown = () => ring.classList.add("cursor-pressed");
    const onUp = () => ring.classList.remove("cursor-pressed");
    const onLeave = () => {
      shown = false;
      dot.classList.remove("cursor-visible");
      ring.classList.remove("cursor-visible");
    };

    const loop = () => {
      // Core snaps; ring trails — classic two-speed chase.
      dx += (mx - dx) * 0.55;
      dy += (my - dy) * 0.55;
      rx += (mx - rx) * 0.16;
      ry += (my - ry) * 0.16;
      dot.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
      ring.style.transform = `translate(${rx.toFixed(1)}px, ${ry.toFixed(1)}px)`;
      raf = requestAnimationFrame(loop);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    document.documentElement.addEventListener("mouseleave", onLeave);
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      document.documentElement.classList.remove("custom-cursor", "cursor-on-text");
      dot.remove();
      ring.remove();
    };
  }, []);

  return null;
}
