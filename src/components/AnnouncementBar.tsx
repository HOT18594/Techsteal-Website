"use client";

// Sitewide announcement bar. Admins publish from the admin panel; this reads
// the newest active one and lets each visitor dismiss it for that announcement
// only (a new announcement still shows). Renders nothing when there is none,
// when the request fails, or before the fetch settles — so it never shifts
// layout on first paint.

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  announcementCssVars,
  resolveAnnouncementIcon,
  resolveAnnouncementPattern,
  sanitizeAnnouncementHref,
} from "@/lib/announcements";
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

export function AnnouncementBannerContent({
  item,
  preview = false,
  onDismiss,
}: {
  item: Pick<
    Announcement,
    "title" | "body" | "tone" | "pattern" | "accentColor" | "icon" | "vibrant" | "linkLabel" | "linkHref"
  >;
  preview?: boolean;
  onDismiss?: () => void;
}) {
  const pattern = resolveAnnouncementPattern(item.pattern);
  const icon = resolveAnnouncementIcon(item);
  const vibrant = item.vibrant !== false;
  const safeHref = sanitizeAnnouncementHref(item.linkHref);
  const ctaLabel = (item.linkLabel ?? "").trim() || "Learn more";
  const isInternal = safeHref.startsWith("/");

  return (
    <div
      className={`announce-bar tone-${item.tone || "info"} pattern-${pattern} ${vibrant ? "is-vibrant" : ""} ${preview ? "is-preview" : ""}`}
      style={announcementCssVars(item)}
      role={preview ? undefined : "status"}
    >
      <div className="announce-inner">
        <span className="announce-icon" aria-hidden="true">
          <i className={`fa-solid ${icon}`} />
        </span>
        <strong>{item.title}</strong>
        {item.body ? <span className="announce-text">{item.body}</span> : null}
        {safeHref ? (
          preview ? (
            <span className="announce-cta">
              {ctaLabel} <i className="fa-solid fa-arrow-right" aria-hidden="true" />
            </span>
          ) : isInternal ? (
            <Link href={safeHref} className="announce-cta">
              {ctaLabel} <i className="fa-solid fa-arrow-right" aria-hidden="true" />
            </Link>
          ) : (
            <a href={safeHref} target="_blank" rel="noreferrer" className="announce-cta">
              {ctaLabel} <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
            </a>
          )
        ) : null}
        {onDismiss ? (
          <button
            type="button"
            className="announce-dismiss"
            onClick={onDismiss}
            aria-label="Dismiss announcement"
          >
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function AnnouncementBar() {
  const [item, setItem] = useState<Announcement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/announcements", { cache: "no-store" })
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

  return <AnnouncementBannerContent item={item} onDismiss={dismiss} />;
}
