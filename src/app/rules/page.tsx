"use client";

import { useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import { SubPage } from "@/components/SubPage";
import { fallbackRules } from "@/lib/fallback-data";
import type { RuleSection } from "@/types";
import { useApi } from "@/lib/use-api";

/** Party burst: launches a shower of 🎉🎊🔥✨💥 from a point on screen. */
function emojiBurst(x: number, y: number, count: number) {
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
  const { data: sections } = useApi<RuleSection[]>("/api/rules", fallbackRules);
  // Rules come from the same source the API/DB uses, so there's only one
  // copy to maintain going forward.
  const RULES = sections[0]?.rules ?? [];
  const [acknowledged, setAcknowledged] = useState(false);
  const ackRef = useRef<HTMLButtonElement>(null);

  const acknowledge = () => {
    if (acknowledged) return;
    setAcknowledged(true);
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
          <h1 className="page-title">Techsteal Server Rules</h1>
        </div>

        {/* Intro */}
        <p className="mt-4 text-[var(--fg-2)]">
          React with{" "}
          <span className="inline-flex items-center gap-1.5 align-middle">
            <span className="text-lg" aria-hidden="true">
              🔥
            </span>
          </span>{" "}
          to acknowledge the rules. If you&apos;d like to suggest a change or new
          rule, let us know!
        </p>

        {/* Rules list */}
        <div className="mt-10 space-y-4 stagger">
          {RULES.map((rule, i) => (
            <div
              key={i}
              className="card p-5 flex items-start gap-5 hover:border-[var(--accent)] transition-colors"
            >
              <span className="font-display text-lg text-[var(--accent)] flex-shrink-0 w-8 text-right">
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="text-[var(--fg)] font-medium">{rule}</p>
            </div>
          ))}
        </div>

        {/* Acknowledge */}
        <div className="mt-10 card p-6 flex flex-col sm:flex-row items-center justify-between gap-5">
          <div className="text-center sm:text-left">
            <p className="font-display text-lg font-bold">
              Read everything above?
            </p>
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