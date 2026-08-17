"use client";

import { useState } from "react";
import { useApi } from "@/lib/use-api";
import type { RuleSection } from "@/types";
import { Reveal } from "./Reveal";

export function Rules() {
  const { data: sections, loading } = useApi<RuleSection[]>("/api/rules", []);
  const [open, setOpen] = useState(0);

  return (
    <section id="rules" className="relative py-24 lg:py-32 z-10">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <Reveal>
          <div className="mb-16">
            <div className="section-label mb-4">07 / Rules</div>
            <h2 className="font-display text-5xl md:text-6xl font-bold mb-3">Rules</h2>
          </div>
        </Reveal>

        <div className="grid lg:grid-cols-2 gap-5">
          {loading ? (
            <p className="text-sm text-[var(--muted)]">Loading…</p>
          ) : sections.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No rules published yet.</p>
          ) : (
            sections.map((r, i) => (
              <div key={r.id ?? r.title} className={`accordion-item card ${open === i ? "open" : ""}`}>
                <div
                  className="accordion-trigger p-6 flex items-start gap-4"
                  onClick={() => setOpen(open === i ? -1 : i)}
                >
                  <div className="w-12 h-12 bg-[var(--bg-2)] flex items-center justify-center flex-shrink-0">
                    <i className={`fa-solid ${r.icon} text-[var(--accent)] text-lg`} />
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
      </div>
    </section>
  );
}
