"use client";

import { useEffect, useState } from "react";

export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 500);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      onClick={() =>
        window.scrollTo({
          top: 0,
          // Respect prefers-reduced-motion — the CSS override can't reach
          // scrollTo options.
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
        })
      }
      aria-label="Back to top"
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      className={`fixed bottom-6 right-6 w-12 h-12 bg-[var(--card)] border border-[var(--border-strong)] text-[var(--accent)] flex items-center justify-center rounded-xl transition-all hover:bg-[var(--accent)] hover:text-white hover:border-[var(--accent)] z-40 shadow-lg ${
        visible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      }`}
    >
      <i className="fa-solid fa-arrow-up" />
    </button>
  );
}