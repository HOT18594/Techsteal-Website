"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Avatar } from "./Avatar";
import { useToast } from "./Toast";
import { hasOpenOverlays } from "@/lib/overlay-stack";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/use-session";
import { timeAgo } from "@/lib/time";
import type { Notification, NotificationsResponse } from "@/types";

const INITIAL: NotificationsResponse = { notifications: [], unread: 0 };

function hrefFor(n: Notification): string {
  if (n.type === "gallery_comment" || n.type === "gallery_like") {
    return n.itemId ? `/gallery?item=${n.itemId}` : "/gallery";
  }
  // A mention can happen in a gallery comment (itemId) or a forum reply.
  if (n.type === "mention" && n.itemId && !n.threadId) {
    return `/gallery?item=${n.itemId}`;
  }
  return n.threadId ? `/forum/${n.threadId}` : "/forum";
}

function labelFor(n: Notification): string {
  const who = n.actorName || "Someone";
  switch (n.type) {
    case "reply": return `${who} replied to your thread`;
    case "like": return `${who} liked your post`;
    case "mention": return `${who} mentioned you`;
    case "gallery_comment": return `${who} commented on your build`;
    case "gallery_like": return `${who} liked your build`;
    default: return `${who} interacted with you`;
  }
}

// Navbar bell + private inbox dropdown. Self-contained: polls while signed in,
// closes on outside-click / Escape / navigation, and marks items read on open.
export function NotificationBell() {
  const { user } = useSession();
  const { show } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const { data, refetch } = useApi<NotificationsResponse>("/api/notifications", INITIAL, Boolean(user));

  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => {
      if (document.visibilityState !== "hidden") void refetch();
    }, 45_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [user, refetch]);

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!wrapRef.current?.contains(target) && !btnRef.current?.contains(target)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (hasOpenOverlays()) return;
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;

  const unread = data.unread;
  const items = data.notifications;

  const markAll = async () => {
    if (busy || unread === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Couldn't mark notifications read.");
      }
      await refetch();
    } catch (err) {
      // A failed POST (401/403/429, network) used to look like success and
      // the badge silently came back on the next poll. Reconcile + say why.
      show("Couldn't mark read", err instanceof Error ? err.message : "Try again in a moment.", "error");
      void refetch();
    } finally {
      setBusy(false);
    }
  };

  const markRead = async (n: Notification) => {
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: n.id }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Couldn't mark the notification read.");
      }
      await refetch();
    } catch (err) {
      show("Couldn't mark read", err instanceof Error ? err.message : "Try again in a moment.", "error");
      void refetch(); // badge/state must match the server, not the failed click
    }
  };

  const openItem = (n: Notification) => {
    setOpen(false);
    if (!n.read) void markRead(n);
    router.push(hrefFor(n));
  };

  return (
    <div className="t-nav-bell-wrap">
      <button
        ref={btnRef}
        type="button"
        className="t-nav-bell"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        aria-controls="notification-panel"
        onClick={() => setOpen((o) => !o)}
      >
        <i className="fa-solid fa-bell" aria-hidden="true" />
        {unread > 0 ? <span className="t-nav-bell-badge">{unread > 9 ? "9+" : unread}</span> : null}
      </button>

      {open ? (
        <div id="notification-panel" ref={wrapRef} className="t-nav-notifications" role="group" aria-label="Notifications">
          <div className="t-nav-notifications-head">
            <strong>Notifications</strong>
            {unread > 0 ? (
              <button type="button" onClick={() => void markAll()} disabled={busy}>
                {busy ? "Marking…" : "Mark all read"}
              </button>
            ) : null}
          </div>
          {items.length === 0 ? (
            <p className="t-nav-notifications-empty">No notifications yet — replies, likes and mentions land here.</p>
          ) : (
            <ul className="t-nav-notifications-list">
              {items.map((n) => (
                <li key={n.id}>
                  <button type="button" className={`t-nav-notification ${n.read ? "" : "is-unread"}`} onClick={() => openItem(n)}>
                    <Avatar name={n.actorName || "Someone"} src={n.actorAvatar} size="sm" color={n.actorColor} />
                    <span className="t-nav-notification-body">
                      <span className="t-nav-notification-text">{labelFor(n)}</span>
                      {n.excerpt ? <span className="t-nav-notification-excerpt">{n.excerpt}</span> : null}
                      <span className="t-nav-notification-time">{n.createdAt ? timeAgo(n.createdAt) : ""}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}