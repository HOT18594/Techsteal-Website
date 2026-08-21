"use client";

// Client-side session hook. Reads /api/auth/me so the UI can react to
// the logged-in user (navbar, admin link, gated content).

import { useCallback, useEffect, useState } from "react";
import type { SessionUser } from "@/types";

export interface SessionState {
  user: SessionUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  /** Returns true when the server actually cleared the session cookie. */
  logout: () => Promise<boolean>;
}

export function useSession(): SessionState {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) throw new Error(`/api/auth/me → ${res.status}`);
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

  const logout = useCallback(async (): Promise<boolean> => {
    // Only clear local state when the server actually cleared the cookie —
    // otherwise the still-valid session "resurrects" on the next refresh.
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) {
        setUser(null);
        return true;
      }
      await refresh();
      return false;
    } catch {
      // Network failure — cookie state is unknown; re-check.
      await refresh().catch(() => {});
      return false;
    }
  }, [refresh]);

  return { user, loading, refresh, logout };
}
