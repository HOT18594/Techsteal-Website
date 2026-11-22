"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  INITIAL_LAUNCH_STATE,
  type LaunchRunResult,
  type LaunchState,
} from "@/lib/launch-shared";
import { siteConfig } from "@/lib/site";

interface LaunchContextValue {
  launch: LaunchState;
  refreshLaunch: () => Promise<void>;
  runLaunch: () => Promise<LaunchRunResult | null>;
}

const LaunchContext = createContext<LaunchContextValue | null>(null);

function withCurrentLiveState(state: LaunchState): LaunchState {
  const seasonLive =
    siteConfig.seasonLive ||
    (state.enabled && Number.isFinite(new Date(state.launchAt).getTime()) && new Date(state.launchAt).getTime() <= Date.now());
  return seasonLive === state.seasonLive ? state : { ...state, seasonLive };
}

export function LaunchProvider({ children }: { children: ReactNode }) {
  const [launch, setLaunch] = useState<LaunchState>(INITIAL_LAUNCH_STATE);
  const autoRunFor = useRef<string | null>(null);

  const refreshLaunch = useCallback(async () => {
    try {
      const res = await fetch("/api/launch", { cache: "no-store" });
      if (!res.ok) return;
      const next = (await res.json()) as LaunchState;
      setLaunch(withCurrentLiveState(next));
    } catch {
      // The locally scheduled countdown can still advance during a network outage.
    }
  }, []);

  const runLaunch = useCallback(async (): Promise<LaunchRunResult | null> => {
    try {
      const res = await fetch("/api/launch", { method: "POST" });
      const next = (await res.json()) as { result: LaunchRunResult; state: LaunchState };
      if (next?.state) {
        setLaunch(withCurrentLiveState(next.state));
      }
      if (!res.ok) return null;
      return next.result;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    void refreshLaunch();
    const refreshId = setInterval(() => void refreshLaunch(), 30_000);
    const tickId = setInterval(() => {
      setLaunch((current) => withCurrentLiveState(current));
    }, 1_000);
    return () => {
      clearInterval(refreshId);
      clearInterval(tickId);
    };
  }, [refreshLaunch]);

  // Any visitor reaching the site after the scheduled time triggers the
  // duplicate-safe launch check once for that schedule if auto-start hasn't run yet.
  useEffect(() => {
    if (!launch.configured || !launch.enabled || !launch.autoStart || launch.startedAt) return;
    const targetMs = new Date(launch.launchAt).getTime();
    if (!Number.isFinite(targetMs) || targetMs > Date.now()) return;
    if (autoRunFor.current === launch.launchAt) return;
    autoRunFor.current = launch.launchAt;
    void runLaunch();
  }, [launch.configured, launch.enabled, launch.autoStart, launch.startedAt, launch.launchAt, launch.seasonLive, runLaunch]);

  return (
    <LaunchContext.Provider value={{ launch, refreshLaunch, runLaunch }}>
      {children}
    </LaunchContext.Provider>
  );
}

export function useLaunchState(): LaunchContextValue {
  const context = useContext(LaunchContext);
  if (!context) throw new Error("useLaunchState must be used inside LaunchProvider");
  return context;
}
