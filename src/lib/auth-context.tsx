"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type AuthUser = {
  discordId: string;
  username: string;
  avatar: string;
  role: "admin" | "member";
  isNewUser?: boolean;
  inGuild?: boolean;
  // Discord OAuth access token (server-side only, used to revalidate guild
  // membership at request time). Never exposed to the browser.
  discordAccessToken?: string;
};

// Global UI view mode. An admin can switch to "member" to preview the site as
// a regular member, then back to "admin". This is purely a UI layer — the real
// role (and authorization) lives in `user.role`.
export type ViewMode = "admin" | "member";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: () => void;
  logout: () => Promise<void>;
  completeSetup: (username: string) => Promise<void>;
  isAdmin: boolean;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  // canAdmin is true only when the user is an admin AND is currently viewing
  // as admin. Use this for every admin-only UI control.
  canAdmin: boolean;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: () => {},
  logout: async () => {},
  completeSetup: async () => {},
  isAdmin: false,
  viewMode: "member",
  setViewMode: () => {},
  canAdmin: false,
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("member");

  // On mount, check if we have a session (cookie set by the callback route).
  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && data.user) setUser(data.user);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Default to admin view as soon as an admin logs in; keep member view for members.
  useEffect(() => {
    if (user?.role === "admin") setViewMode("admin");
    else setViewMode("member");
  }, [user?.role]);

  const login = () => {
    // Redirect to the Discord OAuth start route (server-side).
    window.location.href = "/api/auth/discord";
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    window.location.reload();
  };

  // Called when a new user finishes account setup. Creates their row in
  // user_roles and clears the isNewUser flag from the session.
  const completeSetup = async (username: string) => {
    if (!user) throw new Error("not_authenticated");
    const res = await fetch("/api/auth/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "setup_failed");
    }
    setUser({ ...user, username, isNewUser: false });
  };

  const isAdmin = user?.role === "admin";
  const canAdmin = isAdmin && viewMode === "admin";

  return (
    <AuthContext.Provider
      value={{ user, loading, login, logout, completeSetup, isAdmin, viewMode, setViewMode, canAdmin }}
    >
      {children}
    </AuthContext.Provider>
  );
}
