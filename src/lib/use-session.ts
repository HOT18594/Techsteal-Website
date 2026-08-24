"use client";

// Client-side session hook. Reads /api/auth/me so the UI can react to
// the logged-in user (navbar, admin link, gated content).

import { useCallback, useEffect, useState } from "react";
import type { SessionUser } from "@/types";

// Single-flight fetch shared across every useSession() consumer. Navbar,
// OnboardingReminder, PollAnnouncement and page components all call this
// hook, and without sharing, each mounting instance fired its own identical
// /api/auth/me request — 4+ duplicates per page load. Concurrent mounts now
// join one request; there is deliberately NO result cache, so a refresh()
// after login/logout/profile changes still sees fresh state.
let inflight: Promise<SessionUser | null> | null = null;

function fetchSession(): Promise<SessionUser | null> {
  if (inflight) return inflight;
  inflight = fetch("/api/auth/me")
    .then(async (res) => {
      if (!res.ok) throw new Error(`/api/auth/me → ${res.status}`);
      const data = (await res.json()) as { user: SessionUser | null };
      return data.user ?? null;
    })
    .catch(() => null)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

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
    setUser(await fetchSession());
    setLoading(false);
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
