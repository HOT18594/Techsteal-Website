"use client";

import { useMemo } from "react";
import { useApi } from "@/lib/use-api";
import type { TimelineEvent } from "@/types";
import { Reveal } from "@/components/Reveal";

export default function HistoryPage() {
  const { data: events, loading } = useApi<TimelineEvent[]>("/api/timeline", []);

  const eras = useMemo(
    () => Array.from(new Set(events.map((e) => e.era))),
    [events]
  );

  return (
    <section className="py-24 lg:py-32 px-6 lg:px-10">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <div className="mb-16">
            <div className="section-label mb-4">04 / History</div>
            <h1 className="font-display text-5xl md:text-6xl font-bold mb-3">Server History</h1>
          </div>
        </Reveal>

        <div className="grid lg:grid-cols-12 gap-8">
          {/* Era markers */}
          <Reveal delay={1}>
            <div className="lg:col-span-3 hidden lg:block">
              <div className="sticky top-24 space-y-6">
                <div>
                  <div className="font-display text-5xl font-bold text-[var(--accent)]">
                    {events.length}
                  </div>
                  <div className="text-sm text-[var(--muted)] uppercase tracking-wider mt-1">Total Events</div>
                </div>
                <div className="pixel-divider" />
                <div className="space-y-3 text-sm">
                  {eras.map((era) => (
                    <div key={era} className="flex justify-between items-center pb-2 border-b border-[var(--border)]">
                      <span className="text-[var(--muted)]">{era}</span>
                      <span className="text-[var(--accent)] font-display">
                        {events.filter((e) => e.era === era).length}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>

          {/* Timeline */}
          <Reveal delay={2}>
            <div className="lg:col-span-9">
              <div className="timeline">
                {loading ? (
                  <p className="text-sm text-[var(--muted)] py-8">Loading…</p>
                ) : events.length === 0 ? (
                  <p className="text-sm text-[var(--muted)] py-8">No events recorded yet.</p>
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
                      {e.desc && <p className="text-[var(--muted)] max-w-2xl">{e.desc}</p>}
                    </div>
                  ))
                )}
              </div>

              {/* Asset placeholder at bottom of timeline */}
              <div className="mt-12 asset-placeholder aspect-[16/9] rounded-xl">
                <div className="asset-placeholder-content">
                  <i className="fa-solid fa-clock-rotate-left asset-placeholder-icon" />
                  <span className="asset-placeholder-text">Timeline Hero Image</span>
                  <span className="asset-placeholder-hint">Add timeline banner</span>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}