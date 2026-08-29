"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { siteConfig } from "@/lib/site";
import { fallbackStatus } from "@/lib/fallback-data";
import { hasOpenOverlays } from "@/lib/overlay-stack";
import type { ServerStatus } from "@/types";
import { Avatar } from "./Avatar";
import { useToast } from "./Toast";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/use-session";

/* The six links in the bar's middle stretch. Home is the wordmark, Status
   the pill, Join the CTA — so the full nav lives in one bar, always
   visible: icon-only below xl, icon + label from xl up. No hamburger. */
const NAV_LINKS = [
  { href: "/assistant", label: "Assistant", icon: "fa-robot" },
  { href: "/forum", label: "Forum", icon: "fa-comments" },
  { href: "/history", label: "History", icon: "fa-clock-rotate-left" },
  { href: "/members", label: "Members", icon: "fa-users" },
  { href: "/gallery", label: "Gallery", icon: "fa-images" },
  { href: "/rules", label: "Rules", icon: "fa-gavel" },
] as const;

export function Navbar() {
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const profileBtnRef = useRef<HTMLButtonElement>(null);
  const { show } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading: sessionLoading, logout } = useSession();
  // Live status from /api/status (falls back to placeholder until configured).
  const { data: status, loading: statusLoading } = useApi<ServerStatus>("/api/status", fallbackStatus);

  // Close the profile popover on route change.
  useEffect(() => {
    setProfileOpen(false);
  }, [pathname]);

  // Focus the first control when the popover opens — keyboard users never
  // drop to <body>.
  useEffect(() => {
    if (!profileOpen) return;
    const firstLink = profileRef.current?.querySelector<HTMLElement>("a, button");
    firstLink?.focus();
  }, [profileOpen]);

  // Close on outside click / Escape — but NEVER when the trigger button
  // itself was clicked: the trigger's onClick is the single source of truth.
  useEffect(() => {
    if (!profileOpen) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (profileRef.current?.contains(target)) return;
      if (profileBtnRef.current?.contains(target)) return;
      setProfileOpen(false);
      profileBtnRef.current?.focus();
    };
    const onKey = (e: KeyboardEvent) => {
      // A dialog/lightbox above this popover owns Escape (see overlay-stack):
      // closing the menu too — and yanking focus to its trigger — would slam
      // two overlays with one press and break the dialog's focus trap.
      if (hasOpenOverlays()) return;
      if (e.key === "Escape") {
        setProfileOpen(false);
        profileBtnRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [profileOpen]);

  const handleLogout = async () => {
    const ok = await logout();
    if (ok) {
      show("Signed out", "See you later.");
      setProfileOpen(false);
      if (pathname === "/admin") router.push("/");
    } else {
      show("Couldn't sign out", "Try again in a moment.", "error");
    }
  };

  // Only trust the pill when the live match query actually answered — a
  // fallback (API unreachable) shows "Offline" instead of fake numbers.
  const statusLive = status.source === "live";
  const online = statusLive && status.online;
  const players = statusLive ? (status.players ?? 0) : 0;
  const max = status.max ?? siteConfig.maxPlayers;

  return (
    <>
      {/* One fixed glass bar across the top: wordmark · links · actions.
          Every destination is reachable at every size — no hamburger. */}
      <header className="site-nav">
        <Link href="/" className="nav-wordmark" aria-label={`${siteConfig.name} home`}>
          <i className="fa-solid fa-cube" aria-hidden="true" />
          <span className="nav-wordmark-text">{siteConfig.name}</span>
        </Link>

        {/* All nav links inline — icon-only below xl (title tooltips carry
            the names), icon + label from xl up. */}
        <nav className="nav-links-bar" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={pathname === link.href ? "active" : ""}
              title={link.label}
              aria-label={link.label}
            >
              <i className={`fa-solid ${link.icon}`} aria-hidden="true" />
              <span className="nav-link-label">{link.label}</span>
            </Link>
          ))}
        </nav>

        {/* Action cluster — right end of the bar.
            Order: primary CTA (Join), ambient status, then (divided) account
            cluster. Actions first, identity last. */}
        <div className="nav-actions">
          <Link href="/join" className="btn-primary nav-join" aria-label="How to join">
            <i className="fa-solid fa-compass" />
            <span>Join</span>
          </Link>
          {/* Single status pill — text collapses to a dot-only pill below lg.
              (.status-pill owns its `display`, so the text hides via the
              inner span — toggling the pill itself was the double-dot bug.) */}
          <Link
            href="/status"
            className={`status-pill ${online ? "" : "offline"}`}
            aria-label={online ? `Server online — ${players}/${max} players` : "Server offline — view status"}
            title={statusLoading ? "Checking status…" : online ? `Online · ${players}/${max} players` : "Offline"}
          >
            <span className={`pulse-dot ${online ? "" : "muted"}`} />
            <span className="hidden lg:inline">
              {statusLoading ? "Checking…" : online ? "Online" : "Offline"}
              {!statusLoading && statusLive ? ` · ${players}/${max}` : ""}
            </span>
          </Link>

          <span className="nav-divider" aria-hidden="true" />

          {user ? (
            /* Profile — click opens a menu; Admin + logout live inside it */
            <button
              ref={profileBtnRef}
              className="nav-profile"
              onClick={() => setProfileOpen(!profileOpen)}
              aria-label="Profile menu"
              aria-expanded={profileOpen}
              aria-controls="profile-popover"
              title="Profile"
            >
              <Avatar name={user.username} src={user.avatarUrl} size="sm" className="w-7! h-7!" />
              <i className={`fa-solid ${profileOpen ? "fa-chevron-up" : "fa-chevron-down"} hidden sm:inline-block text-[10px] text-[var(--muted)]`} />
            </button>
          ) : (
            !sessionLoading && (
              /* Icon-only on small screens — with no hamburger popover, the
                  top-bar button is the only sign-in entry point. */
              <Link href="/login" className="btn-secondary inline-flex" aria-label="Log in">
                <i className="fa-brands fa-discord" />
                <span className="hidden lg:inline">Log in</span>
              </Link>
            )
          )}
        </div>
      </header>

      {/* Profile popover */}
      {user ? (
        <div
          id="profile-popover"
          ref={profileRef}
          // NOT role="menu": that contract requires every child to be a
          // role="menuitem" and arrow-key navigation between them. This
          // popover's children are ordinary links plus an identity header, so
          // screen readers announced "menu, 0 items" and skipped the lot.
          // role="group" + a label announces it correctly and keeps Tab
          // working the way the markup already behaves.
          role="group"
          aria-label="Profile menu"
          aria-hidden={!profileOpen}
          inert={!profileOpen}
          className={`nav-popover ${profileOpen ? "open" : ""}`}
        >
          <div className="px-4 py-3 border-b border-[var(--border)] flex items-center gap-3">
            <Avatar name={user.username} src={user.avatarUrl} size="sm" />
            <div className="min-w-0">
              <div className="font-display font-bold text-base truncate leading-snug">
                {user.username}
              </div>
              <div className="text-xs text-[var(--muted)] capitalize">
                {user.role === "admin" ? "Admin" : "Member"}
              </div>
            </div>
          </div>
          <div className="pt-1.5">
            <Link
              href="/settings"
              className="nav-popover-link"
              onClick={() => setProfileOpen(false)}
            >
              <i className="fa-solid fa-user-gear" aria-hidden="true" />
              Profile & Settings
            </Link>
            {user.role === "admin" ? (
              <Link
                href="/admin"
                className="nav-popover-link"
                onClick={() => setProfileOpen(false)}
              >
                <i className="fa-solid fa-shield-halved" aria-hidden="true" />
                Admin Panel
              </Link>
            ) : null}
            <button
              className="nav-popover-link w-full text-left text-[var(--redstone)] hover:text-[var(--redstone)]"
              onClick={() => void handleLogout()}
            >
              <i className="fa-solid fa-right-from-bracket" aria-hidden="true" />
              Log out
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
