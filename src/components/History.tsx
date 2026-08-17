"use client";

import { useMemo } from "react";
import { useApi } from "@/lib/use-api";
import type { TimelineEvent } from "@/types";
import { Reveal } from "./Reveal";

export function History() {
  const { data: events, loading } = useApi<TimelineEvent[]>("/api/timeline", []);

  const eras = useMemo(
    () => Array.from(new Set(events.map((e) => e.era))),
    [events]
  );

  return (
    <section id="history" className="relative py-24 lg:py-32 z-10">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <Reveal>
          <div className="mb-16">
            <div className="section-label mb-4">04 / Server History</div>
            <h2 className="font-display text-5xl md:text-6xl font-bold mb-3">History</h2>
          </div>
        </Reveal>

        <div className="grid lg:grid-cols-12 gap-8">
          {/* Era markers */}
          <div className="lg:col-span-3 hidden lg:block">
            <div className="sticky top-24 space-y-6">
              <div className="pixel-divider" />
              <div className="space-y-3 text-sm">
                {eras.map((era) => (
                  <div key={era} className="flex justify-between items-center pb-2 border-b border-[var(--border)]">
                    <span className="text-[var(--muted)]">{era}</span>
                    <span className="text-[var(--accent)] font-display">
                      {events.filter((e) => e.era === era).length} events
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="lg:col-span-9">
            <div className="timeline">
              {loading ? (
                <p className="text-sm text-[var(--muted)]">Loading…</p>
              ) : events.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">No events recorded yet.</p>
              ) : (
                events.map((e) => (
                  <div key={e.id ?? `${e.date}-${e.title}`} className={`timeline-item ${e.major ? "major" : ""}`}>
                    <div className="timeline-dot" />
                    <div className="flex flex-col md:flex-row md:items-baseline gap-2 mb-2">
                      <span className="font-display text-sm text-[var(--accent)]">{e.date}</span>
                      <span className="text-xs text-[var(--muted-2)] uppercase tracking-wider">{e.era}</span>
                    </div>
                    <h3 className={`font-display text-2xl font-bold mb-2 ${e.major ? "text-[var(--accent)]" : ""}`}>
                      {e.title}
                    </h3>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
