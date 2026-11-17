"use client";

// Sitewide announcement bar. Admins publish from the admin panel; this reads
// the newest active one and lets each visitor dismiss it for that announcement
// only (a new announcement still shows). Renders nothing when there is none,
// when the request fails, or before the fetch settles — so it never shifts
// layout on first paint.

import { useEffect, useState } from "react";
import type { Announcement } from "@/types";

const DISMISS_KEY = "techsteal-announcement-dismissed";

function dismissedIds(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.map(String) : [];
  } catch {
    return [];
  }
}

export function AnnouncementBar() {
  const [item, setItem] = useState<Announcement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/announcements")
      .then((res) => (res.ok ? res.json() : { announcements: [] }))
      .then((data: { announcements?: Announcement[] }) => {
        if (cancelled) return;
        const list = Array.isArray(data.announcements) ? data.announcements : [];
        const seen = dismissedIds();
        const next = list.find((entry) => !seen.includes(String(entry.id)));
        if (next) setItem(next);
      })
      .catch(() => {
        /* no announcement this visit */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!item) return null;

  const dismiss = () => {
    try {
      const ids = dismissedIds();
      ids.push(String(item.id));
      localStorage.setItem(DISMISS_KEY, JSON.stringify(ids.slice(-30)));
    } catch {
      /* private mode — it just reappears next visit */
    }
    setItem(null);
  };

  return (
    <div className={`announce-bar tone-${item.tone}`} role="status">
      <div className="announce-inner">
        <i className="fa-solid fa-bullhorn" aria-hidden="true" />
        <strong>{item.title}</strong>
        {item.body ? <span className="announce-text">{item.body}</span> : null}
        <button type="button" onClick={dismiss} aria-label="Dismiss announcement">
          <i className="fa-solid fa-xmark" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
