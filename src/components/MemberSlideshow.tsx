"use client";

// Passive auto-advancing slideshow for the Members home tile.
//
// Cycles through every member who has a renderable identity (a Discord PFP
// or a Minecraft skin head). Each slide shows their avatar + name + a small
// "MC · <username>" line when they've linked a Minecraft account. It
// advances on its own every ~2.6s with a crossfade; pauses on hover/focus
// and when the tile is off-screen so it never burns CPU you can't see.

import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import type { Member } from "@/types";

const SLIDE_MS = 2600;

export function MemberSlideshow({ members }: { members: Member[] }) {
  // Only members who've linked a Minecraft account — that's who the tile is
  // about ("users who have added their MC accounts"). Their PFP is the
  // Minecraft skin head the API resolved for their MC username.
  const slides = members.filter((m) => Boolean(m.minecraftUsername));
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  // Hover and dot-click pauses are independent signals combined below.
  // Sharing one `paused` boolean made onMouseLeave cancel a dot-click's
  // 6s pause instantly (and focus churn restart rotation mid-hover).
  const [hovering, setHovering] = useState(false);
  const [dotHold, setDotHold] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  // Dot clicks pause rotation; touch taps never fire mouseleave, so the
  // pause must self-expire instead of waiting for a hover that won't come.
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pauseTemporarily = () => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    setDotHold(true);
    resumeTimer.current = setTimeout(() => setDotHold(false), 6_000);
  };

  useEffect(() => {
    return () => {
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    };
  }, []);

  // Start/stop the whole thing based on whether the tile is on screen.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.25 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Advance on an interval; only while visible, not paused, >1 slide, and
  // NOT under prefers-reduced-motion (static first member instead).
  useEffect(() => {
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    if (!visible || hovering || dotHold || slides.length <= 1) return;
    timer.current = setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, SLIDE_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [visible, hovering, dotHold, slides.length]);

  // Clamp the index if the slide list shrinks (e.g. after a refetch) so we
  // never point past the end.
  useEffect(() => {
    if (index > slides.length - 1) setIndex(0);
  }, [slides.length, index]);

  if (slides.length === 0) {
    return (
      <div className="asset-placeholder aspect-[4/3] rounded-xl w-full">
        <div className="asset-placeholder-content">
          <i className="fa-solid fa-user-group asset-placeholder-icon" />
          <span className="asset-placeholder-hint">No members yet</span>
        </div>
      </div>
    );
  }

  // Clamp at render time, not just in an effect: if `slides` shrinks (refetch)
  // the pre-effect render must not read `slides[index]` out of bounds. The
  // effect below only keeps the dot indicator in sync.
  const safeIndex = Math.min(index, slides.length - 1);
  const current = slides[safeIndex];

  return (
    <div
      ref={rootRef}
      className="aspect-[4/3] w-full rounded-xl border border-[var(--border)] bg-[var(--bg-2)] overflow-hidden relative"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocusCapture={() => setHovering(true)}
      onBlurCapture={() => setHovering(false)}
      aria-roledescription="carousel"
      aria-label="Members preview"
    >
      {/* Stacked crossfading slides — keyed so each new member replays the
          fade+rise entrance. Only the active one is rendered. */}
      <div
        key={`av-${current.id ?? current.name}`}
        className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-5 text-center member-slide"
      >
        <Avatar
          name={current.name}
          src={current.avatarUrl}
          size="lg"
          color={current.color}
          className="member-slide-avatar"
        />
        <div className="min-w-0 w-full">
          <div className="text-sm font-display font-bold leading-snug break-words">
            {current.name}
          </div>
          <div className="text-xs text-[var(--muted)] leading-snug break-words mt-0.5">
            {current.minecraftUsername ? (
              <>
                MC · <span className="text-[var(--fg-2)]">{current.minecraftUsername}</span>
              </>
            ) : (
              current.role
            )}
          </div>
        </div>
      </div>

      {/* Slide dots — clickable: jump to a member and pause the rotation */}
      {slides.length > 1 ? (
        <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
          {slides.map((s, i) => (
            <button
              key={s.id ?? s.name}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === safeIndex ? "w-4 bg-[var(--accent)]" : "w-1.5 bg-[var(--muted-2)]/60 hover:bg-[var(--muted-2)]"
              }`}
              onClick={(e) => {
                // The home tile wraps this whole slideshow in a <Link
                // href="/members">, so a bare dot click bubbled up and
                // navigated away — you could never actually pick a member.
                e.preventDefault();
                e.stopPropagation();
                setIndex(i);
                pauseTemporarily();
              }}
              aria-label={`Show ${s.name}`}
              aria-current={i === safeIndex}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
