"use client";

import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { useApi } from "@/lib/use-api";
import { timeAgo } from "@/lib/time";
import type { ActivityEvent } from "@/types";

const EMPTY: ActivityEvent[] = [];

// Recent community activity (new threads, builds, members). Shared by the home
// page and the forum sidebar; reads only public content from /api/activity.
export function ActivityFeed({ title = "Recent activity" }: { title?: string }) {
  const { data, loading } = useApi<ActivityEvent[]>("/api/activity", EMPTY);

  return (
    <section className="activity-feed" aria-label={title}>
      <div className="activity-feed-head">
        <h2>{title}</h2>
        <i className="fa-solid fa-wave-square" aria-hidden="true" />
      </div>

      {loading && data.length === 0 ? (
        <div className="activity-list" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="activity-item animate-pulse">
              <div className="w-9 h-9 rounded-[10px] bg-white/5 flex-shrink-0" />
              <div className="flex-1">
                <div className="h-3 w-3/4 bg-white/5 rounded mb-2" />
                <div className="h-2.5 w-16 bg-white/5 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : data.length === 0 ? (
        <p className="activity-empty">Nothing yet — activity shows up as the community posts.</p>
      ) : (
        <ul className="activity-list">
          {data.map((e) => (
            <li key={e.key} className="activity-item">
              <Avatar name={e.author} src={e.avatarUrl} size="sm" color={e.color} />
              <div className="activity-body">
                <p className="activity-text">
                  {e.type === "member" ? (
                    <>
                      <Link href={e.href} className="activity-author">{e.author}</Link> joined the server
                    </>
                  ) : (
                    <>
                      <span className="activity-author">{e.author}</span>{" "}
                      {e.type === "thread" ? "started" : "posted"}{" "}
                      <Link href={e.href} className="activity-title">{e.title}</Link>
                    </>
                  )}
                </p>
                {e.createdAt ? <span className="activity-time">{timeAgo(e.createdAt)}</span> : null}
              </div>
              {e.type === "gallery" && e.image ? (
                <Link href={e.href} className="activity-thumb" aria-label={`Open build: ${e.title}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={e.image} alt="" loading="lazy" />
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}