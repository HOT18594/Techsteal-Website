"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import { SubPage } from "@/components/SubPage";
import { EmptyState, ErrorState } from "@/components/EmptyState";
import { fallbackRules } from "@/lib/fallback-data";
import type { RuleSection } from "@/types";
import { useApi } from "@/lib/use-api";

/** Party burst: launches a shower of 🎉🎊🔥✨💥 from a point on screen. */
function emojiBurst(x: number, y: number, count: number) {
  // Respect reduced motion — the CSS neutralizes the animation, but don't
  // even build the DOM nodes.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const EMOJIS = ["🎉", "🎊", "🔥", "✨", "💥"];
  const wrap = document.createElement("div");
  wrap.className = "confetti-wrap";
  wrap.style.left = `${x}px`;
  wrap.style.top = `${y}px`;
  document.body.appendChild(wrap);

  for (let i = 0; i < count; i++) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.textContent = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
    const angle = Math.random() * Math.PI * 2;
    const speed = 8 + Math.random() * 9;
    piece.style.setProperty("--vx", (Math.cos(angle) * speed).toFixed(2));
    piece.style.setProperty("--vy", (Math.sin(angle) * speed - 6.5).toFixed(2));
    piece.style.setProperty("--rot", `${(Math.random() - 0.5) * 1080}deg`);
    piece.style.fontSize = `${1.3 + Math.random() * 1.5}rem`;
    piece.style.animationDelay = `${(Math.random() * 0.08).toFixed(2)}s`;
    wrap.appendChild(piece);
  }

  window.setTimeout(() => wrap.remove(), 1800);
}

export default function RulesPage() {
  const { show } = useToast();
  const { data: sections, loading, error, refetch } = useApi<RuleSection[]>("/api/rules", fallbackRules);
  const [acknowledged, setAcknowledged] = useState(false);
  const ackRef = useRef<HTMLButtonElement>(null);

  const totalRules = sections.reduce((n, s) => n + (s.rules?.length ?? 0), 0);

  // Persist the acknowledgment (per browser) so the button doesn't reset
  // and re-fire the confetti on every visit. Read after mount to avoid a
  // hydration mismatch.
  useEffect(() => {
    try {
      if (localStorage.getItem("techsteal-rules-ack") === "1") {
        setAcknowledged(true);
      }
    } catch {}
  }, []);

  const acknowledge = () => {
    if (acknowledged) return;
    setAcknowledged(true);
    try {
      localStorage.setItem("techsteal-rules-ack", "1");
    } catch {}
    show("Rules acknowledged", "Thanks — welcome aboard. 🔥");
    const btn = ackRef.current?.getBoundingClientRect();
    if (btn) {
      const cx = btn.left + btn.width / 2;
      const cy = btn.top + btn.height / 2;
      emojiBurst(cx, cy, 28);
      window.setTimeout(() => emojiBurst(cx, cy, 18), 160);
      window.setTimeout(() => emojiBurst(cx, cy, 12), 340);
    }
  };

  return (
    <SubPage className="max-w-3xl">
      <div className="w-full">
        {/* Header */}
        <div className="page-header mb-8">
          <p className="page-kicker">
            <i className="fa-solid fa-gavel" aria-hidden="true" />
            Community standards
          </p>
          <h1 className="page-title">Server Rules</h1>
          <p className="text-sm text-[var(--muted)] mt-2">
            {totalRules > 0
              ? `${totalRules} rule${totalRules === 1 ? "" : "s"} across ${sections.length} section${sections.length === 1 ? "" : "s"}.`
              : "Read them before playing."}{" "}
            Hit the acknowledge button at the bottom when you&apos;re done.
          </p>
        </div>

        {error && sections.length === 0 ? (
          <ErrorState onRetry={() => void refetch()} what="rules" />
        ) : loading ? (
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="card p-6 animate-pulse" aria-hidden="true">
                <div className="h-5 w-40 bg-white/5 rounded mb-4" />
                <div className="h-4 w-full bg-white/5 rounded mb-2" />
                <div className="h-4 w-3/4 bg-white/5 rounded" />
              </div>
            ))}
          </div>
        ) : totalRules === 0 ? (
          <EmptyState icon="fa-gavel" title="No rules published yet" hint="Check back soon." />
        ) : (
          <div className="space-y-6 stagger">
            {sections.map((section, si) => (
              <section key={section.id ?? si} className="card overflow-hidden">
                {/* Section header — the API's structure is the page's structure */}
                <div className="flex items-center gap-3 px-5 sm:px-6 py-4 border-b border-[var(--border)] bg-[var(--bg-2)]/50">
                  <span className="w-9 h-9 rounded-xl bg-[var(--accent-dim)] border border-[var(--border-strong)] flex items-center justify-center text-[var(--accent)]">
                    <i className={`${section.icon || "fa-gavel"} text-sm`} aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="font-display text-lg font-bold leading-tight">{section.title}</h2>
                    <p className="text-xs text-[var(--muted-2)]">
                      {section.rules?.length ?? 0} rule{(section.rules?.length ?? 0) === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                {/* Rules as divider-separated rows (forum-reply language) */}
                <div>
                  {(section.rules ?? []).map((rule, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-5 px-5 sm:px-6 py-4 ${
                        i < (section.rules?.length ?? 0) - 1 ? "border-b border-[var(--border)]" : ""
                      }`}
                    >
                      <span className="font-display text-sm text-[var(--accent)] flex-shrink-0 w-8 text-right">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <p className="text-[var(--fg)] font-medium leading-relaxed">{rule}</p>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* Acknowledge — the finish line */}
        <div className="mt-10 card p-6 flex flex-col sm:flex-row items-center justify-between gap-5">
          <div className="text-center sm:text-left">
            <p className="font-display text-lg font-bold">Read everything above?</p>
            <p className="text-sm text-[var(--muted)] mt-1">
              Confirm you accept the rules before playing.
            </p>
          </div>
          <button
            ref={ackRef}
            className={`btn-primary ${acknowledged ? "opacity-90" : ""}`}
            onClick={acknowledge}
            disabled={acknowledged}
          >
            {acknowledged ? (
              <>
                <i className="fa-solid fa-check" />
                Acknowledged
              </>
            ) : (
              <>
                <span aria-hidden="true">🔥</span>
                Acknowledge
              </>
            )}
          </button>
        </div>
      </div>
    </SubPage>
  );
}
