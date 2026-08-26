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

async function fetchOnce(): Promise<SessionUser | null> {
  const res = await fetch("/api/auth/me");
  if (!res.ok) throw new Error(`/api/auth/me → ${res.status}`);
  const data = (await res.json()) as { user: SessionUser | null };
  return data.user ?? null;
}

function fetchSession(): Promise<SessionUser | null> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      return await fetchOnce();
    } catch {
      // One transient blip (pooler hiccup, dropped Wi-Fi) must not flip the
      // whole site to "signed out" — the server answers 503 for DB outages
      // precisely so this can be retried instead of trusted. One retry,
      // then give up and render signed-out; the next refresh recovers.
      await new Promise((resolve) => setTimeout(resolve, 1200));
      try {
        return await fetchOnce();
      } catch {
        return null;
      }
    }
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

// Session changes must reach EVERY hook instance, not just the one that
// triggered them: logout() in the navbar also has to flip OnboardingReminder,
// Chatty and any gated page back to signed-out (and vice versa on login).
// Each instance subscribes; refresh()/logout() broadcast the new user.
type SessionListener = (user: SessionUser | null) => void;
const listeners = new Set<SessionListener>();

function broadcast(user: SessionUser | null) {
  for (const fn of listeners) fn(user);
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
    broadcast(await fetchSession());
    setLoading(false);
  }, []);

  useEffect(() => {
    const fn: SessionListener = (u) => {
      setUser(u);
      setLoading(false);
    };
    listeners.add(fn);
    void refresh();
    return () => {
      listeners.delete(fn);
    };
  }, [refresh]);

  const logout = useCallback(async (): Promise<boolean> => {
    // Only clear local state when the server actually cleared the cookie —
    // otherwise the still-valid session "resurrects" on the next refresh.
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) {
        broadcast(null);
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
