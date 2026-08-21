"use client";

// Tiny data-fetching hook used by the client sections. Each section fetches
// from its own /api route so content stays live without a page reload.

import { useCallback, useEffect, useRef, useState } from "react";

export function useApi<T>(path: string, initial: T) {
  const [data, setData] = useState<T>(initial);
  // `loading` is true only while the FIRST load is in flight — background
  // refetches (manual refresh, auto-poll) must not flash empty states or
  // flip the status pill back to "Checking…" every cycle.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const firstDone = useRef(false);
  // Bumped on every load() so a slow response can't overwrite a newer one
  // (e.g. a stale manual refetch landing after the 60s auto-refresh).
  const reqRef = useRef(0);

  const load = useCallback(async () => {
    const reqId = ++reqRef.current; // ignore responses from superseded calls
    try {
      if (!firstDone.current) setLoading(true);
      const res = await fetch(path);
      if (!res.ok) throw new Error(`GET ${path} failed`);
      const json = (await res.json()) as T;
      if (reqId !== reqRef.current) return; // a newer call won — drop this one
      setData(json);
      setError(false);
    } catch {
      if (reqId !== reqRef.current) return;
      setError(true);
    } finally {
      firstDone.current = true;
      if (reqId === reqRef.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    firstDone.current = false;
    void load();
  }, [load]);

  return { data, loading, error, refetch: load };
}
