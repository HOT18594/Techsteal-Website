"use client";

import { useEffect } from "react";

/**
 * Custom glowing cursor (dependency-free).
 *
 * Two layers that chase the mouse with different lerp speeds:
 * - `.cursor-dot`  — small bright core, snaps closely,
 * - `.cursor-ring` — slightly larger trailing halo, floats behind.
 *
 * IMPORTANT: position AND scale are written together in a single
 * `transform` every frame from the rAF loop. Never move scale/opacity
 * via CSS transitions on these elements — a transitioned `scale`
 * property racing the per-frame `transform` makes the cursor glitch
 * and flicker over hover targets (tiles, links, buttons).
 *
 * On hover over interactive elements (links, buttons, summaries) the ring
 * eases larger and brightens; while typing in an input/textarea the custom
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
      let ringScale = 1;
      let shown = false;
      let hovering = false;
      let pressed = false;
      let onText = false;
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
        // e.target can be a text node or SVG child in some browsers — only
        // run closest() on real Elements, otherwise the handler throws and
        // the hover states silently break.
        const t = e.target instanceof Element ? e.target : null;
        onText = !!t?.closest("input, textarea, select, [contenteditable]");
        hovering = !onText && !!t?.closest("a, button, [role='button'], summary");
        doc.classList.toggle("cursor-on-text", onText);
        ring.classList.toggle("cursor-hover", hovering);
        dot.classList.toggle("cursor-hover", hovering);
      };

      const onDown = () => {
        pressed = true;
      };
      const onUp = () => {
        pressed = false;
      };
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
        rx += (mx - rx) * 0.28;
        ry += (my - ry) * 0.28;

        // Ease the ring scale toward its target (hover/press states) —
        // scale lives in the same transform, so nothing can desync.
        const ringTarget = hovering ? (pressed ? 0.95 : 1.3) : pressed ? 0.8 : 1;
        ringScale += (ringTarget - ringScale) * 0.18;
        const dotScale = hovering ? 0.85 : 1;

        dot.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${dotScale})`;
        ring.style.transform = `translate(${rx.toFixed(1)}px, ${ry.toFixed(1)}px) scale(${ringScale.toFixed(3)})`;
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
