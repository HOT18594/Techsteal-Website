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
    // loaded through the API).
    let mo: MutationObserver | null = null;
    if (typeof MutationObserver !== "undefined") {
      mo = new MutationObserver(() => observeAll());
      mo.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      io.disconnect();
      mo?.disconnect();
    };
  }, []);

  return null;
}