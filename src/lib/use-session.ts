"use client";

// Client-side session hook. Reads /api/auth/me so the UI can react to
// the logged-in user (navbar, admin link, gated content).

import { useCallback, useEffect, useState } from "react";
import type { SessionUser } from "@/types";

export interface SessionState {
  user: SessionUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

export function useSession(): SessionState {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = (await res.json()) as { user: SessionUser | null };
      setUser(data.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
  }, []);

  return { user, loading, refresh, logout };
}
