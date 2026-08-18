"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { siteConfig } from "@/lib/site";
import { useApi } from "@/lib/use-api";
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
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { show } = useToast();
  const pathname = usePathname();
  const { data: status } = useApi<ServerStatus>("/api/status", {
    online: true,
    players: 0,
    max: siteConfig.maxPlayers,
  });

  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close on route change.
  useEffect(() => {
    closeMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <nav
      id="navbar"
      className={`fixed top-0 left-0 right-0 z-40 ${scrolled ? "scrolled" : ""}`}
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
        {/* Wordmark */}
        <a href="/" className="font-display text-2xl tracking-wider text-[var(--fg)]">
          {siteConfig.name}
        </a>

        <div className="flex items-center gap-3">
          {/* Status pill — visible on all sizes */}
          <div className={`status-pill hidden sm:inline-flex ${online ? "" : "offline"}`}>
            <span className={`pulse-dot ${online ? "" : "muted"}`} />
            <span>
              {online ? "Online" : "Offline"} · {players}/{max}
            </span>
          </div>
          {/* Join button — visible on all sizes */}
          <button className="btn-primary py-2.5! px-5! text-xs!" onClick={copyIP}>
            <i className="fa-solid fa-cube" />
            <span className="hidden sm:inline">Join Server</span>
          </button>
          {/* Hamburger menu toggle — ALWAYS visible */}
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
      </div>
    </nav>
  );
}