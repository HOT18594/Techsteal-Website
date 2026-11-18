"use client";

import Link from "next/link";
import type { CSSProperties, FormEvent, KeyboardEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SubPage } from "@/components/SubPage";
import { useToast } from "@/components/Toast";
import { useCopyAddress } from "@/components/CopyIpButton";
import { fallbackStatus } from "@/lib/fallback-data";
import { minotarUrl } from "@/lib/minotar";
import { siteConfig } from "@/lib/site";
import { timeAgo } from "@/lib/time";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/use-session";
import type { ServerStatus, ServerTelemetry, ServerTelemetryLine } from "@/types";
import "./status.css";

const STATE_STYLE: Record<string, { color: string; message: string }> = {
  online: { color: "#a6c88c", message: "Ready to join." },
  starting: { color: "#e0c38b", message: "Starting the server. Updates automatically." },
  loading: { color: "#e0c38b", message: "Preparing the world." },
  stopping: { color: "#e0c38b", message: "Saving the world and stopping safely." },
  restarting: { color: "#e0c38b", message: "Restart in progress." },
  crashed: { color: "#e6a398", message: "The last run ended unexpectedly. Check the console." },
  pending: { color: "#e0c38b", message: "The next operation is queued." },
  offline: { color: "#a2a79b", message: "The server is offline." },
  unknown: { color: "#a2a79b", message: "We couldn’t reach the host. Live status is unavailable." },
};

const EMPTY_TELEMETRY: ServerTelemetry = {
  source: "unavailable",
  ramGb: null,
  lines: [],
  sampledAt: null,
};

const ACTIVITY_STORAGE_KEY = "techsteal-status-activity";
const MAX_ACTIVITY_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

type ActivityPoint = { at: number; players: number; max: number };
type ConsoleFilter = "all" | ServerTelemetryLine["level"];
type TabId = "overview" | "players" | "console" | "manage";

const TAB_META: Record<TabId, { label: string; icon: string }> = {
  overview: { label: "Overview", icon: "fa-gauge-high" },
  players: { label: "Players", icon: "fa-user-group" },
  console: { label: "Console", icon: "fa-terminal" },
  manage: { label: "Manage", icon: "fa-sliders" },
};

function styleFor(status: ServerStatus, statusLive: boolean) {
  if (!statusLive) return STATE_STYLE.unknown;
  return STATE_STYLE[status.state ?? (status.online ? "online" : "offline")] ?? STATE_STYLE.unknown;
}

function ActivityChart({ points, max }: { points: ActivityPoint[]; max: number }) {
  const width = 680;
  const height = 150;
  const inset = 12;
  const chartPoints = points.slice(-36);
  if (!chartPoints.length) {
    return (
      <div className="ops-chart-empty">
        <i className="fa-solid fa-chart-line" aria-hidden="true" />
        <p>No activity data yet</p>
      </div>
    );
  }
  const coordinates = chartPoints.map((point, index) => {
    const x =
      chartPoints.length <= 1
        ? inset
        : inset + (index / (chartPoints.length - 1)) * (width - inset * 2);
    const y =
      height -
      inset -
      (Math.min(point.players, max) / Math.max(max, 1)) * (height - inset * 2);
    return [x, y] as const;
  });
  const line = coordinates.map(([x, y]) => `${x},${y}`).join(" ");
  const peak = chartPoints.reduce((highest, point) => Math.max(highest, point.players), 0);
  return (
    <div className="ops-chart-wrap">
      <div className="ops-chart-labels">
        <span>{max} slots</span>
        <span>Peak {peak}</span>
      </div>
      <svg
        className="ops-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Player activity from ${chartPoints.length} live samples. Peak ${peak} of ${max} slots.`}
      >
        <g className="ops-chart-grid" aria-hidden="true">
          {[12, 54, 96, 138].map((y) => (
            <line key={y} x1={inset} y1={y} x2={width - inset} y2={y} />
          ))}
        </g>
        {line ? <polyline points={line} className="ops-chart-line" aria-hidden="true" /> : null}
        {coordinates.length ? (
          <circle
            cx={coordinates[coordinates.length - 1][0]}
            cy={coordinates[coordinates.length - 1][1]}
            r={4}
            className="ops-chart-point"
          />
        ) : null}
      </svg>
      <div className="ops-chart-labels">
        <span>
          {chartPoints.length} live {chartPoints.length === 1 ? "check" : "checks"} on this device
        </span>
        <span>Latest</span>
      </div>
      {chartPoints.length < 2 ? <p className="ops-helper">Waiting for more live samples.</p> : null}
    </div>
  );
}

function ConsolePanel({
  telemetry,
  loading,
  serverOnline,
  onRefresh,
}: {
  telemetry: ServerTelemetry;
  loading: boolean;
  serverOnline: boolean;
  onRefresh: () => Promise<unknown> | void;
}) {
  const { show } = useToast();
  const [filter, setFilter] = useState<ConsoleFilter>("all");
  const [query, setQuery] = useState("");
  const [pinned, setPinned] = useState(true);
  const [command, setCommand] = useState("");
  const [sendingCmd, setSendingCmd] = useState(false);
  const [sharingLog, setSharingLog] = useState(false);
  const [sharedLogUrl, setSharedLogUrl] = useState<string | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  const counts = useMemo(() => {
    const c: Record<ConsoleFilter, number> = {
      all: telemetry.lines.length,
      info: 0,
      warning: 0,
      error: 0,
      chat: 0,
    };
    for (const line of telemetry.lines) c[line.level] += 1;
    return c;
  }, [telemetry.lines]);

  const visibleLines = useMemo(() => {
    const q = query.trim().toLowerCase();
    return telemetry.lines.filter(
      (line) =>
        (filter === "all" || line.level === filter) &&
        (!q || line.text.toLowerCase().includes(q))
    );
  }, [telemetry.lines, filter, query]);

  useEffect(() => {
    const el = screenRef.current;
    if (el && pinned) el.scrollTop = el.scrollHeight;
  }, [visibleLines, pinned]);

  const onScroll = () => {
    const el = screenRef.current;
    if (!el) return;
    setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
  };

  const jumpToLatest = () => {
    setPinned(true);
    const el = screenRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  const copyLines = async () => {
    try {
      await navigator.clipboard.writeText(visibleLines.map((line) => line.text).join("\n"));
      show(
        "Console copied",
        `${visibleLines.length} line${visibleLines.length === 1 ? "" : "s"} on your clipboard.`
      );
    } catch {
      show("Couldn’t copy", "Your browser blocked clipboard access.", "error");
    }
  };

  const shareLog = async () => {
    if (sharingLog) return;
    setSharingLog(true);
    try {
      const res = await fetch("/api/admin/server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "share_logs" }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        shareUrl?: string;
        link?: string;
        error?: string;
      };
      const url = data.url ?? data.shareUrl ?? data.link;
      if (!res.ok || !url) {
        show("Couldn’t share log", data.error ?? "Try again when server logs are available.", "error");
        return;
      }
      setSharedLogUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        show("Log shared", "Redacted mclo.gs URL copied to clipboard.");
      } catch {
        show("Log shared", url);
      }
    } catch {
      show("Couldn’t share log", "Check your connection and try again.", "error");
    } finally {
      setSharingLog(false);
    }
  };

  const sendCommand = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = command.trim();
    if (!trimmed || sendingCmd) return;
    setSendingCmd(true);
    try {
      const res = await fetch("/api/admin/server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "command", command: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        show("Command failed", data.error ?? "The server rejected the command.", "error");
        return;
      }
      setCommand("");
      setPinned(true);
      show("Command sent", trimmed);
      void onRefresh();
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        void onRefresh();
      }, 1500);
    } catch {
      show("Command failed", "Check your connection and try again.", "error");
    } finally {
      setSendingCmd(false);
    }
  };

  const filters: Array<{ id: ConsoleFilter; label: string }> = [
    { id: "all", label: "All" },
    { id: "info", label: "Info" },
    { id: "warning", label: "Warnings" },
    { id: "error", label: "Errors" },
    { id: "chat", label: "Chat" },
  ];
  const live = telemetry.source === "live";
  const filtered = filter !== "all" || query.trim().length > 0;

  return (
    <section className="ops-panel ops-console" aria-labelledby="console-title">
      <div className="ops-panel-head">
        <h2 id="console-title">Server console</h2>
        <span className="ops-label">
          <span className={`ops-dot ${live ? "is-live" : ""}`} aria-hidden="true" />
          {loading ? "Connecting" : live ? "Live snapshot" : "Unavailable"}
        </span>
      </div>
      <div className="ops-console-tools">
        <div className="ops-console-toolbar" role="group" aria-label="Filter console lines by level">
          {filters.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={filter === item.id}
              className={filter === item.id ? "active" : ""}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
              <span className="ops-chip-count">{counts[item.id]}</span>
            </button>
          ))}
        </div>
        <label className="ops-console-search">
          <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
          <input
            type="search"
            value={query}
            placeholder="Search the log…"
            aria-label="Search console lines"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="ops-console-copy"
          onClick={() => void copyLines()}
          disabled={visibleLines.length === 0}
        >
          <i className="fa-regular fa-copy" aria-hidden="true" /> Copy
        </button>
        <button
          type="button"
          className="ops-console-copy"
          onClick={() => void shareLog()}
          disabled={sharingLog}
        >
          <i
            className={`fa-solid ${sharingLog ? "fa-spinner fa-spin" : "fa-share-nodes"}`}
            aria-hidden="true"
          />{" "}
          {sharingLog ? "Sharing…" : "Share Log"}
        </button>
        {sharedLogUrl ? (
          <a
            href={sharedLogUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ops-console-share-link"
          >
            mclo.gs ↗
          </a>
        ) : null}
      </div>
      <div className="ops-console-wrap">
        <div
          ref={screenRef}
          onScroll={onScroll}
          className="ops-console-screen tall thin-scroll"
          role="log"
          aria-live="off"
          aria-label="Recent server console output"
        >
          {visibleLines.length ? (
            visibleLines.map((line) => (
              <div key={line.id} className={`ops-console-line ops-console-${line.level}`}>
                <span className="ops-log-level">{line.level}</span>
                <code>{line.text}</code>
              </div>
            ))
          ) : (
            <div className="ops-empty-console">
              <i className="fa-solid fa-terminal" aria-hidden="true" />
              <strong>
                {live ? (filtered ? "No lines match" : "No recent messages") : "Console unavailable"}
              </strong>
              <p>
                {live
                  ? filtered
                    ? "Try a different level or search term."
                    : "New output appears on the next refresh."
                  : "Waiting for a connection to the hosting panel."}
              </p>
            </div>
          )}
        </div>
        {!pinned && visibleLines.length > 0 ? (
          <button type="button" className="ops-console-jump" onClick={jumpToLatest}>
            <i className="fa-solid fa-arrow-down" aria-hidden="true" /> Latest
          </button>
        ) : null}
      </div>
      <form className="ops-console-command" onSubmit={(e) => void sendCommand(e)}>
        <span className="ops-console-prompt" aria-hidden="true">
          &gt;
        </span>
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder={
            serverOnline
              ? "Run server command (e.g. list, say Hello)…"
              : "Run server command (server is currently offline)…"
          }
          aria-label="Server console command"
          maxLength={256}
          disabled={sendingCmd}
        />
        <button type="submit" disabled={sendingCmd || !command.trim()}>
          <i
            className={`fa-solid ${sendingCmd ? "fa-spinner fa-spin" : "fa-paper-plane"}`}
            aria-hidden="true"
          />
          {sendingCmd ? "Sending…" : "Run"}
        </button>
      </form>
      <div className="ops-console-footer">
        <span>Admin console</span>
        <span>Refreshes every 45s</span>
        <span>{telemetry.sampledAt ? `Sampled ${timeAgo(telemetry.sampledAt)}` : "No sample yet"}</span>
      </div>
    </section>
  );
}

export function StatusClient() {
  const { show } = useToast();
  const { user, loading: sessionLoading } = useSession();
  const isAdmin = user?.role === "admin";
  const {
    data: status,
    error: statusError,
    refetch,
    loading: statusLoading,
  } = useApi<ServerStatus>("/api/status", fallbackStatus);
  // Admin-only endpoint: fetched once on load for Overview RAM metric, then
  // polled on an interval only while the Console tab is active.
  const {
    data: telemetry,
    refetch: refetchTelemetry,
    loading: telemetryLoading,
  } = useApi<ServerTelemetry>("/api/server/telemetry", EMPTY_TELEMETRY, isAdmin);
  const [tab, setTab] = useState<TabId>("overview");
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [activity, setActivity] = useState<ActivityPoint[]>([]);
  const [control, setControl] = useState<{ configured: boolean; allowed: boolean } | null>(null);
  const [controlError, setControlError] = useState(false);
  const [controlBusy, setControlBusy] = useState<"start" | "stop" | null>(null);
  const controlSeq = useRef(0);
  const { copied, copy } = useCopyAddress();

  const statusLive = !statusError && status.source === "live";
  const transitional =
    statusLive && ["loading", "starting", "stopping", "restarting"].includes(status.state ?? "");
  const rawOnline = statusLive && Boolean(status.online);
  const online = siteConfig.seasonLive ? rawOnline : isAdmin && rawOnline;
  const players = online ? (status.players ?? 0) : 0;
  const max = status.max ?? siteConfig.maxPlayers;
  const freeSlots = Math.max(max - players, 0);
  const capacityPct = max > 0 ? Math.min(100, Math.round((players / max) * 100)) : 0;
  const software = status.software ?? siteConfig.software;
  const version = status.version ?? siteConfig.version;

  const baseStyle = styleFor(status, statusLive);
  const stateColor = !siteConfig.seasonLive && !isAdmin
    ? rawOnline || transitional
      ? "#e0c38b"
      : "#a2a79b"
    : baseStyle.color;

  const heroLabel = !statusLive
    ? statusLoading
      ? "Checking"
      : "Signal lost"
    : !siteConfig.seasonLive && !isAdmin
      ? rawOnline || transitional
        ? "Pre-launch prep"
        : "Coming soon"
      : status.stateLabel ?? (rawOnline ? "Online" : "Offline");

  const heroDescription = !statusLive
    ? baseStyle.message
    : !siteConfig.seasonLive
      ? isAdmin
        ? rawOnline
          ? `${siteConfig.season} is online for pre-launch preparation (public launch flag is off).`
          : status.motd || `${siteConfig.season} is preparing to launch.`
        : rawOnline || transitional
          ? `${siteConfig.season} is in pre-launch testing — public access opens soon.`
          : `${siteConfig.season} is preparing to launch — the world opens soon.`
      : status.motd || baseStyle.message;

  const playerList = useMemo(
    () => (online ? [...(status.playerList ?? [])].sort((a, b) => a.localeCompare(b)) : []),
    [online, status.playerList]
  );

  const tabs = useMemo(() => {
    const list: TabId[] = ["overview", "players"];
    if (isAdmin) list.push("console");
    if (control?.allowed && siteConfig.seasonLive) list.push("manage");
    return list;
  }, [isAdmin, control]);

  useEffect(() => {
    if (!tabs.includes(tab)) setTab("overview");
  }, [tabs, tab]);

  const onTabListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.indexOf(tab);
    let next = -1;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    if (next >= 0) {
      event.preventDefault();
      setTab(tabs[next]);
      document.getElementById(`ops-tab-${tabs[next]}`)?.focus();
    }
  };

  const refreshControl = useCallback(() => {
    if (!siteConfig.seasonLive || sessionLoading) return;
    const seq = ++controlSeq.current;
    setControlError(false);
    fetch("/api/server/control")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { configured?: boolean; allowed?: boolean } | null) => {
        if (controlSeq.current !== seq) return;
        if (!data) {
          setControlError(true);
          return;
        }
        setControl({ configured: Boolean(data.configured), allowed: Boolean(data.allowed) });
      })
      .catch(() => {
        if (controlSeq.current === seq) setControlError(true);
      });
  }, [sessionLoading]);

  useEffect(() => {
    refreshControl();
    const seqRef = controlSeq;
    return () => {
      seqRef.current += 1;
    };
  }, [refreshControl]);

  // Status poll — paused when tab is hidden, refetched when visible.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== "hidden") void refetch();
    }, transitional ? 12_000 : 30_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refetch, transitional]);

  // Telemetry poll — only active when an admin is viewing the Console tab.
  useEffect(() => {
    if (!isAdmin || tab !== "console") return;
    void refetchTelemetry();
    const id = setInterval(() => {
      if (document.visibilityState !== "hidden") void refetchTelemetry();
    }, 45_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refetchTelemetry();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isAdmin, tab, refetchTelemetry]);

  // Only stamp updatedAt once a real status response arrives (never from fallbackStatus or error).
  useEffect(() => {
    if (statusLoading || statusError || status === fallbackStatus) return;
    setUpdatedAt(Date.now());
  }, [status, statusLoading, statusError]);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => {
      if (document.visibilityState !== "hidden") setNow(Date.now());
    }, 5_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") setNow(Date.now());
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Load non-expired local activity points on mount and prune points older than 6h.
  useEffect(() => {
    const cutoff = Date.now() - MAX_ACTIVITY_AGE_MS;
    try {
      const stored = JSON.parse(localStorage.getItem(ACTIVITY_STORAGE_KEY) ?? "[]") as ActivityPoint[];
      if (!Array.isArray(stored)) return;
      const fresh = stored
        .filter((p) => Number.isFinite(p.at) && p.at >= cutoff && Number.isFinite(p.players))
        .slice(-36);
      localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(fresh));
      setActivity(fresh);
    } catch {
      // Ignore storage errors.
    }
  }, []);

  useEffect(() => {
    if (!statusLive || (!siteConfig.seasonLive && !isAdmin)) return;
    const nowTs = Date.now();
    const cutoff = nowTs - MAX_ACTIVITY_AGE_MS;
    const nextPoint = { at: nowTs, players, max };
    try {
      const stored = JSON.parse(localStorage.getItem(ACTIVITY_STORAGE_KEY) ?? "[]") as ActivityPoint[];
      const safe = Array.isArray(stored)
        ? stored
            .filter(
              (point) =>
                Number.isFinite(point.at) && point.at >= cutoff && Number.isFinite(point.players)
            )
            .slice(-35)
        : [];
      const next = [...safe, nextPoint].slice(-36);
      localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(next));
      setActivity(next);
    } catch {
      setActivity((current) =>
        [...current.filter((p) => p.at >= cutoff), nextPoint].slice(-36)
      );
    }
  }, [statusLive, isAdmin, players, max, status]);

  const freshness = useMemo(() => {
    if (statusError) return "Check failed";
    if (updatedAt === null || now === null) return "Waiting for first check";
    const age = Math.max(0, Math.round((now - updatedAt) / 1000));
    return age < 8 ? "Checked just now" : `Checked ${age}s ago`;
  }, [now, updatedAt, statusError]);

  const refreshAll = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await Promise.all([refetch(), ...(isAdmin ? [refetchTelemetry()] : [])]);
    refreshControl();
    setRefreshing(false);
  };

  const runControl = async (action: "start" | "stop") => {
    if (controlBusy) return;
    if (action === "stop" && !window.confirm("Stop the server? Players will be disconnected.")) return;
    setControlBusy(action);
    try {
      const response = await fetch("/api/server/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        show(`Couldn’t ${action} the server`, data.error ?? "Try again in a moment.", "error");
        return;
      }
      show(action === "start" ? "Server starting" : "Server stopping", "Live tracking is active on this page.");
      void refetch();
    } catch {
      show(`Couldn’t ${action} the server`, "Something went wrong.", "error");
    } finally {
      setControlBusy(null);
    }
  };

  const canStart =
    statusLive &&
    (status.state === undefined ? !rawOnline : ["offline", "crashed"].includes(status.state));
  const canStop =
    statusLive && (status.state === undefined ? rawOnline : status.state === "online");

  const rosterMessage = !siteConfig.seasonLive && !isAdmin
    ? `${siteConfig.season} hasn’t opened yet — player activity appears here once the season launches.`
    : !statusLive
      ? "Player data is unavailable until the live signal returns."
      : !online
        ? "The realm is offline, so the roster is empty."
        : players > 0
          ? `${players} ${players === 1 ? "player is" : "players are"} online, but the server is not sharing names.`
          : "The realm is online and quiet right now.";

  const tabBadge = (id: TabId): number | null => {
    if (id === "players" && statusLive && (siteConfig.seasonLive || isAdmin)) return players;
    if (id === "console" && telemetry.source === "live") return telemetry.lines.length;
    return null;
  };

  return (
    <SubPage className="max-w-[1320px]">
      <div className="ops-dashboard" style={{ "--ops-state": stateColor } as CSSProperties}>
        <header className="ops-page-head">
          <div>
            <span className="ops-eyebrow">Techsteal / {siteConfig.season} · Java realm</span>
            <h1>Server status</h1>
          </div>
          <div className="ops-page-actions">
            <span className="ops-freshness">{freshness}</span>
            <button
              type="button"
              className="ops-button"
              onClick={() => void refreshAll()}
              disabled={refreshing}
            >
              <i
                className={`fa-solid fa-rotate-right ${refreshing ? "fa-spin" : ""}`}
                aria-hidden="true"
              />
              {refreshing ? "Checking…" : "Refresh"}
            </button>
          </div>
        </header>

        <section className="ops-summary" aria-labelledby="current-state-title">
          <div className="ops-summary-state">
            <span className="ops-label">
              <span className="ops-state-dot" aria-hidden="true" />
              {statusLoading && !statusLive
                ? "Checking connection"
                : statusLive
                  ? siteConfig.seasonLive || isAdmin
                    ? "Live server status"
                    : `${siteConfig.season} status`
                  : "Connection unavailable"}
            </span>
            <h2 id="current-state-title">{heroLabel}</h2>
            <p>{heroDescription}</p>
            {status.serverName && (siteConfig.seasonLive || isAdmin) ? (
              <span className="ops-server-name">{status.serverName}</span>
            ) : null}
            {transitional && (siteConfig.seasonLive || isAdmin) ? (
              <span className="ops-transition">
                <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" /> Checking every 12 seconds
              </span>
            ) : null}
          </div>
          <div className="ops-summary-join">
            <span className="ops-eyebrow">Java server address</span>
            <button type="button" className="ops-address" onClick={() => void copy()}>
              <span>{siteConfig.address}</span>
              <i className={`fa-regular ${copied ? "fa-circle-check" : "fa-copy"}`} aria-hidden="true" />
              <span className="sr-only">{copied ? "Address copied" : "Copy server address"}</span>
            </button>
            <Link href="/join" className="ops-join">
              How to join <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
            </Link>
          </div>
        </section>

        <div className="ops-tabs" role="tablist" aria-label="Server information" onKeyDown={onTabListKeyDown}>
          {tabs.map((id) => {
            const badge = tabBadge(id);
            return (
              <button
                key={id}
                id={`ops-tab-${id}`}
                type="button"
                role="tab"
                aria-selected={tab === id}
                aria-controls={`ops-panel-${id}`}
                tabIndex={tab === id ? 0 : -1}
                className={`ops-tab ${tab === id ? "is-active" : ""}`}
                onClick={() => setTab(id)}
              >
                <i className={`fa-solid ${TAB_META[id].icon}`} aria-hidden="true" />
                {TAB_META[id].label}
                {badge !== null ? <span className="ops-tab-badge">{badge}</span> : null}
              </button>
            );
          })}
        </div>

        {tab === "overview" ? (
          <div id="ops-panel-overview" role="tabpanel" aria-labelledby="ops-tab-overview" className="ops-tabpanel">
            <section className="ops-metrics" aria-label="Server overview">
              <div>
                <span>Players online</span>
                <strong>
                  {statusLive && (siteConfig.seasonLive || isAdmin) ? players : "—"}
                  <small> / {max}</small>
                </strong>
                <span>
                  {!siteConfig.seasonLive && !isAdmin
                    ? `${siteConfig.season} coming soon`
                    : statusLive
                      ? `${freeSlots} slots available`
                      : "Live data unavailable"}
                </span>
              </div>
              {isAdmin ? (
                <div>
                  <span>Memory allocated</span>
                  <strong>
                    {telemetry.source === "live" ? telemetry.ramGb ?? "—" : "—"}
                    <small>{telemetry.source === "live" && telemetry.ramGb !== null ? " GB" : ""}</small>
                  </strong>
                  <span>{telemetry.source === "live" ? "Host allocation" : "Telemetry unavailable"}</span>
                </div>
              ) : (
                <div>
                  <span>Current season</span>
                  <strong className="ops-metric-text">{siteConfig.season}</strong>
                  <span>
                    {siteConfig.seasonLive ? "Live now" : "Coming soon"} · {siteConfig.previousSeason} concluded
                  </span>
                </div>
              )}
              <div>
                <span>Minecraft version</span>
                <strong className="ops-metric-text">{version}</strong>
                <span>
                  {software}
                  {!statusLive ? " · configured" : ""}
                </span>
              </div>
              <div>
                <span>Access</span>
                <strong className="ops-metric-text">Whitelist</strong>
                <span>Members only</span>
              </div>
            </section>

            <div className="ops-content-grid">
              <div className="ops-main">
                <section className="ops-panel" aria-labelledby="activity-title">
                  <div className="ops-panel-head">
                    <h2 id="activity-title">Player activity</h2>
                  </div>
                  <ActivityChart points={activity} max={max} />
                </section>
              </div>
              <aside className="ops-side" aria-label="Server details">
                <section className="ops-panel" aria-labelledby="connection-title">
                  <div className="ops-panel-head">
                    <h2 id="connection-title">Server details</h2>
                    <i className="fa-solid fa-server" aria-hidden="true" />
                  </div>
                  <dl className="ops-details">
                    <div><dt>Edition</dt><dd>Java</dd></div>
                    <div><dt>Software</dt><dd>{software}</dd></div>
                    <div><dt>Version</dt><dd>{version}</dd></div>
                    <div><dt>Difficulty</dt><dd>{siteConfig.difficulty}</dd></div>
                    <div><dt>Whitelist</dt><dd>{siteConfig.whitelist}</dd></div>
                    <div><dt>Region</dt><dd>{siteConfig.location}</dd></div>
                    <div><dt>Status refresh</dt><dd>{transitional ? "12 seconds" : "30 seconds"}</dd></div>
                  </dl>
                </section>
                <div className="ops-source-note">
                  <i className={`fa-solid ${statusLive ? "fa-circle-check" : "fa-circle-info"}`} aria-hidden="true" />
                  <p>
                    {statusLive
                      ? "Status from the server host. Updates automatically."
                      : "The host is unavailable. Configuration details may be defaults."}
                  </p>
                </div>
              </aside>
            </div>
          </div>
        ) : null}

        {tab === "players" ? (
          <div id="ops-panel-players" role="tabpanel" aria-labelledby="ops-tab-players" className="ops-tabpanel">
            <section className="ops-panel" aria-labelledby="roster-title">
              <div className="ops-panel-head">
                <h2 id="roster-title">Online players</h2>
                <span className="ops-label">
                  {statusLive && (siteConfig.seasonLive || isAdmin) ? `${players} / ${max}` : "Unavailable"}
                </span>
              </div>
              <div className="ops-roster-body">
                {statusLive && (siteConfig.seasonLive || isAdmin) ? (
                  <>
                    <div
                      className="ops-capacity-track"
                      role="img"
                      aria-label={`${players} of ${max} player slots occupied`}
                    >
                      <span style={{ width: `${capacityPct}%` }} />
                    </div>
                    <div className="ops-capacity-labels">
                      <span>{capacityPct}% occupied</span>
                      <span>{freeSlots} slots open</span>
                    </div>
                  </>
                ) : null}
                {statusLive && online && playerList.length ? (
                  <div className="ops-player-grid wide">
                    {playerList.map((name) => (
                      <div key={name} className="ops-player">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={minotarUrl(name)} alt="" loading="lazy" width={32} height={32} />
                        <strong>{name}</strong>
                        <span className="ops-dot is-live" aria-hidden="true" />
                        <span className="sr-only">Online</span>
                      </div>
                    ))}
                    {playerList.length < players ? (
                      <p className="ops-helper">
                        {players} online; {playerList.length} names shared by the server.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="ops-roster-empty">
                    <i className="fa-solid fa-user-group" aria-hidden="true" />
                    <p>{rosterMessage}</p>
                  </div>
                )}
                <p className="ops-helper">
                  Names come live from the server host.{" "}
                  <Link href="/members" className="ops-inline-link">
                    Meet the community <i className="fa-solid fa-arrow-right" aria-hidden="true" />
                  </Link>
                </p>
              </div>
            </section>
          </div>
        ) : null}

        {tab === "console" && isAdmin ? (
          <div id="ops-panel-console" role="tabpanel" aria-labelledby="ops-tab-console" className="ops-tabpanel">
            <ConsolePanel
              telemetry={telemetry}
              loading={telemetryLoading}
              serverOnline={rawOnline}
              onRefresh={refetchTelemetry}
            />
          </div>
        ) : null}

        {tab === "manage" && control?.allowed && siteConfig.seasonLive ? (
          <div id="ops-panel-manage" role="tabpanel" aria-labelledby="ops-tab-manage" className="ops-tabpanel">
            <div className="ops-content-grid">
              <div className="ops-main">
                <section className="ops-panel" aria-labelledby="control-title">
                  <div className="ops-panel-head">
                    <h2 id="control-title">Server controls</h2>
                    <i className="fa-solid fa-sliders" aria-hidden="true" />
                  </div>
                  <div className="ops-control-body">
                    <div className="ops-control-buttons">
                      <button
                        type="button"
                        onClick={() => void runControl("start")}
                        disabled={controlBusy !== null || !canStart}
                      >
                        <i
                          className={`fa-solid ${controlBusy === "start" ? "fa-spinner fa-spin" : "fa-play"}`}
                          aria-hidden="true"
                        />{" "}
                        Start server
                      </button>
                      <button
                        type="button"
                        className="stop"
                        onClick={() => void runControl("stop")}
                        disabled={controlBusy !== null || !canStop}
                      >
                        <i
                          className={`fa-solid ${controlBusy === "stop" ? "fa-spinner fa-spin" : "fa-stop"}`}
                          aria-hidden="true"
                        />{" "}
                        Stop
                      </button>
                    </div>
                    <p className="ops-helper">
                      {transitional
                        ? "An operation is in progress."
                        : !statusLive
                          ? "Controls require live server status."
                          : rawOnline
                            ? "The server is accepting players."
                            : "Ready to start."}
                    </p>
                    <p className="ops-helper">
                      Every start/stop costs hosting credits and is rate-limited. Stopping disconnects all players — the world is saved first.
                    </p>
                  </div>
                </section>
              </div>
              <aside className="ops-side" aria-label="Control access">
                <section className="ops-panel" aria-labelledby="access-title">
                  <div className="ops-panel-head">
                    <h2 id="access-title">Who can manage</h2>
                    <i className="fa-solid fa-key" aria-hidden="true" />
                  </div>
                  <div className="ops-control-body">
                    <ul className="ops-access-list">
                      <li><i className="fa-solid fa-circle-check" aria-hidden="true" /> Admins — always</li>
                      <li><i className="fa-solid fa-circle-check" aria-hidden="true" /> Members verified in the official Discord</li>
                      <li><i className="fa-solid fa-circle-check" aria-hidden="true" /> Anyone granted the server-control permission</li>
                    </ul>
                    <p className="ops-helper">
                      Access is re-checked against the member database on every action, so it stays accurate even if a session is old.
                    </p>
                  </div>
                </section>
                <div className="ops-source-note">
                  <i className="fa-solid fa-circle-check" aria-hidden="true" />
                  <p>Connected to the hosting panel. Controls act on the {siteConfig.season} server.</p>
                </div>
              </aside>
            </div>
          </div>
        ) : null}

        {siteConfig.seasonLive && control !== null && control.configured && !control.allowed ? (
          <div className="ops-access-cta">
            <i className="fa-solid fa-lock" aria-hidden="true" />
            <p>
              {user
                ? "Verify your Discord membership to unlock server controls."
                : "Sign in to manage the server."}
            </p>
            <Link className="ops-button" href={user ? "/settings" : "/login?next=/status"}>
              {user ? "Verify membership" : "Sign in with Discord"}
              <i className="fa-solid fa-arrow-right" aria-hidden="true" />
            </Link>
          </div>
        ) : null}
        {siteConfig.seasonLive && control === null && controlError ? (
          <div className="ops-access-cta">
            <i className="fa-solid fa-circle-info" aria-hidden="true" />
            <p>Couldn’t check your control access.</p>
            <button type="button" className="ops-button" onClick={refreshControl}>
              Retry access check
            </button>
          </div>
        ) : null}
      </div>
    </SubPage>
  );
}
