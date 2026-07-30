"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import type { AppPage } from "@/components/AppShell";
import { NavIcon, type IconName } from "@/components/icons";

interface SidebarProps {
  activePage: AppPage;
  collapsed: boolean;
  onToggle: () => void;
}

const NAV_ITEMS: {
  page: AppPage;
  href: string;
  label: string;
  kicker: string;
  icon: IconName;
}[] = [
  { page: "home", href: "/", label: "Home", kicker: "Status", icon: "home" },
  { page: "join", href: "/join", label: "How to Join", kicker: "Setup", icon: "join" },
  { page: "community", href: "/community", label: "Community", kicker: "Posts", icon: "community" },
  { page: "blog", href: "/blog", label: "Blog", kicker: "News", icon: "blog" },
  { page: "settings", href: "/settings", label: "Settings", kicker: "Account", icon: "settings" },
];

export default function Sidebar({ activePage, collapsed, onToggle }: SidebarProps) {
  return (
    <aside className="sidebar" data-collapsed={collapsed}>
      <div className="sidebar__brand">
        <Link href="/" className="sidebar__brand-link" aria-label="Techsteal home">
          <img className="sidebar__logo" src="/img/logo.png" alt="Techsteal" />
        </Link>
        <button
          type="button"
          className="sidebar__collapse"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          title={collapsed ? "Expand" : "Collapse"}
        >
          <NavIcon name="chevron" className={collapsed ? "rot-180" : ""} />
        </button>
      </div>

      <ul className="sidebar__nav">
        {NAV_ITEMS.map((item) => (
          <li key={item.page}>
            <Link
              className={`nav-item ${activePage === item.page ? "active" : ""}`}
              data-page={item.page}
              href={item.href}
              aria-label={item.label}
              title={collapsed ? item.label : undefined}
            >
              <span className="nav-item__icon">
                <NavIcon name={item.icon} />
              </span>
              <span className="nav-item__copy">
                <span>{item.label}</span>
                <small>{item.kicker}</small>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
