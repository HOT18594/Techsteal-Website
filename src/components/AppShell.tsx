"use client";

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

const PAGE_TITLES: Record<AppPage, string> = {
  home: "Home",
  join: "How to Join",
  community: "Community",
  blog: "Blog",
  settings: "Settings",
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

export default function AppShell({ page }: { page: AppPage }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="splash">
        <div className="splash__inner">
          <img className="splash__logo" src="/img/logo.png" alt="TechSteal" />
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

  return (
    <div className="app show">
      <Sidebar activePage={page} />
      <div className="main">
        <div className="topbar">
          <div className="topbar__eyebrow">TechSteal Space</div>
          <div className="topbar__title">{PAGE_TITLES[page]}</div>
        </div>
        <main className="content">{renderPage(page)}</main>
      </div>
    </div>
  );
}
