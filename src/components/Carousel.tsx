"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface CarouselProps {
  /** Slide content — one React node per slide. */
  slides: ReactNode[];
  /** Accessible label for the region. */
  label: string;
  /** Autoplay interval in ms. 0 disables autoplay. */
  interval?: number;
  className?: string;
  showArrows?: boolean;
  showDots?: boolean;
  /** Controlled index (optional) — pairs with onIndexChange. */
  index?: number;
  onIndexChange?: (i: number) => void;
}

/**
 * Cinematic crossfade carousel.
 *
 * All slides stack in one grid cell (container sizes to the tallest),
 * and the active one fades/slides in. Autoplays unless hovered, focused,
 * or the user prefers reduced motion. Supports arrow-key navigation and
 * a live progress line that shows the countdown to the next slide.
 */
export function Carousel({
  slides,
  label,
  interval = 6000,
  className = "",
  showArrows = true,
  showDots = true,
  index,
  onIndexChange,
}: CarouselProps) {
  const count = slides.length;
  const [internal, setInternal] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const current = index ?? internal;

  // Clamp when the slide list shrinks (e.g. filter changed).
  useEffect(() => {
    if (current >= count) go(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  const go = (i: number) => {
    const next = ((i % count) + count) % count;
    setInternal(next);
    onIndexChange?.(next);
  };

  useEffect(() => {
    if (interval <= 0 || reduced.current || paused || count < 2) return;
    const id = setInterval(() => go(current + 1), interval);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interval, paused, count, current]);

  if (count === 0) return null;

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      tabIndex={0}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          go(current + 1);
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          go(current - 1);
        }
      }}
      className={`relative outline-none ${className}`}
    >
      {/* Autoplay countdown line */}
      {interval > 0 && count > 1 && !paused ? (
        <div className="h-0.5 rounded-full bg-[var(--accent-dim)] overflow-hidden mb-6">
          <div
            key={current}
            className="h-full bg-gradient-to-r from-[var(--accent)] to-[var(--diamond)] carousel-progress"
            style={{ animationDuration: `${interval}ms` }}
          />
        </div>
      ) : null}

      {/* Stacked slides — container takes the tallest slide's height */}
      <div className="grid" style={{ gridTemplateAreas: '"stack"' }}>
        {slides.map((slide, i) => (
          <div
            key={i}
            aria-hidden={i !== current}
            className={`[grid-area:stack] transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              i === current
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-4 pointer-events-none"
            }`}
          >
            {slide}
          </div>
        ))}
      </div>

      {/* Side arrows */}
      {showArrows && count > 1 ? (
        <>
          <button
            className="carousel-btn prev"
            onClick={() => go(current - 1)}
            aria-label={`Previous ${label}`}
          >
            <i className="fa-solid fa-chevron-left" />
          </button>
          <button
            className="carousel-btn next"
            onClick={() => go(current + 1)}
            aria-label={`Next ${label}`}
          >
            <i className="fa-solid fa-chevron-right" />
          </button>
        </>
      ) : null}

      {/* Dots */}
      {showDots && count > 1 ? (
        <div className="flex items-center justify-center gap-2 mt-6">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => go(i)}
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === current}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === current
                  ? "w-8 bg-[var(--accent)] shadow-[0_0_10px_var(--accent-glow)]"
                  : "w-2 bg-[var(--border-strong)] hover:bg-[var(--accent-bright)]"
              }`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
