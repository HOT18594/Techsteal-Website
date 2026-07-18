"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type AuthUser = {
  discordId: string;
  username: string;
  avatar: string;
  role: "admin" | "member";
  isNewUser?: boolean;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: () => void;
  logout: () => Promise<void>;
  completeSetup: (username: string) => Promise<void>;
  isAdmin: boolean;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: () => {},
  logout: async () => {},
  completeSetup: async () => {},
  isAdmin: false,
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

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
    if (!user) return;
    const res = await fetch("/api/auth/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    if (res.ok) {
      setUser({ ...user, username, isNewUser: false });
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, logout, completeSetup, isAdmin: user?.role === "admin" }}
    >
      {children}
    </AuthContext.Provider>
  );
}
