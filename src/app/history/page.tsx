"use client";

import { useMemo } from "react";
import { fallbackTimeline } from "@/lib/fallback-data";
import type { TimelineEvent } from "@/types";
import { SubPage } from "@/components/SubPage";
import { useApi } from "@/lib/use-api";

export default function HistoryPage() {
  const { data: events } = useApi<TimelineEvent[]>("/api/timeline", fallbackTimeline);

  const eras = useMemo(
    () => Array.from(new Set(events.map((e) => e.era))),
    [events]
  );

  return (
    <SubPage>
      <div className="w-full">
        {/* Header */}
        <div className="page-header mb-8">
          <h1 className="page-title">Server History</h1>
        </div>

        <div className="grid lg:grid-cols-12 gap-8">
          {/* Era markers */}
          <div className="lg:col-span-3 hidden lg:block">
            <div className="sticky top-24 space-y-6">
              <div>
                <div className="font-display text-4xl font-bold text-[var(--accent)]">
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

          {/* Timeline */}
          <div className="lg:col-span-9">
            <div className="timeline stagger">
              {events.length === 0 ? (
                <p className="text-sm text-[var(--muted)] py-10 text-center">
                  No events recorded yet.
                </p>
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
                    {e.description && <p className="text-[var(--muted)] max-w-2xl">{e.description}</p>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </SubPage>
  );
}