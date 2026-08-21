"use client";

import { useMemo, useState } from "react";
import { fallbackTimeline } from "@/lib/fallback-data";
import type { TimelineEvent } from "@/types";
import { EmptyState, ErrorState } from "@/components/EmptyState";
import { SubPage } from "@/components/SubPage";
import { useApi } from "@/lib/use-api";

export default function HistoryPage() {
  const { data: events, loading, error, refetch } = useApi<TimelineEvent[]>("/api/timeline", fallbackTimeline);
  const [eraFilter, setEraFilter] = useState<string>("All");

  const eras = useMemo(
    () => Array.from(new Set(events.map((e) => e.era))),
    [events]
  );

  const visible = eraFilter === "All" ? events : events.filter((e) => e.era === eraFilter);
  const majors = events.filter((e) => e.major).length;

  return (
    <SubPage>
      <div className="w-full">
        {/* Header */}
        <div className="page-header mb-8">
          <p className="page-kicker">
            <i className="fa-solid fa-clock-rotate-left" aria-hidden="true" />
            The story so far
          </p>
          <h1 className="page-title">Server History</h1>
          <p className="text-sm text-[var(--muted)] mt-2">
            {events.length > 0
              ? `${events.length} events across ${eras.length} era${eras.length === 1 ? "" : "s"} — ${majors} of them season-defining.`
              : "Seasons, milestones, and the moments that shaped the server."}
          </p>
        </div>

        {error && events.length === 0 ? (
          <ErrorState onRetry={() => void refetch()} what="timeline" />
        ) : loading ? (
          <div className="space-y-4" aria-hidden="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card p-6 animate-pulse">
                <div className="h-3 w-24 bg-white/5 rounded mb-3" />
                <div className="h-5 w-2/3 bg-white/5 rounded mb-2" />
                <div className="h-3 w-full bg-white/5 rounded" />
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          <EmptyState icon="fa-clock-rotate-left" title="No events recorded yet" hint="History will fill in as seasons pass." />
        ) : (
          <div className="grid lg:grid-cols-12 gap-8">
            {/* Era filter — sidebar on desktop, chips everywhere else */}
            <div className="lg:col-span-3">
              <div className="lg:sticky lg:top-24 flex lg:flex-col gap-2 flex-wrap">
                {["All", ...eras].map((era) => {
                  const count = era === "All" ? events.length : events.filter((e) => e.era === era).length;
                  const active = eraFilter === era;
                  return (
                    <button
                      key={era}
                      onClick={() => setEraFilter(era)}
                      aria-pressed={active}
                      className={`lg:w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm transition border text-left ${
                        active
                          ? "bg-[var(--accent-dim)] border-[var(--accent)]/50 text-[var(--accent)] font-semibold"
                          : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)] hover:border-[var(--border-strong)]"
                      }`}
                    >
                      <span className="truncate">{era}</span>
                      <span className="text-xs text-[var(--muted-2)] flex-shrink-0">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Timeline */}
            <div className="lg:col-span-9">
              <div className="timeline stagger">
                {visible.length === 0 ? (
                  <EmptyState icon="fa-clock-rotate-left" title={`No events in ${eraFilter}`} action={
                    <button className="btn-secondary btn-sm" onClick={() => setEraFilter("All")}>
                      Show all eras
                    </button>
                  } />
                ) : (
                  visible.map((e, i) => (
                    <div
                      key={e.id ?? `${e.date}-${e.title}-${i}`}
                      className={`timeline-item ${e.major ? "major" : ""}`}
                    >
                      <div className="timeline-dot" />
                      <div className="flex flex-col md:flex-row md:items-baseline gap-2 mb-2">
                        <span className="font-display text-sm text-[var(--accent)]">{e.date}</span>
                        <span className="text-xs text-[var(--muted-2)] uppercase tracking-wider">{e.era}</span>
                      </div>
                      {/* Major events get the card treatment (pinned-thread
                          language) so they read as bigger deals */}
                      {e.major ? (
                        <div className="card p-5 border-l-[3px] border-l-[var(--accent)]">
                          <h3 className="font-display text-2xl font-bold mb-2 text-[var(--accent)]">
                            {e.title}
                          </h3>
                          {e.description && (
                            <p className="text-[var(--muted)] max-w-2xl leading-relaxed">{e.description}</p>
                          )}
                        </div>
                      ) : (
                        <div>
                          <h3 className="font-display text-2xl font-bold mb-2">{e.title}</h3>
                          {e.description && <p className="text-[var(--muted)] max-w-2xl">{e.description}</p>}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </SubPage>
  );
}
