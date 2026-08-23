"use client";

import { useEffect } from "react";

// Global reveal-on-scroll observer.
// Watches every `.reveal` element and every `.stagger` list container
// (including ones mounted later) and adds `.visible` when it enters the
// viewport — the same behavior the original single-file site had, applied
// site-wide so pre-built markup that uses bare `.reveal` classes (like the
// Home hero and feature cards) animates in too.
export function RevealObserver() {
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      document
        .querySelectorAll(".reveal, .stagger")
        .forEach((el) => el.classList.add("visible"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.1 }
    );

    const observeAll = () => {
      document
        .querySelectorAll(".reveal:not(.visible), .stagger:not(.visible)")
        .forEach((el) => io.observe(el));
    };

    observeAll();

    // Catch any `.reveal` elements mounted after hydration (e.g. content
    // loaded through the API). Mutations arrive in bursts (streaming chat,
    // list refetches) — coalesce them into one querySelectorAll per frame
    // instead of scanning the whole document per mutation.
    let mo: MutationObserver | null = null;
    let scheduled = 0;
    if (typeof MutationObserver !== "undefined") {
      const queueObserveAll = () => {
        if (scheduled !== 0) return;
        scheduled = requestAnimationFrame(() => {
          scheduled = 0;
          observeAll();
        });
      };
      mo = new MutationObserver(queueObserveAll);
      mo.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      io.disconnect();
      mo?.disconnect();
      if (scheduled !== 0) cancelAnimationFrame(scheduled);
    };
  }, []);

  return null;
}