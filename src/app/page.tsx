"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import Splash from "@/components/Splash";
import AccountSetup from "@/components/AccountSetup";
import Sidebar from "@/components/Sidebar";
import Home from "@/components/Home";
import Join from "@/components/Join";
import Community from "@/components/Community";
import Blog from "@/components/Blog";
import Settings from "@/components/Settings";

export default function Page() {
  const { user, loading } = useAuth();
  const [activePage, setActivePage] = useState("home");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close mobile sidebar on navigation.
  useEffect(() => {
    setSidebarOpen(false);
  }, [activePage]);

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

  // New users (first Discord login) go through account setup before entering.
  if (user.isNewUser) {
    return <AccountSetup />;
  }

  return (
    <div className="app show">
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <div className="main">
        <div className="topbar">
          <div className="topbar__title">
            {activePage === "home" && "Home"}
            {activePage === "join" && "How to Join"}
            {activePage === "community" && "Community"}
            {activePage === "blog" && "Blog"}
            {activePage === "settings" && "Settings"}
          </div>
          <div className="topbar__status">
            <span className="status-dot" />
            Online
          </div>
        </div>
        <div className="content">
          {activePage === "home" && <Home />}
          {activePage === "join" && <Join />}
          {activePage === "community" && <Community />}
          {activePage === "blog" && <Blog />}
          {activePage === "settings" && <Settings />}
        </div>
      </div>
    </div>
  );
}
