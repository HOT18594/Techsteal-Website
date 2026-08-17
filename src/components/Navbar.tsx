"use client";

import { useEffect, useState } from "react";
import { siteConfig } from "@/lib/site";
import { useApi } from "@/lib/use-api";
import type { ServerStatus } from "@/types";
import { useToast } from "./Toast";

const NAV_LINKS = [
  { href: "#home", label: "Home" },
  { href: "#status", label: "Status" },
  { href: "#assistant", label: "AI Assistant" },
  { href: "#forum", label: "Forum" },
  { href: "#history", label: "History" },
  { href: "#members", label: "Members" },
  { href: "#gallery", label: "Gallery" },
  { href: "#rules", label: "Rules" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState("#home");
  const [mobileOpen, setMobileOpen] = useState(false);
  const { show } = useToast();
  const { data: status } = useApi<ServerStatus>("/api/status", {
    online: true,
    players: 0,
    max: siteConfig.maxPlayers,
  });

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 30);
      let current = "";
      for (const section of document.querySelectorAll<HTMLElement>("section[id]")) {
        if (window.scrollY >= section.offsetTop - 120) current = `#${section.id}`;
      }
      setActive(current || "#home");
    };
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

  return (
    <>
      <nav
        id="navbar"
        className={`fixed top-0 left-0 right-0 z-40 ${scrolled ? "scrolled" : ""}`}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          <a href="#home" className="flex items-center gap-3">
            <div className="logo-mark" />
            <span className="font-display text-xl tracking-wider">{siteConfig.name}</span>
            <span className="text-xs text-[var(--muted)] hidden sm:inline border-l border-[var(--border)] pl-3 ml-1">
              PRIVATE SERVER
            </span>
          </a>

          <div className="hidden lg:flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={`nav-link ${active === link.href ? "active" : ""}`}
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <div className={`status-pill hidden md:inline-flex ${online ? "" : "offline"}`}>
              <span className={`pulse-dot ${online ? "" : "muted"}`} />
              <span>
                {online ? "Online" : "Offline"} · {players}/{max}
              </span>
            </div>
            <button className="btn-primary !py-2.5 !px-5 !text-xs" onClick={copyIP}>
              <i className="fa-solid fa-cube" />
              <span className="hidden sm:inline">Join Server</span>
            </button>
            <button
              className="lg:hidden text-[var(--fg)] text-xl"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <i className="fa-solid fa-bars" />
            </button>
          </div>
        </div>
      </nav>

      <div id="mobile-menu" className={mobileOpen ? "open" : ""}>
        <div className="p-6 flex items-center justify-between border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <div className="logo-mark" />
            <span className="font-display text-xl">{siteConfig.name}</span>
          </div>
          <button
            className="text-2xl text-[var(--fg)]"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
        <nav className="px-6">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="mobile-link"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </>
  );
}
