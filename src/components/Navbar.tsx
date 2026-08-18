"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { siteConfig } from "@/lib/site";
import { fallbackStatus } from "@/lib/fallback-data";
import type { ServerStatus } from "@/types";
import { useToast } from "./Toast";

const NAV_LINKS = [
  { href: "/", label: "Home", icon: "fa-house" },
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
  const menuRef = useRef<HTMLDivElement>(null);
  const { show } = useToast();
  const pathname = usePathname();
  const status: ServerStatus = fallbackStatus;

  const closeMenu = () => setMenuOpen(false);

  // Close on route change.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const copyIP = async () => {
    try {
      await navigator.clipboard.writeText(siteConfig.address);
      show("Server address copied", siteConfig.address);
    } catch {
      show("Couldn't copy address", siteConfig.address);
    }
  };

  const online = status.online;
  const players = status.players ?? 0;
  const max = status.max ?? siteConfig.maxPlayers;

  return (
    <>
      {/* Floating wordmark — top left */}
      <Link
        href="/"
        className="fixed top-5 left-6 lg:left-10 z-40 font-display text-2xl tracking-wider text-[var(--fg)] hover:text-[var(--accent)] transition"
      >
        {siteConfig.name}
      </Link>

      {/* Floating action buttons — top right */}
      <div className="fixed top-4 right-4 lg:right-6 z-40 flex items-center gap-2">
        <div className={`status-pill hidden sm:inline-flex ${online ? "" : "offline"}`}>
          <span className={`pulse-dot ${online ? "" : "muted"}`} />
          <span>
            {online ? "Online" : "Offline"} · {players}/{max}
          </span>
        </div>
        <button className="btn-primary py-2.5! px-5! text-xs!" onClick={copyIP}>
          <i className="fa-solid fa-cube" />
          <span className="hidden sm:inline">Join Server</span>
        </button>
        <Link
          href="/login"
          className="btn-secondary py-2.5! px-4! text-xs! hidden sm:inline-flex"
          aria-label="Log in with Discord"
        >
          <i className="fa-brands fa-discord" />
          <span className="hidden md:inline">Log in</span>
        </Link>
        <button
          className="h-11 w-11 flex items-center justify-center text-xl text-[var(--fg)] border border-[var(--border-strong)] rounded-lg hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="nav-popover"
        >
          <i className={menuOpen ? "fa-solid fa-xmark" : "fa-solid fa-bars"} />
        </button>
      </div>

      {/* Compact popover menu */}
      <div
        id="nav-popover"
        ref={menuRef}
        role="navigation"
        aria-label="Main navigation"
        aria-hidden={!menuOpen}
        className={`nav-popover ${menuOpen ? "open" : ""}`}
      >
        {NAV_LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className={`nav-popover-link ${pathname === link.href ? "active" : ""}`}
            onClick={closeMenu}
          >
            <i className={`fa-solid ${link.icon}`} aria-hidden="true" />
            {link.label}
          </a>
        ))}

        {/* Account */}
        <div className="mt-2 pt-2 border-t border-[var(--border)]">
          <Link
            href="/login"
            className={`nav-popover-link ${pathname === "/login" ? "active" : ""}`}
            onClick={closeMenu}
          >
            <i className="fa-solid fa-user" aria-hidden="true" />
            Log in / Sign up
          </Link>
        </div>
      </div>
    </>
  );
}