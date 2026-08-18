"use client";

import { useEffect } from "react";

/**
 * Cinematic scroll engine (dependency-free).
 *
 * Runs a requestAnimationFrame loop that:
 * - exposes `--scroll-y` / `--scroll-v` CSS variables (velocity-aware),
 * - drives the top scroll-progress bar,
 * - toggles `.scrolled` on <body> (navbar glow),
 * - applies multi-layer parallax to every `[data-parallax]` element
 *   (positive speed = moves slower than the page, negative = faster),
 * - applies a slight velocity "drift" to `[data-drift]` elements.
 *
 * It also intercepts the mouse wheel and eases the page toward the target
 * with a damped lerp — the "controlled scroll speed". Instead of the page
 * snapping to the wheel's exact position, it glides up to ~6 frames behind,
 * which gives scrolling a slow, floaty, cinematic feel. The wheel amount is
 * capped and slightly damped so a fast flick never rockets the page.
 *
 * Deliberately left untouched:
 * - ctrl/cmd+wheel (browser zoom),
 * - wheel events inside elements that scroll themselves (e.g. nav popover),
 * - keyboard / scrollbar / touch / anchor-link scrolling (they snap the
 *   glide target so we never fight the user),
 * - anything when the user prefers reduced motion (disables itself entirely).
 */
export function ScrollFx() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const doc = document.documentElement;
    const progress = document.createElement("div");
    progress.id = "scroll-progress";
    document.body.prepend(progress);

    let y = window.scrollY;
    let prev = y;
    let raf = 0;
    const targets = new Set<HTMLElement>();

    // ---- cinematic eased scrolling ---------------------------------------
    const WHEEL_SPEED = 0.92; // slight dampening — heavier, floatier feel
    const WHEEL_CAP = 150; // max px a single wheel tick may add
    const EASE = 0.13; // lerp per frame — lower = silkier glide
    const SNAP_EPS = 1.5; // px tolerance for scrollTo rounding

    let gliding = false;
    let targetY = window.scrollY;
    let glideY = targetY;
    let lastSetY = targetY;

    const maxScroll = () => Math.max(0, doc.scrollHeight - window.innerHeight);

    const onWheel = (e: WheelEvent) => {
      // Ctrl/cmd+wheel is browser zoom — never touch it.
      if (e.ctrlKey || e.metaKey) return;
      // Inner scrollers (popovers, scrollable lists) keep native wheel.
      let el = e.target instanceof Element ? e.target : null;
      while (el && el !== document.body) {
        const s = getComputedStyle(el).overflowY;
        if ((s === "auto" || s === "scroll") && el.scrollHeight > el.clientHeight + 2)
          return;
        el = el.parentElement;
      }
      if (maxScroll() <= 0) return;

      e.preventDefault();
      const raw =
        e.deltaMode === 1
          ? e.deltaY * 16
          : e.deltaMode === 2
            ? e.deltaY * window.innerHeight
            : e.deltaY;
      const delta = Math.max(-WHEEL_CAP, Math.min(WHEEL_CAP, raw * WHEEL_SPEED));
      targetY = Math.max(0, Math.min(maxScroll(), targetY + delta));
      if (!gliding) {
        gliding = true;
        glideY = window.scrollY;
        doc.style.scrollBehavior = "auto"; // the lerp owns the easing now
      }
    };

    const onScroll = () => {
      // Native scroll (keyboard, scrollbar drag, anchor jump) wins: snap the
      // glide target so we never fight the user.
      if (Math.abs(window.scrollY - lastSetY) > SNAP_EPS) {
        targetY = window.scrollY;
        glideY = targetY;
        gliding = false;
        doc.style.scrollBehavior = "";
      }
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("scroll", onScroll, { passive: true });

    const collect = () => {
      document
        .querySelectorAll<HTMLElement>("[data-parallax], [data-drift]")
        .forEach((el) => targets.add(el));
    };

    const onFrame = () => {
      // Ease the glide toward the wheel's target.
      if (gliding) {
        glideY += (targetY - glideY) * EASE;
        if (Math.abs(targetY - glideY) < 0.5) {
          glideY = targetY;
          gliding = false;
          doc.style.scrollBehavior = "";
        }
        window.scrollTo(0, glideY);
        lastSetY = glideY;
      }

      y = window.scrollY;
      const vel = y - prev;
      prev = y;

      // Velocity in "frames of direction" — clamped so it stays subtle.
      const v = Math.max(-6, Math.min(6, vel / 14));
      doc.style.setProperty("--scroll-y", `${y}px`);
      doc.style.setProperty("--scroll-v", v.toFixed(3));

      // Scroll progress bar
      const h = doc.scrollHeight - window.innerHeight;
      const p = h > 0 ? Math.min(100, (y / h) * 100) : 0;
      progress.style.width = `${p.toFixed(2)}%`;

      // Navbar elevation state
      document.body.classList.toggle("scrolled", y > 24);

      for (const el of targets) {
        const speed = Number(el.dataset.parallax || 0);
        if (speed !== 0) {
          // Multi-layer parallax: each layer translates at its own rate.
          el.style.transform = `translate3d(0, ${(-y * speed).toFixed(2)}px, 0)`;
          continue;
        }
        // Velocity drift for floating decorations
        const drift = Number(el.dataset.drift || 0);
        if (drift !== 0) {
          el.style.transform = `translate3d(0, ${(-v * drift).toFixed(2)}px, 0)`;
        }
      }

      raf = requestAnimationFrame(onFrame);
    };

    raf = requestAnimationFrame(onFrame);
    collect();

    // Catch parallax/decoration elements mounted later (e.g. after hydration).
    let mo: MutationObserver | null = null;
    if (typeof MutationObserver !== "undefined") {
      mo = new MutationObserver(() => collect());
      mo.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      cancelAnimationFrame(raf);
      mo?.disconnect();
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("scroll", onScroll);
      progress.remove();
      document.body.classList.remove("scrolled");
      doc.style.removeProperty("--scroll-y");
      doc.style.removeProperty("--scroll-v");
      doc.style.scrollBehavior = "";
      document
        .querySelectorAll<HTMLElement>("[data-parallax], [data-drift]")
        .forEach((el) => el.style.removeProperty("transform"));
    };
  }, []);

  return null;
}
