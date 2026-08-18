"use client";

import { useState } from "react";
import { fallbackRules } from "@/lib/fallback-data";
import type { RuleSection } from "@/types";

export default function RulesPage() {
  const sections: RuleSection[] = fallbackRules;
  const [open, setOpen] = useState(0);

  return (
    <section className="px-6 lg:px-10 pt-24 lg:pt-28">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <h1 className="font-display text-4xl md:text-5xl font-bold mb-8">Rules</h1>

        <div className="grid md:grid-cols-2 gap-4">
          {sections.map((r, i) => (
            <div key={r.id ?? r.title} className={`accordion-item card ${open === i ? "open" : ""}`}>
              <div
                className="accordion-trigger p-5 flex items-start gap-4"
                onClick={() => setOpen(open === i ? -1 : i)}
              >
                <div className="w-11 h-11 bg-[var(--bg-2)] flex items-center justify-center flex-shrink-0 rounded-lg">
                  <i className={`fa-solid ${r.icon} text-[var(--accent)] text-lg`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-display text-xs text-[var(--muted)]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h3 className="font-display text-lg font-bold">{r.title}</h3>
                  </div>
                </div>
                <div className="accordion-icon text-lg text-[var(--muted)]">
                  <i className="fa-solid fa-plus" />
                </div>
              </div>
              <div className="accordion-content">
                <div className="px-5 pb-5 space-y-2">
                  {r.rules.map((rule, j) => (
                    <div
                      key={j}
                      className="flex items-start gap-3 py-1.5 pl-2 border-l-2 border-[var(--border-strong)]"
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
          ))}
        </div>
      </div>
    </section>
  );
}