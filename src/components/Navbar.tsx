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
import "./navigation.css";

const NAV_LINKS = [
  { href: "/status", label: "Server" },
  { href: "/assistant", label: "Assistant" },
  { href: "/forum", label: "Forum" },
  { href: "/history", label: "History" },
  { href: "/members", label: "Members" },
  { href: "/gallery", label: "Gallery" },
  { href: "/rules", label: "Rules" },
] as const;

export function Navbar() {
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const profileBtnRef = useRef<HTMLButtonElement>(null);
  const mobileRef = useRef<HTMLDivElement>(null);
  const mobileBtnRef = useRef<HTMLButtonElement>(null);
  const { show } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading: sessionLoading, logout } = useSession();
  const { data: status, loading: statusLoading, refetch: refetchStatus } = useApi<ServerStatus>(
    "/api/status", fallbackStatus
  );

  useEffect(() => {
    const timer = setInterval(() => void refetchStatus(), 60_000);
    return () => clearInterval(timer);
  }, [refetchStatus]);

  useEffect(() => {
    setProfileOpen(false);
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (profileOpen) profileRef.current?.querySelector<HTMLElement>("a, button")?.focus();
  }, [profileOpen]);

  useEffect(() => {
    if (!profileOpen && !mobileOpen) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (profileOpen && !profileRef.current?.contains(target) && !profileBtnRef.current?.contains(target)) {
        setProfileOpen(false);
      }
      if (mobileOpen && !mobileRef.current?.contains(target) && !mobileBtnRef.current?.contains(target)) {
        setMobileOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || hasOpenOverlays()) return;
      if (profileOpen) {
        setProfileOpen(false);
        profileBtnRef.current?.focus();
      }
      if (mobileOpen) {
        setMobileOpen(false);
        mobileBtnRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [profileOpen, mobileOpen]);

  // A menu opened on a narrow viewport must not reappear on desktop.
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1280px)");
    const onChange = () => { if (media.matches) setMobileOpen(false); };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      if (await logout()) {
        show("Signed out", "See you later.");
        setProfileOpen(false);
        setMobileOpen(false);
        if (pathname === "/admin" || pathname.startsWith("/admin/")) router.push("/");
      } else {
        show("Couldn't sign out", "Try again in a moment.", "error");
      }
    } finally {
      setLoggingOut(false);
    }
  };

  const statusLive = status.source === "live";
  const online = statusLive && status.online;
  const players = statusLive ? (status.players ?? 0) : 0;
  const max = status.max ?? siteConfig.maxPlayers;
  const statusText = statusLoading ? "Checking" : online ? "Online" : "Offline";
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="t-nav">
      <div className="t-nav-inner">
        <Link href="/" className="t-nav-brand" aria-label={`${siteConfig.name} home`}>
          <i className="fa-solid fa-cube t-nav-symbol" aria-hidden="true" />
          <span>{siteConfig.name}</span>
        </Link>

        <nav className="t-nav-links" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={isActive(link.href) ? "active" : ""}
              aria-current={isActive(link.href) ? "page" : undefined}>
              {link.label}
            </Link>
          ))}
        </nav>

        <div className={`t-nav-actions ${user ? "has-account" : ""}`}>
          <Link href="/status" className={`t-nav-status ${online ? "is-online" : ""}`}
            aria-label={`${statusText}${online ? `, ${players} of ${max} players` : ""}. View server status`}>
            <span aria-hidden="true" />{statusText}
          </Link>
          <Link href="/join" className="t-nav-join">Join server <span aria-hidden="true">↗</span></Link>
          {user ? (
            <button ref={profileBtnRef} className="t-nav-profile" type="button"
              onClick={() => { setMobileOpen(false); setProfileOpen(!profileOpen); }}
              aria-label="Account menu" aria-expanded={profileOpen} aria-controls="profile-popover">
              <Avatar name={user.username} src={user.avatarUrl} size="sm" />
            </button>
          ) : !sessionLoading ? (
            <Link href="/login" className="t-nav-login">Log in</Link>
          ) : null}
          <button ref={mobileBtnRef} type="button" className={`t-nav-toggle ${mobileOpen ? "is-open" : ""}`}
            aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileOpen} aria-controls="mobile-navigation"
            onClick={() => { setProfileOpen(false); setMobileOpen(!mobileOpen); }}>
            <span /><span />
          </button>
        </div>
      </div>

      <div id="mobile-navigation" ref={mobileRef} className="t-nav-mobile" hidden={!mobileOpen}>
        <nav aria-label="Mobile navigation">
          {NAV_LINKS.map((link, index) => (
            <Link key={link.href} href={link.href} className={isActive(link.href) ? "active" : ""}
              aria-current={isActive(link.href) ? "page" : undefined} onClick={() => setMobileOpen(false)}>
              <span className="t-nav-mobile-number" aria-hidden="true">0{index + 1}</span>
              {link.label}<span className="t-nav-mobile-arrow" aria-hidden="true">↗</span>
            </Link>
          ))}
        </nav>
        <div className="t-nav-mobile-account-actions">
          <Link href="/join" className="t-nav-join" onClick={() => setMobileOpen(false)}>Join server <span aria-hidden="true">↗</span></Link>
          {!user && !sessionLoading ? <Link href="/login" className="t-nav-mobile-account" onClick={() => setMobileOpen(false)}>Log in</Link> : null}
        </div>
        <div className="t-nav-mobile-footer">
          <Link href="/status" className={`t-nav-status ${online ? "is-online" : ""}`}>
            <span aria-hidden="true" />{statusText}{online ? ` · ${players}/${max}` : ""}
          </Link>
          <span>{siteConfig.address}</span>
        </div>
      </div>

      {user ? (
        <div id="profile-popover" ref={profileRef} role="group" aria-label="Account menu"
          aria-hidden={!profileOpen} inert={!profileOpen} className={`t-nav-popover ${profileOpen ? "is-open" : ""}`}>
          <div className="t-nav-identity">
            <Avatar name={user.username} src={user.avatarUrl} size="sm" />
            <div><strong>{user.username}</strong><span>{user.role === "admin" ? "Admin" : "Member"}</span></div>
          </div>
          <Link href="/settings" onClick={() => setProfileOpen(false)}>Profile & settings</Link>
          {user.role === "admin" ? <Link href="/admin" onClick={() => setProfileOpen(false)}>Admin panel</Link> : null}
          <button type="button" onClick={() => void handleLogout()} disabled={loggingOut}>
            {loggingOut ? "Signing out…" : "Log out"}
          </button>
        </div>
      ) : null}
    </header>
  );
}
