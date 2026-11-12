"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type PendingRequest = {
  promise: Promise<unknown>;
  controller: AbortController;
  consumers: number;
};

// Share concurrent reads, never completed results. Every later poll/refetch
// still reaches the API, and one unmount cannot cancel another consumer.
const pendingRequests = new Map<string, PendingRequest>();

function acquireRequest(path: string) {
  let request = pendingRequests.get(path);
  if (!request) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    const next: PendingRequest = {
      controller,
      consumers: 0,
      promise: Promise.resolve(),
    };
    next.promise = (async () => {
      const response = await fetch(path, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(`GET ${path} failed (${response.status})`);
      return response.json();
    })().finally(() => {
      clearTimeout(timeout);
      if (pendingRequests.get(path) === next) pendingRequests.delete(path);
    });
    pendingRequests.set(path, next);
    request = next;
  }
  const shared = request;
  shared.consumers += 1;
  let released = false;
  return {
    promise: shared.promise,
    release() {
      if (released) return;
      released = true;
      shared.consumers -= 1;
      if (shared.consumers === 0 && pendingRequests.get(path) === shared) {
        pendingRequests.delete(path);
        shared.controller.abort();
      }
    },
  };
}

export function useApi<T>(path: string, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [dataPath, setDataPath] = useState(path);
  // Background polls leave the existing UI in place while they run.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const firstDone = useRef(false);
  const reqRef = useRef(0);
  const mounted = useRef(false);
  const activePath = useRef(path);
  const fallback = useRef(initial);
  const activeRequest = useRef<ReturnType<typeof acquireRequest> | null>(null);

  useEffect(() => { fallback.current = initial; }, [initial]);

  const load = useCallback(async () => {
    if (!mounted.current || activePath.current !== path) return;
    const reqId = ++reqRef.current;
    // Acquire first, so repeated calls from this consumer can join the same
    // flight instead of briefly dropping its last subscriber and aborting it.
    const request = acquireRequest(path);
    activeRequest.current?.release();
    activeRequest.current = request;
    const isCurrent = () => mounted.current && activePath.current === path && reqId === reqRef.current;
    try {
      if (!firstDone.current) setLoading(true);
      const json = await request.promise as T;
      if (!isCurrent()) return;
      setData(json);
      setError(false);
    } catch {
      if (!isCurrent()) return;
      // Keep useful content during a transient outage. Live-status consumers
      // must also check error before treating retained data as current.
      setError(true);
    } finally {
      request.release();
      if (activeRequest.current === request) activeRequest.current = null;
      if (isCurrent()) {
        firstDone.current = true;
        setLoading(false);
      }
    }
  }, [path]);

  useEffect(() => {
    mounted.current = true;
    activePath.current = path;
    firstDone.current = false;
    setData(fallback.current);
    setDataPath(path);
    setError(false);
    setLoading(true);
    void load();
    return () => {
      mounted.current = false;
      reqRef.current += 1;
      activeRequest.current?.release();
      activeRequest.current = null;
    };
  }, [path, load]);

  // Don't render the previous endpoint's data between a path change and its effect.
  return {
    data: dataPath === path ? data : initial,
    loading: dataPath !== path || loading,
    error: dataPath === path && error,
    refetch: load,
  };
}
