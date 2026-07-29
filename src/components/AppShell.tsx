"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import Splash from "@/components/Splash";
import AccountSetup from "@/components/AccountSetup";
import Sidebar from "@/components/Sidebar";
import Home from "@/components/Home";
import Join from "@/components/Join";
import Community from "@/components/Community";
import Blog from "@/components/Blog";
import Settings from "@/components/Settings";

export type AppPage = "home" | "join" | "community" | "blog" | "settings";

const PAGE_META: Record<AppPage, { label: string; kicker: string }> = {
  home: { label: "Home", kicker: "Server status & community" },
  join: { label: "How to Join", kicker: "Setup guide" },
  community: { label: "Community", kicker: "Posts & discussion" },
  blog: { label: "Blog", kicker: "News & updates" },
  settings: { label: "Settings", kicker: "Account & permissions" },
};

function renderPage(page: AppPage) {
  switch (page) {
    case "join":
      return <Join />;
    case "community":
      return <Community />;
    case "blog":
      return <Blog />;
    case "settings":
      return <Settings />;
    case "home":
    default:
      return <Home />;
  }
}

const COLLAPSE_KEY = "techsteal:sidebar-collapsed";

// SSR-safe: defaults to expanded so the first paint matches the server render;
// reads the persisted choice in an effect (effects don't run on the server).
function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(COLLAPSE_KEY) === "1") setCollapsed(true);
    } catch {}
  }, []);
  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  };
  return { collapsed, toggle };
}

function ViewToggle() {
  const { viewMode, setViewMode } = useAuth();
  return (
    <div className="view-toggle" role="group" aria-label="View as">
      <button
        type="button"
        className={`view-toggle__btn ${viewMode === "admin" ? "active" : ""}`}
        aria-pressed={viewMode === "admin"}
        onClick={() => setViewMode("admin")}
      >
        Admin
      </button>
      <button
        type="button"
        className={`view-toggle__btn ${viewMode === "member" ? "active" : ""}`}
        aria-pressed={viewMode === "member"}
        onClick={() => setViewMode("member")}
      >
        Member
      </button>
    </div>
  );
}

function ProfileButton() {
  const { user, logout, isAdmin, viewMode } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="profile-menu" ref={ref}>
      <button
        type="button"
        className="profile-menu__btn"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="sidebar__avatar show">
          {user?.avatar ? <img src={user.avatar} alt="" /> : user?.username?.charAt(0).toUpperCase()}
        </span>
      </button>
      {open && (
        <div className="profile-menu__dropdown" role="menu">
          <div className="profile-menu__head">
            <strong>{user?.username || "Guest"}</strong>
            <span className={`role-pill ${isAdmin ? "role-pill--admin" : ""}`}>
              {isAdmin ? (viewMode === "admin" ? "Admin" : "Admin · Member view") : "Member"}
            </span>
          </div>
          <button type="button" className="profile-menu__logout" onClick={logout} role="menuitem">
            Logout
          </button>
        </div>
      )}
    </div>
  );
}

export default function AppShell({ page }: { page: AppPage }) {
  const { user, loading, isAdmin } = useAuth();
  const { collapsed, toggle } = useSidebarCollapsed();

  if (loading) {
    return (
      <div className="splash">
        <div className="splash__inner">
          <img className="splash__logo" src="/img/logo.png" alt="Techsteal" />
          <div className="login">
            <div className="status-spinner" style={{ margin: "20px auto" }} />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Splash />;
  }

  if (user.isNewUser) {
    return <AccountSetup />;
  }

  const meta = PAGE_META[page];

  return (
    <div className="app show" data-collapsed={collapsed} suppressHydrationWarning>
      <Sidebar activePage={page} collapsed={collapsed} onToggle={toggle} />
      <div className="main">
        <header className="header">
          <div className="header__inner">
            <div className="header__head">
              <div className="header__eyebrow">{meta.kicker}</div>
              <h1 className="header__title">{meta.label}</h1>
            </div>
            <div className="header__actions">
              {isAdmin && <ViewToggle />}
              <ProfileButton />
            </div>
          </div>
        </header>
        <main className="content">{renderPage(page)}</main>
      </div>
    </div>
  );
}
