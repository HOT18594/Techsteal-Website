"use client";

import { useState } from "react";
import { useApi } from "@/lib/use-api";
import type { RuleSection } from "@/types";
import { Reveal } from "@/components/Reveal";

export default function RulesPage() {
  const { data: sections, loading } = useApi<RuleSection[]>("/api/rules", []);
  const [open, setOpen] = useState(0);

  return (
    <section className="py-24 lg:py-32 px-6 lg:px-10">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <div className="mb-16">
            <div className="section-label mb-4">07 / Rules</div>
            <h1 className="font-display text-5xl md:text-6xl font-bold mb-3">Rules</h1>
            <p className="text-[var(--muted)] max-w-lg">The codex. Short, clear, and built to last.</p>
          </div>
        </Reveal>

        <Reveal delay={1}>
          <div className="grid lg:grid-cols-2 gap-5">
            {loading ? (
              <p className="text-sm text-[var(--muted)] col-span-full py-8 text-center">Loading…</p>
            ) : sections.length === 0 ? (
              <p className="text-sm text-[var(--muted)] col-span-full py-8 text-center">No rules published yet.</p>
            ) : (
              sections.map((r, i) => (
                <div key={r.id ?? r.title} className={`accordion-item card ${open === i ? "open" : ""}`}>
                  <div
                    className="accordion-trigger p-6 flex items-start gap-4"
                    onClick={() => setOpen(open === i ? -1 : i)}
                  >
                    <div className="w-12 h-12 bg-[var(--bg-2)] flex items-center justify-center flex-shrink-0 rounded-lg">
                      <i className={`fa-solid ${r.icon} text-[var(--accent)] text-xl`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-display text-xs text-[var(--muted)]">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <h3 className="font-display text-xl font-bold">{r.title}</h3>
                      </div>
                    </div>
                    <div className="accordion-icon text-xl text-[var(--muted)]">
                      <i className="fa-solid fa-plus" />
                    </div>
                  </div>
                  <div className="accordion-content">
                    <div className="px-6 pb-6 space-y-3">
                      {r.rules.map((rule, j) => (
                        <div
                          key={j}
                          className="flex items-start gap-3 py-2 pl-2 border-l-2 border-[var(--border-strong)]"
                        >
                          <span className="font-display text-xs text-[var(--accent)] mt-0.5 flex-shrink-0">
                            {String(j + 1).padStart(2, "0")}
                          </span>
                          <span className="text-sm text-[var(--fg-2)]">{rule}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Reveal>

        {/* The One Rule card */}
        <Reveal delay={2}>
          <div className="mt-12 card p-8" style={{ background: "linear-gradient(135deg, var(--card) 0%, var(--bg-2) 100%)" }}>
            <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
              <div className="w-16 h-16 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-bright)] flex items-center justify-center flex-shrink-0 rounded-xl">
                <i className="fa-solid fa-shield-halved text-3xl text-white" />
              </div>
              <div className="flex-1">
                <h3 className="font-display text-2xl font-bold mb-2">The One Rule</h3>
                <p className="text-[var(--fg-2)]">
                  Above all else — be the kind of player whose presence makes the server worth logging into.
                  Everything else is detail.
                </p>
              </div>
              <div className="font-display text-5xl font-bold text-[var(--accent)] opacity-30">00</div>
            </div>
          </div>
        </Reveal>

        {/* Asset placeholder */}
        <Reveal delay={3}>
          <div className="mt-12 asset-placeholder aspect-[16/9] rounded-xl">
            <div className="asset-placeholder-content">
              <i className="fa-solid fa-gavel asset-placeholder-icon" />
              <span className="asset-placeholder-text">Rules Hero Image</span>
              <span className="asset-placeholder-hint">Add banner or graphic</span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}