"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { siteConfig } from "@/lib/site";
import { fallbackStatus } from "@/lib/fallback-data";
import type { ServerStatus } from "@/types";
import { Avatar } from "./Avatar";
import { useToast } from "./Toast";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/use-session";

const NAV_LINKS = [
  { href: "/", label: "Home", icon: "fa-house" },
  { href: "/join", label: "How to Join", icon: "fa-compass" },
  { href: "/status", label: "Status", icon: "fa-signal" },
  { href: "/assistant", label: "Assistant", icon: "fa-robot" },
  { href: "/forum", label: "Forum", icon: "fa-comments" },
  { href: "/history", label: "History", icon: "fa-clock-rotate-left" },
  { href: "/members", label: "Members", icon: "fa-users" },
  { href: "/gallery", label: "Gallery", icon: "fa-images" },
  { href: "/rules", label: "Rules", icon: "fa-gavel" },
] as const;

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const profileBtnRef = useRef<HTMLButtonElement>(null);
  const { show } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading: sessionLoading, logout } = useSession();
  // Live status from /api/status (falls back to placeholder until configured).
  const { data: status } = useApi<ServerStatus>("/api/status", fallbackStatus);

  // Close popovers on route change.
  useEffect(() => {
    setMenuOpen(false);
    setProfileOpen(false);
  }, [pathname]);

  // Only one popover at a time — opening one closes the other.
  const toggleMenu = (open: boolean) => {
    setMenuOpen(open);
    if (open) setProfileOpen(false);
  };
  const toggleProfile = (open: boolean) => {
    setProfileOpen(open);
    if (open) setMenuOpen(false);
  };

  // Close on outside click / Escape — but NEVER when the toggle button
  // itself was clicked: the toggle's onClick is the single source of truth.
  useEffect(() => {
    if (!menuOpen && !profileOpen) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const inMenu = menuRef.current?.contains(target);
      const inProfile = profileRef.current?.contains(target);
      const onToggle = toggleRef.current?.contains(target);
      const onProfileBtn = profileBtnRef.current?.contains(target);
      if (menuOpen && !inMenu && !onToggle) setMenuOpen(false);
      if (profileOpen && !inProfile && !onProfileBtn) setProfileOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, profileOpen]);

  const handleLogout = async () => {
    await logout();
    show("Signed out", "See you later.");
    setProfileOpen(false);
    if (pathname === "/admin") router.push("/");
  };

  const online = status.online;
  const players = status.players ?? 0;
  const max = status.max ?? siteConfig.maxPlayers;

  return (
    <>
      {/* Floating wordmark — top left */}
      <Link href="/" className="nav-wordmark" aria-label={`${siteConfig.name} home`}>
        <i className="fa-solid fa-cube" aria-hidden="true" />
        {siteConfig.name}
      </Link>

      {/* Floating glass action bar — top right */}
      <div className="nav-actions">
        <div className={`status-pill hidden sm:inline-flex ${online ? "" : "offline"}`}>
          <span className={`pulse-dot ${online ? "" : "muted"}`} />
          <span>
            {online ? "Online" : "Offline"} · {players}/{max}
          </span>
        </div>
        <Link href="/join" className="btn-primary hidden sm:inline-flex" aria-label="How to join">
          <i className="fa-solid fa-compass" />
          <span>Join</span>
        </Link>
        {user ? (
          <>
            {user.role === "admin" ? (
              <Link
                href="/admin"
                className={`btn-secondary hidden sm:inline-flex ${
                  pathname === "/admin" ? "!text-[var(--accent)]" : ""
                }`}
                aria-label="Admin panel"
              >
                <i className="fa-solid fa-shield-halved" />
                <span className="hidden md:inline">Admin</span>
              </Link>
            ) : null}
            {/* Profile — click opens a menu; logout lives inside it */}
            <button
              ref={profileBtnRef}
              className="nav-profile"
              onClick={() => toggleProfile(!profileOpen)}
              aria-label="Profile menu"
              aria-expanded={profileOpen}
              aria-controls="profile-popover"
              title="Profile"
            >
              <Avatar name={user.username} src={user.avatarUrl} size="sm" className="!w-7 !h-7" />
              <i className={`fa-solid ${profileOpen ? "fa-chevron-up" : "fa-chevron-down"} text-[10px] text-[var(--muted)]`} />
            </button>
          </>
        ) : (
          !sessionLoading && (
            <Link
              href="/login"
              className="btn-secondary hidden sm:inline-flex"
              aria-label="Log in"
            >
              <i className="fa-brands fa-discord" />
              <span className="hidden md:inline">Log in</span>
            </Link>
          )
        )}
        <button
          ref={toggleRef}
          className="nav-toggle"
          onClick={() => toggleMenu(!menuOpen)}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="nav-popover"
        >
          <i className={menuOpen ? "fa-solid fa-xmark" : "fa-solid fa-bars"} />
        </button>
      </div>

      {/* Cinematic scrim behind the popover */}
      {menuOpen ? (
        <div className="nav-scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />
      ) : null}

      {/* Profile popover */}
      {user ? (
        <div
          id="profile-popover"
          ref={profileRef}
          role="menu"
          aria-label="Profile menu"
          aria-hidden={!profileOpen}
          inert={!profileOpen}
          className={`nav-popover ${profileOpen ? "open" : ""}`}
        >
          <div className="px-4 py-3 border-b border-[var(--border)] flex items-center gap-3">
            <Avatar name={user.username} src={user.avatarUrl} size="sm" />
            <div className="min-w-0">
              <div className="font-display font-bold text-base truncate">{user.username}</div>
              <div className="text-xs text-[var(--muted)] mt-0.5 capitalize">
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

      {/* Compact popover menu */}
      <div
        id="nav-popover"
        ref={menuRef}
        role="navigation"
        aria-label="Main navigation"
        aria-hidden={!menuOpen}
        inert={!menuOpen}
        className={`nav-popover ${menuOpen ? "open" : ""}`}
      >
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`nav-popover-link ${pathname === link.href ? "active" : ""}`}
            onClick={() => setMenuOpen(false)}
          >
            <i className={`fa-solid ${link.icon}`} aria-hidden="true" />
            {link.label}
          </Link>
        ))}

        {/* Account */}
        <div className="mt-2 pt-2 border-t border-[var(--border)]">
          {user ? (
            <>
              {user.role === "admin" ? (
                <Link
                  href="/admin"
                  className={`nav-popover-link ${pathname === "/admin" ? "active" : ""}`}
                  onClick={() => setMenuOpen(false)}
                >
                  <i className="fa-solid fa-shield-halved" aria-hidden="true" />
                  Admin Panel
                </Link>
              ) : null}
              <button
                className="nav-popover-link w-full text-left text-[var(--redstone)] hover:text-[var(--redstone)]"
                onClick={() => {
                  setMenuOpen(false);
                  void handleLogout();
                }}
              >
                <i className="fa-solid fa-right-from-bracket" aria-hidden="true" />
                Log out ({user.username})
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className={`nav-popover-link ${pathname === "/login" ? "active" : ""}`}
              onClick={() => setMenuOpen(false)}
            >
              <i className="fa-solid fa-user" aria-hidden="true" />
              Log in / Sign up
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
