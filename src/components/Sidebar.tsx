"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import type { AppPage } from "@/components/AppShell";

interface SidebarProps {
  activePage: AppPage;
}

// Fixed icons: use proper valid SVG path strings. Gear icon previously broken because it tried to pack multi-part path with invalid d.
// Now we store each icon as array of path strings, rendered as multiple <path> elements.
const NAV_ITEMS: {
  page: AppPage;
  href: string;
  label: string;
  kicker: string;
  paths: string[];
}[] = [
  {
    page: "home",
    href: "/",
    label: "Home",
    kicker: "Status",
    paths: ["M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", "M9 22V12h6v10"],
  },
  {
    page: "join",
    href: "/join",
    label: "How to Join",
    kicker: "Setup",
    paths: ["M12 5v14M5 12h14"],
  },
  {
    page: "community",
    href: "/community",
    label: "Community",
    kicker: "Posts",
    paths: [
      "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2",
      "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
      "M23 21v-2a4 4 0 0 0-3-3.87",
      "M16 3.13a4 4 0 0 1 0 7.75",
    ],
  },
  {
    page: "blog",
    href: "/blog",
    label: "Blog",
    kicker: "News",
    paths: [
      "M19 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1",
      "M23 14l-3 3-3-3",
      "M20 17v-6",
    ],
  },
  {
    page: "settings",
    href: "/settings",
    label: "Settings",
    kicker: "Account",
    paths: [
      "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
      "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
    ],
  },
];

export default function Sidebar({ activePage }: SidebarProps) {
  const { user, logout, isAdmin, viewMode } = useAuth();

  return (
    <aside className="sidebar">
      <Link href="/" className="sidebar__brand" aria-label="TechSteal home">
        <img className="sidebar__logo" src="/img/logo.png" alt="TechSteal" />
      </Link>
      <ul className="sidebar__nav">
        {NAV_ITEMS.map((item) => (
          <li key={item.page}>
            <Link className={`nav-item ${activePage === item.page ? "active" : ""}`} data-page={item.page} href={item.href}>
              <span className="nav-item__icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {item.paths.map((d, i) => (
                    <path key={i} d={d} />
                  ))}
                </svg>
              </span>
              <span className="nav-item__copy">
                <span>{item.label}</span>
                <small>{item.kicker}</small>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="sidebar__footer">
        <div className="sidebar__profile">
          <div className="sidebar__avatar show">
            {user?.avatar ? <img src={user.avatar} alt="avatar" /> : user?.username?.charAt(0).toUpperCase()}
          </div>
          <div>
            <strong>{user?.username || "Guest"}</strong>
            <span className={`role-pill ${isAdmin ? "role-pill--admin" : ""}`}>
              {isAdmin
                ? viewMode === "admin"
                  ? "Admin"
                  : "Admin · Member view"
                : "Member"}
            </span>
          </div>
        </div>
        <button className="sidebar__logout" onClick={logout}>Logout</button>
      </div>
    </aside>
  );
}
