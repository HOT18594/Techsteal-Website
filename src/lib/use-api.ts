"use client";

// Tiny data-fetching hook used by the client sections. Each section fetches
// from its own /api route so content stays live without a page reload.

import { useCallback, useEffect, useState } from "react";

export function useApi<T>(path: string, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(path);
      if (!res.ok) throw new Error(`GET ${path} failed`);
      setData((await res.json()) as T);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, refetch: load };
}
