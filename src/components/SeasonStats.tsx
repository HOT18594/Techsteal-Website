"use client";

import { useApi } from "@/lib/use-api";
import { siteConfig } from "@/lib/site";
import type { SeasonStats as Stats } from "@/types";

const INITIAL: Stats = {
  season: siteConfig.season,
  seasonStart: siteConfig.seasonStart,
  daysLive: 0,
  members: 0,
  online: 0,
  builds: 0,
  discussions: 0,
  replies: 0,
};

// Flat counter band under the hero. Only public community totals; the live
// player count and "days live" appear once the season actually opens.
export function SeasonStats() {
  const { data, loading } = useApi<Stats>("/api/stats", INITIAL);
  const live = siteConfig.seasonLive;

  const cells = [
    { icon: "fa-users", label: "Members", value: data.members },
    { icon: "fa-cube", label: "Builds", value: data.builds },
    { icon: "fa-comments", label: "Discussions", value: data.discussions },
    { icon: "fa-reply", label: "Replies", value: data.replies },
    ...(live
      ? [
          { icon: "fa-signal", label: "Online", value: data.online },
          { icon: "fa-calendar-day", label: "Days live", value: data.daysLive },
        ]
      : []),
  ];

  return (
    <section className="season-stats" aria-label={`${siteConfig.season} community stats`}>
      <div className="season-stats-head">
        <h2>{siteConfig.season} by the numbers</h2>
        <span className={`tag ${live ? "tag-emerald" : "tag-accent"}`}>
          <i className={`fa-solid ${live ? "fa-bolt" : "fa-hourglass-half"}`} aria-hidden="true" />
          {live ? "Live now" : "Coming soon"}
        </span>
      </div>
      <div className="season-stats-grid">
        {cells.map((cell) => (
          <div className="season-stat" key={cell.label}>
            <i className={`fa-solid ${cell.icon}`} aria-hidden="true" />
            <span className="season-stat-value">{loading ? "—" : cell.value.toLocaleString("en-US")}</span>
            <span className="season-stat-label">{cell.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}