"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import { useRef, useState } from "react";
import { siteConfig } from "@/lib/site";
import { fallbackMembers, fallbackGallery, fallbackStatus } from "@/lib/fallback-data";
import type { GalleryItem, Member, ServerStatus } from "@/types";
import { MemberSlideshow } from "@/components/MemberSlideshow";
import { useToast } from "@/components/Toast";
import { useApi } from "@/lib/use-api";
import Link from "next/link";

export function HeroClient() {
  const { show } = useToast();
  // Live previews for the three feature tiles (console style — no slideshow).
  const { data: status } = useApi<ServerStatus>("/api/status", fallbackStatus);
  const { data: members } = useApi<Member[]>("/api/members", fallbackMembers);
  const { data: gallery } = useApi<GalleryItem[]>("/api/gallery", fallbackGallery);

  // "Copied!" flash handled in React state so BOTH copy buttons (the hero
  // kicker pill and the Copy IP button) get their own feedback, instead of
  // DOM surgery that always rewrote one button and raced its own timer.
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copyIP = async () => {
    try {
      await navigator.clipboard.writeText(siteConfig.address);
      show("Server address copied", siteConfig.address);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      setCopied(true);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      show("Couldn't copy address", siteConfig.address);
    }
  };

  return (
    <>
      {/* ============ HERO — cinematic, multi-layer ============ */}
      <section className="hero">
        {/* Layer 0: the image, parallaxed (moves slower than the page) */}
        <div className="hero-media" data-parallax="0.18" aria-hidden="true">
          <Image
            src="/techsteal-hero.jpeg"
            alt=""
            fill
            priority
            sizes="100vw"
            quality={85}
            className="object-cover"
          />
        </div>

        {/* Layer 1 — VERY slight dark tint so text sits on a stable base */}
        <div className="hero-tint" aria-hidden="true" />

        {/* Layer 2 — soft multi-layer blend that melts the image edges into the page bg */}
        <div className="hero-blend" aria-hidden="true" />

        {/* Layer 3 — content, drifting slightly faster for depth */}
        <div className="hero-content" data-parallax="-0.05">
          {/* IP — one pill, rises in after the title, click to copy */}
          <button
            className="hero-kicker hero-cta cursor-pointer"
            style={{ "--i": 0 } as CSSProperties}
            onClick={() => void copyIP()}
            title="Click to copy the server address"
            aria-label={`${siteConfig.address} — click to copy`}
          >
            <span className="hero-kicker-text">{siteConfig.address}</span>
            <span className="hero-kicker-copy" aria-hidden="true">
              <i className={copied ? "fa-solid fa-check" : "fa-regular fa-copy"} />
            </span>
          </button>

          {/* TECHSTEAL — letters fly in, then rest in the original style */}
          <h1 className="hero-title" aria-label={siteConfig.name}>
            {siteConfig.name.split("").map((ch, i) => (
              <span
                key={i}
                className="hero-letter"
                style={{ "--i": i } as CSSProperties}
                aria-hidden="true"
              >
                {ch}
              </span>
            ))}
          </h1>

          <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/join"
              className="btn-primary w-full sm:w-auto justify-center hero-cta"
              style={{ "--i": 0 } as CSSProperties}
            >
              <i className="fa-solid fa-compass" />
              <span>How to Join</span>
            </Link>
            <button
              className="btn-secondary w-full sm:w-auto justify-center hero-cta"
              onClick={() => void copyIP()}
              style={{ "--i": 1 } as CSSProperties}
            >
              {copied ? (
                <>
                  <i className="fa-solid fa-check" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-copy" />
                  <span>Copy IP</span>
                </>
              )}
            </button>
            <Link
              href="/status"
              className="btn-secondary w-full sm:w-auto justify-center hero-cta"
              style={{ "--i": 2 } as CSSProperties}
            >
              <i className="fa-solid fa-signal" />
              <span>Check Status</span>
            </Link>
          </div>
        </div>

        {/* Layer 4 — floating ember orbs (velocity drift) */}
        <i
          className="fa-solid fa-cube absolute left-[12%] top-[24%] text-[var(--accent)]/25 text-3xl"
          data-drift="6"
          aria-hidden="true"
        />
        <i
          className="fa-solid fa-sword absolute right-[14%] top-[30%] text-[var(--diamond)]/20 text-2xl rotate-12"
          data-drift="-8"
          aria-hidden="true"
        />
        <i
          className="fa-solid fa-diamond absolute right-[24%] bottom-[22%] text-[var(--accent-bright)]/20 text-xl"
          data-drift="5"
          aria-hidden="true"
        />

        {/* Scroll indicator — smooth-scrolls to the features below */}
        <a
          href="#features"
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 text-[var(--muted)] text-xs tracking-wider uppercase z-10 hover:text-[var(--accent-bright)] transition"
          aria-label="Scroll to features"
        >
          <span>Scroll</span>
          <i className="fa-solid fa-chevron-down animate-bounce text-[var(--accent)]" />
        </a>
      </section>

      {/* ============ FEATURE LINKS (clean, spacious) ============ */}
      <section id="features" className="pt-20 lg:pt-24 pb-10 lg:pb-12 px-6 lg:px-10">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
            {/* Status */}
            <Link href="/status" className="reveal group">
              <div className="tile card p-10 h-full flex flex-col items-center text-center">
                <div className="tile-icon w-16 h-16 rounded-2xl bg-[var(--accent-dim)] flex items-center justify-center mb-8 group-hover:bg-[var(--accent)] group-hover:text-white transition-colors">
                  <i className="fa-solid fa-signal text-2xl text-[var(--accent)] group-hover:text-white" />
                </div>
                <h3 className="font-display text-2xl font-bold">Status</h3>
                <span className="tile-arrow mt-6 text-[var(--accent)] text-sm font-semibold flex items-center gap-2">
                  Open <i className="fa-solid fa-arrow-right" />
                </span>
                <div className="mt-8 w-full">
                  {/* Live status preview (console style) */}
                  <div className="aspect-[4/3] w-full rounded-xl border border-[var(--border)] bg-[var(--bg-2)] p-4 flex flex-col items-center text-center overflow-hidden">
                    <div className={`status-pill ${status.online ? "" : "offline"}`}>
                      <span className={`pulse-dot ${status.online ? "" : "muted"}`} />
                      {status.online ? "Online" : "Offline"}
                    </div>
                    <div className="mt-auto">
                      <div className="font-display text-4xl font-bold leading-none text-[var(--fg)]">
                        {status.players ?? 0}
                        <span className="text-[var(--muted-2)] text-xl">
                          /{status.max ?? siteConfig.maxPlayers}
                        </span>
                      </div>
                      <div className="mt-1.5 text-xs text-[var(--muted)] uppercase tracking-wider">
                        players online
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Link>

            {/* Members */}
            <Link href="/members" className="reveal reveal-delay-1 group">
              <div className="tile card p-10 h-full flex flex-col items-center text-center">
                <div className="tile-icon w-16 h-16 rounded-2xl bg-[var(--accent-dim)] flex items-center justify-center mb-8 group-hover:bg-[var(--accent)] group-hover:text-white transition-colors">
                  <i className="fa-solid fa-users text-2xl text-[var(--accent)] group-hover:text-white" />
                </div>
                <h3 className="font-display text-2xl font-bold">Members</h3>
                <span className="tile-arrow mt-6 text-[var(--accent)] text-sm font-semibold flex items-center gap-2">
                  Open <i className="fa-solid fa-arrow-right" />
                </span>
                <div className="mt-8 w-full">
                  {/* Live members preview — passive slideshow of members
                      who've linked a Minecraft account (name + PFP). */}
                  <MemberSlideshow members={members} />
                </div>
              </div>
            </Link>

            {/* Gallery */}
            <Link href="/gallery" className="reveal reveal-delay-2 group">
              <div className="tile card p-10 h-full flex flex-col items-center text-center">
                <div className="tile-icon w-16 h-16 rounded-2xl bg-[var(--accent-dim)] flex items-center justify-center mb-8 group-hover:bg-[var(--accent)] group-hover:text-white transition-colors">
                  <i className="fa-solid fa-images text-2xl text-[var(--accent)] group-hover:text-white" />
                </div>
                <h3 className="font-display text-2xl font-bold">Gallery</h3>
                <span className="tile-arrow mt-6 text-[var(--accent)] text-sm font-semibold flex items-center gap-2">
                  Open <i className="fa-solid fa-arrow-right" />
                </span>
                <div className="mt-8 w-full">
                  {/* Live gallery preview (console style) */}
                  {gallery.length === 0 ? (
                    <div className="asset-placeholder aspect-[4/3] rounded-xl w-full">
                      <div className="asset-placeholder-content">
                        <i className="fa-solid fa-cube asset-placeholder-icon" />
                        <span className="asset-placeholder-hint">No builds yet</span>
                      </div>
                    </div>
                  ) : (
                    <div className="aspect-[4/3] w-full rounded-xl border border-[var(--border)] bg-[var(--bg-2)] p-1.5 grid grid-cols-3 gap-1.5 overflow-hidden">
                      {gallery.slice(0, 3).map((g) => (
                        <div
                          key={g.id ?? g.title}
                          className="relative rounded-lg overflow-hidden border border-[var(--border)]"
                        >
                          <img
                            src={g.image}
                            alt={g.title}
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-[rgba(5,7,15,0.85)] via-transparent to-transparent" />
                          <span className="absolute bottom-1.5 left-1.5 right-1.5 text-[10px] font-bold text-white truncate">
                            {g.title}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* ============ QUICK LINKS ============ */}
      <section className="pt-10 lg:pt-12 pb-16 lg:pb-20 px-6 lg:px-10">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <Link href="/assistant" className="reveal group">
              <div className="tile card p-8 text-center">
                <i className="tile-icon fa-solid fa-robot text-2xl text-[var(--accent)] mb-3 group-hover:text-[var(--accent-bright)] transition-colors" />
                <h3 className="font-display text-lg font-bold">Assistant</h3>
              </div>
            </Link>
            <Link href="/forum" className="reveal reveal-delay-1 group">
              <div className="tile card p-8 text-center">
                <i className="tile-icon fa-solid fa-comments text-2xl text-[var(--accent)] mb-3 group-hover:text-[var(--accent-bright)] transition-colors" />
                <h3 className="font-display text-lg font-bold">Forum</h3>
              </div>
            </Link>
            <Link href="/history" className="reveal reveal-delay-2 group">
              <div className="tile card p-8 text-center">
                <i className="tile-icon fa-solid fa-clock-rotate-left text-2xl text-[var(--accent)] mb-3 group-hover:text-[var(--accent-bright)] transition-colors" />
                <h3 className="font-display text-lg font-bold">History</h3>
              </div>
            </Link>
            <Link href="/rules" className="reveal reveal-delay-3 group">
              <div className="tile card p-8 text-center">
                <i className="tile-icon fa-solid fa-gavel text-2xl text-[var(--accent)] mb-3 group-hover:text-[var(--accent-bright)] transition-colors" />
                <h3 className="font-display text-lg font-bold">Rules</h3>
              </div>
            </Link>
            <Link href="/status" className="reveal reveal-delay-4 group">
              <div className="tile card p-8 text-center">
                <i className="tile-icon fa-solid fa-signal text-2xl text-[var(--accent)] mb-3 group-hover:text-[var(--accent-bright)] transition-colors" />
                <h3 className="font-display text-lg font-bold">Status</h3>
              </div>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
