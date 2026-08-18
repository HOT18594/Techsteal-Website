"use client";

import { useEffect, useState } from "react";
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
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const { show } = useToast();
  const pathname = usePathname();
  const { data: status } = useApi<ServerStatus>("/api/status", {
    online: true,
    players: 0,
    max: siteConfig.maxPlayers,
  });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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

  const closeDropdown = () => setDropdownOpen(false);

  return (
    <>
      <nav
        id="navbar"
        className={`fixed top-0 left-0 right-0 z-40 ${scrolled ? "scrolled" : ""}`}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-3">
            <div className="logo-mark" />
            <span className="font-display text-xl tracking-wider">{siteConfig.name}</span>
          </a>

          {/* Desktop: Hamburger button */}
          <button
            className="lg:hidden text-[var(--fg)] text-xl"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            aria-label={dropdownOpen ? "Close menu" : "Open menu"}
            aria-expanded={dropdownOpen}
          >
            <i className={dropdownOpen ? "fa-solid fa-xmark" : "fa-solid fa-bars"} />
          </button>

          {/* Desktop: Status pill + Join button (hidden on mobile, shown in dropdown) */}
          <div className="hidden lg:flex items-center gap-3">
            <div className={`status-pill ${online ? "" : "offline"}`}>
              <span className={`pulse-dot ${online ? "" : "muted"}`} />
              <span>
                {online ? "Online" : "Offline"} · {players}/{max}
              </span>
            </div>
            <button className="btn-primary py-2.5! px-5! text-xs!" onClick={copyIP}>
              <i className="fa-solid fa-cube" />
              <span className="hidden sm:inline">Join Server</span>
            </button>
          </div>
        </div>

        {/* Slide-down dropdown panel (desktop + mobile) */}
        <div
          className={`nav-dropdown ${dropdownOpen ? "open" : ""}`}
          role="navigation"
          aria-label="Main navigation"
        >
          <div className="nav-dropdown-inner">
            <div className="nav-dropdown-links">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className={`nav-dropdown-link ${pathname === link.href ? "active" : ""}`}
                  onClick={closeDropdown}
                >
                  <i className={`fa-solid ${link.icon}`} aria-hidden="true" />
                  {link.label}
                </a>
              ))}
              {/* Mobile-only: Status + Join button in dropdown */}
              <div className="lg:hidden pt-4 border-t border-[var(--border)] flex flex-col gap-3">
                <div className={`status-pill ${online ? "" : "offline"}`}>
                  <span className={`pulse-dot ${online ? "" : "muted"}`} />
                  <span>
                    {online ? "Online" : "Offline"} · {players}/{max}
                  </span>
                </div>
                <button className="btn-primary py-2.5! px-5! text-xs! w-full justify-center" onClick={copyIP}>
                  <i className="fa-solid fa-cube" />
                  <span>Join Server</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Backdrop for mobile */}
        {dropdownOpen && (
          <div
            className="lg:hidden fixed inset-0 z-40 bg-black/50"
            onClick={closeDropdown}
            aria-hidden="true"
          />
        )}
      </nav>
    </>
  );
}