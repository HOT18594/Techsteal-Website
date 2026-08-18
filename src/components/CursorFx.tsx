"use client";

import { useEffect } from "react";

/**
 * Custom glowing cursor (dependency-free).
 *
 * Two layers that chase the mouse with different lerp speeds:
 * - `.cursor-dot`  — small bright core, snaps closely,
 * - `.cursor-ring` — slightly larger trailing halo, floats behind.
 *
 * On hover over interactive elements (links, buttons, summaries) the ring
 * grows a little and brightens; while typing in an input/textarea the custom
 * cursor fades out so the native text caret takes over.
 *
 * Safety: the whole setup runs inside a try/catch — if anything fails, the
 * `custom-cursor` class is removed so the native cursor comes straight back.
 * Disabled entirely on touch devices and for reduced-motion users.
 */
export function CursorFx() {
  useEffect(() => {
    const doc = document.documentElement;
    try {
      if (typeof window === "undefined") return;
      if (!window.matchMedia("(pointer: fine)").matches) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      if (!document.body) return;

      doc.classList.add("custom-cursor");

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
        const interactive =
          !onText &&
          !!t?.closest("a, button, [role='button'], summary");
        doc.classList.toggle("cursor-on-text", onText);
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
        // Core snaps; ring trails — but both tight enough to stay useful
        // over fast-moving grids of tiles and links.
        dx += (mx - dx) * 0.6;
        dy += (my - dy) * 0.6;
        rx += (mx - rx) * 0.25;
        ry += (my - ry) * 0.25;
        dot.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
        ring.style.transform = `translate(${rx.toFixed(1)}px, ${ry.toFixed(1)}px)`;
        raf = requestAnimationFrame(loop);
      };

      window.addEventListener("mousemove", onMove, { passive: true });
      window.addEventListener("mousedown", onDown);
      window.addEventListener("mouseup", onUp);
      document.addEventListener("mouseleave", onLeave);
      raf = requestAnimationFrame(loop);

      return () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mousedown", onDown);
        window.removeEventListener("mouseup", onUp);
        document.removeEventListener("mouseleave", onLeave);
        doc.classList.remove("custom-cursor", "cursor-on-text");
        dot.remove();
        ring.remove();
      };
    } catch {
      // Whatever failed, never leave the site without a usable cursor.
      doc.classList.remove("custom-cursor");
      return;
    }
  }, []);

  return null;
}
