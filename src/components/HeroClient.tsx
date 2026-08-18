"use client";

import { siteConfig } from "@/lib/site";
import Link from "next/link";

export function HeroClient() {
  return (
    <>
      {/* ============ HERO — full-bleed background + overlay ============ */}
      <section className="relative min-h-screen overflow-hidden">
        {/* Full-bleed background placeholder (swap for real image/video later) */}
        <div className="hero-placeholder asset-placeholder" aria-hidden="true">
          <div className="asset-placeholder-content">
            <i className="fa-solid fa-image asset-placeholder-icon" />
            <span className="asset-placeholder-text">Hero Image / Video</span>
            <span className="asset-placeholder-hint">Full-screen asset goes here</span>
          </div>
        </div>

        {/* Scrim so the wordmark + buttons always read clearly over any asset */}
        <div
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(6,10,20,0.55)_100%)]"
          aria-hidden="true"
        />

        {/* Content layered on top */}
        <div className="relative z-10 min-h-screen flex flex-col items-center justify-center text-center px-6">
          <p className="font-display text-lg tracking-[0.4em] uppercase text-[var(--accent)] mb-6">
            {siteConfig.address}
          </p>
          <h1 className="font-display text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-bold tracking-tight text-[var(--fg)] leading-none">
            {siteConfig.name}
          </h1>

          <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button className="btn-primary w-full sm:w-auto" id="hero-copy-ip" onClick={copyIP}>
              <i className="fa-solid fa-play" />
              <span>Join Server</span>
            </button>
            <Link href="/status" className="btn-secondary w-full sm:w-auto justify-center">
              <i className="fa-solid fa-signal" />
              <span>Check Status</span>
            </Link>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 text-[var(--muted)] text-xs tracking-wider uppercase z-10">
          <span>Scroll</span>
          <i className="fa-solid fa-chevron-down animate-bounce text-[var(--accent)]" />
        </div>
      </section>

      {/* ============ FEATURE LINKS (clean, spacious) ============ */}
      <section className="py-24 lg:py-32 px-6 lg:px-10">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
            {/* Status */}
            <Link href="/status" className="reveal group">
              <div className="card p-10 h-full flex flex-col items-center text-center transition-all duration-300 group-hover:border-[var(--accent)] group-hover:shadow-[0_0_30px_var(--accent-glow)]">
                <div className="w-16 h-16 rounded-2xl bg-[var(--accent-dim)] flex items-center justify-center mb-8 group-hover:bg-[var(--accent)] group-hover:text-white transition-colors">
                  <i className="fa-solid fa-signal text-2xl text-[var(--accent)] group-hover:text-white" />
                </div>
                <h3 className="font-display text-2xl font-bold">Status</h3>
                <div className="mt-8 w-full">
                  <div className="asset-placeholder aspect-[4/3] rounded-xl w-full">
                    <div className="asset-placeholder-content">
                      <i className="fa-solid fa-chart-line asset-placeholder-icon" />
                      <span className="asset-placeholder-hint">Screenshot</span>
                    </div>
                  </div>
                </div>
              </div>
            </Link>

            {/* Members */}
            <Link href="/members" className="reveal reveal-delay-1 group">
              <div className="card p-10 h-full flex flex-col items-center text-center transition-all duration-300 group-hover:border-[var(--accent)] group-hover:shadow-[0_0_30px_var(--accent-glow)]">
                <div className="w-16 h-16 rounded-2xl bg-[var(--accent-dim)] flex items-center justify-center mb-8 group-hover:bg-[var(--accent)] group-hover:text-white transition-colors">
                  <i className="fa-solid fa-users text-2xl text-[var(--accent)] group-hover:text-white" />
                </div>
                <h3 className="font-display text-2xl font-bold">Members</h3>
                <div className="mt-8 w-full">
                  <div className="asset-placeholder aspect-[4/3] rounded-xl w-full">
                    <div className="asset-placeholder-content">
                      <i className="fa-solid fa-user-group asset-placeholder-icon" />
                      <span className="asset-placeholder-hint">Photo</span>
                    </div>
                  </div>
                </div>
              </div>
            </Link>

            {/* Gallery */}
            <Link href="/gallery" className="reveal reveal-delay-2 group">
              <div className="card p-10 h-full flex flex-col items-center text-center transition-all duration-300 group-hover:border-[var(--accent)] group-hover:shadow-[0_0_30px_var(--accent-glow)]">
                <div className="w-16 h-16 rounded-2xl bg-[var(--accent-dim)] flex items-center justify-center mb-8 group-hover:bg-[var(--accent)] group-hover:text-white transition-colors">
                  <i className="fa-solid fa-images text-2xl text-[var(--accent)] group-hover:text-white" />
                </div>
                <h3 className="font-display text-2xl font-bold">Gallery</h3>
                <div className="mt-8 w-full">
                  <div className="asset-placeholder aspect-[4/3] rounded-xl w-full">
                    <div className="asset-placeholder-content">
                      <i className="fa-solid fa-cube asset-placeholder-icon" />
                      <span className="asset-placeholder-hint">Builds</span>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* ============ QUICK LINKS ============ */}
      <section className="py-16 lg:py-20 px-6 lg:px-10">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <Link href="/assistant" className="reveal card p-8 text-center group hover:border-[var(--accent)] transition-all">
              <i className="fa-solid fa-robot text-2xl text-[var(--accent)] mb-3 group-hover:text-[var(--accent-bright)] transition-colors" />
              <h3 className="font-display text-lg font-bold">Assistant</h3>
            </Link>
            <Link href="/forum" className="reveal reveal-delay-1 card p-8 text-center group hover:border-[var(--accent)] transition-all">
              <i className="fa-solid fa-comments text-2xl text-[var(--accent)] mb-3 group-hover:text-[var(--accent-bright)] transition-colors" />
              <h3 className="font-display text-lg font-bold">Forum</h3>
            </Link>
            <Link href="/history" className="reveal reveal-delay-2 card p-8 text-center group hover:border-[var(--accent)] transition-all">
              <i className="fa-solid fa-clock-rotate-left text-2xl text-[var(--accent)] mb-3 group-hover:text-[var(--accent-bright)] transition-colors" />
              <h3 className="font-display text-lg font-bold">History</h3>
            </Link>
            <Link href="/rules" className="reveal reveal-delay-3 card p-8 text-center group hover:border-[var(--accent)] transition-all">
              <i className="fa-solid fa-gavel text-2xl text-[var(--accent)] mb-3 group-hover:text-[var(--accent-bright)] transition-colors" />
              <h3 className="font-display text-lg font-bold">Rules</h3>
            </Link>
            <Link href="/status" className="reveal reveal-delay-4 card p-8 text-center group hover:border-[var(--accent)] transition-all">
              <i className="fa-solid fa-signal text-2xl text-[var(--accent)] mb-3 group-hover:text-[var(--accent-bright)] transition-colors" />
              <h3 className="font-display text-lg font-bold">Status</h3>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function copyIP() {
  const address = "play.techsteal.space";
  try {
    navigator.clipboard.writeText(address);
    const btn = document.getElementById("hero-copy-ip");
    if (btn) {
      const original = btn.innerHTML;
      btn.innerHTML = '<i class="fa-solid fa-check"></i><span>Copied!</span>';
      setTimeout(() => (btn.innerHTML = original), 2000);
    }
  } catch {}
}