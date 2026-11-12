"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SubPage } from "@/components/SubPage";
import { useToast } from "@/components/Toast";
import { useCopyAddress } from "@/components/CopyIpButton";
import { fallbackStatus } from "@/lib/fallback-data";
import { minotarUrl } from "@/lib/minotar";
import { siteConfig } from "@/lib/site";
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

type ActivityPoint = { at: number; players: number; max: number };
type ConsoleFilter = "all" | ServerTelemetryLine["level"];

function styleFor(status: ServerStatus) {
  if (status.source !== "live") return STATE_STYLE.unknown;
  return STATE_STYLE[status.state ?? (status.online ? "online" : "offline")] ?? STATE_STYLE.unknown;
}

function ActivityChart({ points, max }: { points: ActivityPoint[]; max: number }) {
  const width = 680;
  const height = 150;
  const inset = 12;
  const chartPoints = points.slice(-36);
  if (!chartPoints.length) {
    return <div className="ops-chart-empty"><i className="fa-solid fa-chart-line" aria-hidden="true" /><p>No activity data yet</p></div>;
  }
  const coordinates = chartPoints.map((point, index) => {
    const x = chartPoints.length <= 1 ? inset : inset + (index / (chartPoints.length - 1)) * (width - inset * 2);
    const y = height - inset - (Math.min(point.players, max) / Math.max(max, 1)) * (height - inset * 2);
    return [x, y] as const;
  });
  const line = coordinates.map(([x, y]) => `${x},${y}`).join(" ");
  const peak = chartPoints.reduce((highest, point) => Math.max(highest, point.players), 0);
  return (
    <div className="ops-chart-wrap">
      <div className="ops-chart-labels"><span>{max} slots</span><span>Peak {peak}</span></div>
      <svg className="ops-chart" viewBox={`0 0 ${width} ${height}`} role="img"
        aria-label={`Player activity from ${chartPoints.length} live samples. Peak ${peak} of ${max} slots.`}>
        <g className="ops-chart-grid" aria-hidden="true">
          {[12, 54, 96, 138].map((y) => <line key={y} x1={inset} y1={y} x2={width - inset} y2={y} />)}
        </g>
        {line ? <polyline points={line} className="ops-chart-line" aria-hidden="true" /> : null}
        {coordinates.length ? <circle cx={coordinates[coordinates.length - 1][0]} cy={coordinates[coordinates.length - 1][1]} r={4} className="ops-chart-point" /> : null}
      </svg>
      <div className="ops-chart-labels"><span>{chartPoints.length} live {chartPoints.length === 1 ? "check" : "checks"} on this device</span><span>Latest</span></div>
      {chartPoints.length < 2 ? <p className="ops-helper">Waiting for more live samples.</p> : null}
    </div>
  );
}

function ConsolePanel({ telemetry, loading }: { telemetry: ServerTelemetry; loading: boolean }) {
  const [filter, setFilter] = useState<ConsoleFilter>("all");
  const filters: Array<{ id: ConsoleFilter; label: string }> = [
    { id: "all", label: "All" }, { id: "info", label: "Info" },
    { id: "warning", label: "Warnings" }, { id: "error", label: "Errors" }, { id: "chat", label: "Chat" },
  ];
  const visibleLines = telemetry.lines.filter((line) => filter === "all" || line.level === filter).slice(-16);
  return (
    <section className="ops-panel ops-console" aria-labelledby="console-title">
      <div className="ops-panel-head">
        <h2 id="console-title">Server console</h2>
        <span className="ops-label"><span className={`ops-dot ${telemetry.source === "live" ? "is-live" : ""}`} />
          {loading ? "Connecting" : telemetry.source === "live" ? "Live snapshot" : "Unavailable"}</span>
      </div>
      <div className="ops-console-toolbar" aria-label="Filter console lines">
        {filters.map((item) => <button key={item.id} type="button" aria-pressed={filter === item.id}
          className={filter === item.id ? "active" : ""} onClick={() => setFilter(item.id)}>{item.label}</button>)}
      </div>
      <div className="ops-console-screen thin-scroll" role="log" aria-live="off" aria-label="Recent server console output">
        {visibleLines.length ? visibleLines.map((line) => (
          <div key={line.id} className={`ops-console-line ops-console-${line.level}`}>
            <span className="ops-log-level">{line.level}</span><code>{line.text}</code>
          </div>
        )) : <div className="ops-empty-console"><i className="fa-solid fa-terminal" aria-hidden="true" />
          <strong>{telemetry.source === "live" ? `No ${filter === "all" ? "recent" : filter} messages` : "Console unavailable"}</strong>
          <p>{telemetry.source === "live" ? "New output appears on the next refresh." : "Waiting for a connection to the hosting panel."}</p>
        </div>}
      </div>
      <div className="ops-console-footer"><span>Read-only</span><span>Refreshes every 45s</span></div>
    </section>
  );
}

export default function StatusPage() {
  const { show } = useToast();
  const { user, loading: sessionLoading } = useSession();
  const { data: status, refetch, loading: statusLoading } = useApi<ServerStatus>("/api/status", fallbackStatus);
  const {
    data: telemetry,
    refetch: refetchTelemetry,
    loading: telemetryLoading,
  } = useApi<ServerTelemetry>("/api/server/telemetry", EMPTY_TELEMETRY);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [activity, setActivity] = useState<ActivityPoint[]>([]);
  const [control, setControl] = useState<{ configured: boolean; allowed: boolean } | null>(null);
  const [controlError, setControlError] = useState(false);
  const [controlBusy, setControlBusy] = useState<"start" | "stop" | null>(null);
  const controlSeq = useRef(0);
  const { copied, copy } = useCopyAddress();

  const transitional = ["loading", "starting", "stopping", "restarting"].includes(status.state ?? "");
  const statusLive = status.source === "live";
  const online = statusLive && Boolean(status.online);
  const players = statusLive ? (status.players ?? 0) : 0;
  const max = status.max ?? siteConfig.maxPlayers;
  const freeSlots = Math.max(max - players, 0);
  const capacityPct = max > 0 ? Math.min(100, Math.round((players / max) * 100)) : 0;
  const software = status.software ?? siteConfig.software;
  const version = status.version ?? siteConfig.version;
  const stateStyle = styleFor(status);
  const heroLabel = statusLive ? status.stateLabel ?? (online ? "Online" : "Offline") : "Signal lost";
  const playerList = useMemo(
    () => (statusLive ? [...(status.playerList ?? [])].sort((a, b) => a.localeCompare(b)) : []),
    [statusLive, status.playerList]
  );

  const refreshControl = useCallback(() => {
    if (sessionLoading) return;
    const seq = ++controlSeq.current;
    setControlError(false);
    fetch("/api/server/control")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { configured?: boolean; allowed?: boolean } | null) => {
        if (controlSeq.current !== seq) return;
        // A 429/503/network blip used to leave `control` null forever â€” an
        // eternal "Checking your accessâ€¦" spinner. Surface it with a retry.
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
    return () => { seqRef.current += 1; };
  }, [refreshControl]);

  useEffect(() => {
    const id = setInterval(() => void refetch(), transitional ? 12_000 : 30_000);
    return () => clearInterval(id);
  }, [refetch, transitional]);

  useEffect(() => {
    const id = setInterval(() => void refetchTelemetry(), 45_000);
    return () => clearInterval(id);
  }, [refetchTelemetry]);

  useEffect(() => {
    setUpdatedAt(Date.now());
  }, [status]);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!statusLive) return;
    const nextPoint = { at: Date.now(), players, max };
    try {
      const stored = JSON.parse(localStorage.getItem("techsteal-status-activity") ?? "[]") as ActivityPoint[];
      const safe = Array.isArray(stored)
        ? stored.filter((point) => Number.isFinite(point.at) && Number.isFinite(point.players)).slice(-35)
        : [];
      const next = [...safe, nextPoint].slice(-36);
      localStorage.setItem("techsteal-status-activity", JSON.stringify(next));
      setActivity(next);
    } catch {
      setActivity((current) => [...current, nextPoint].slice(-36));
    }
  }, [statusLive, players, max, status]);

  const freshness = useMemo(() => {
    if (updatedAt === null || now === null) return "Waiting for first check";
    const age = Math.max(0, Math.round((now - updatedAt) / 1000));
    return age < 8 ? "Checked just now" : `Checked ${age}s ago`;
  }, [now, updatedAt]);

  const refreshAll = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await Promise.all([refetch(), refetchTelemetry()]);
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
        show(`Couldnâ€™t ${action} the server`, data.error ?? "Try again in a moment.", "error");
        return;
      }
      show(action === "start" ? "Server starting" : "Server stopping", "Live tracking is active on this page.");
      void refetch();
    } catch {
      show(`Couldnâ€™t ${action} the server`, "Something went wrong.", "error");
    } finally {
      setControlBusy(null);
    }
  };

  const canStart = statusLive && (status.state === undefined ? !online : ["offline", "crashed"].includes(status.state));
  const canStop = statusLive && (status.state === undefined ? online : status.state === "online");

  const rosterMessage = !statusLive
    ? "Player data is unavailable until the live signal returns."
    : !online
      ? "The realm is offline, so the roster is empty."
      : players > 0
        ? `${players} ${players === 1 ? "player is" : "players are"} online, but the server is not sharing names.`
        : "The realm is online and quiet right now.";

  return (
    <SubPage className="max-w-[1320px]">
      <div className="ops-dashboard" style={{ "--ops-state": stateStyle.color } as CSSProperties}>
        <header className="ops-page-head">
          <div><span className="ops-eyebrow">Techsteal / Java realm</span><h1>Server status</h1></div>
          <div className="ops-page-actions">
            <span className="ops-freshness">{freshness}</span>
            <button className="ops-button" onClick={() => void refreshAll()} disabled={refreshing}>
              <i className={`fa-solid fa-rotate-right ${refreshing ? "fa-spin" : ""}`} aria-hidden="true" />
              {refreshing ? "Checking…" : "Refresh"}
            </button>
          </div>
        </header>

        <section className="ops-summary" aria-labelledby="current-state-title">
          <div className="ops-summary-state">
            <span className="ops-label"><span className="ops-state-dot" />{statusLoading && !statusLive ? "Checking connection" : statusLive ? "Live server status" : "Connection unavailable"}</span>
            <h2 id="current-state-title">{heroLabel}</h2>
            <p>{status.motd && statusLive ? status.motd : stateStyle.message}</p>
            {status.serverName ? <span className="ops-server-name">{status.serverName}</span> : null}
            {transitional && statusLive ? <span className="ops-transition"><i className="fa-solid fa-spinner fa-spin" aria-hidden="true" /> Checking every 12 seconds</span> : null}
          </div>
          <div className="ops-summary-join">
            <span className="ops-eyebrow">Java server address</span>
            <button className="ops-address" onClick={() => void copy()}>
              <span>{siteConfig.address}</span><i className={`fa-regular ${copied ? "fa-circle-check" : "fa-copy"}`} aria-hidden="true" />
              <span className="sr-only">{copied ? "Address copied" : "Copy server address"}</span>
            </button>
            <Link href="/join" className="ops-join">How to join <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" /></Link>
          </div>
        </section>

        <section className="ops-metrics" aria-label="Server overview">
          <div><span>Players online</span><strong>{statusLive ? players : "—"}<small> / {max}</small></strong><span>{statusLive ? `${freeSlots} slots available` : "Live data unavailable"}</span></div>
          <div><span>Memory allocated</span><strong>{telemetry.source === "live" ? telemetry.ramGb ?? "—" : "—"}<small>{telemetry.source === "live" && telemetry.ramGb !== null ? " GB" : ""}</small></strong><span>{telemetry.source === "live" ? "Host allocation" : "Telemetry unavailable"}</span></div>
          <div><span>Minecraft version</span><strong className="ops-metric-text">{version}</strong><span>{software}{!statusLive ? " · configured" : ""}</span></div>
          <div><span>Access</span><strong className="ops-metric-text">Whitelist</strong><span>Members only</span></div>
        </section>

        <div className="ops-content-grid">
          <div className="ops-main">
            <section className="ops-panel" aria-labelledby="activity-title">
              <div className="ops-panel-head"><h2 id="activity-title">Player activity</h2></div>
              <ActivityChart points={activity} max={max} />
            </section>

            <section className="ops-panel" aria-labelledby="roster-title">
              <div className="ops-panel-head"><h2 id="roster-title">Online players</h2><span className="ops-label">{statusLive ? `${players} / ${max}` : "Unavailable"}</span></div>
              <div className="ops-roster-body">
                {statusLive ? <><div className="ops-capacity-track" role="img" aria-label={`${players} of ${max} player slots occupied`}><span style={{ width: `${capacityPct}%` }} /></div><div className="ops-capacity-labels"><span>{capacityPct}% occupied</span><span>{freeSlots} slots open</span></div></> : null}
                {statusLive && online && playerList.length ? (
                  <div className="ops-player-grid">
                    {playerList.map((name) => <div key={name} className="ops-player">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={minotarUrl(name)} alt="" loading="lazy" width={32} height={32} /><strong>{name}</strong><span className="ops-dot is-live" aria-label="Online" />
                    </div>)}
                    {playerList.length < players ? <p className="ops-helper">{players} online; {playerList.length} names shared by the server.</p> : null}
                  </div>
                ) : <div className="ops-roster-empty"><i className="fa-solid fa-user-group" aria-hidden="true" /><p>{rosterMessage}</p></div>}
              </div>
            </section>

            <ConsolePanel telemetry={telemetry} loading={telemetryLoading} />
          </div>

          <aside className="ops-side" aria-label="Server details and controls">
            <section className="ops-panel" aria-labelledby="control-title">
              <div className="ops-panel-head"><h2 id="control-title">Server controls</h2><i className="fa-solid fa-sliders" aria-hidden="true" /></div>
              <div className="ops-control-body">
                {control === null ? controlError ? <div className="ops-control-message"><p>Couldn’t check your access.</p><button className="ops-text-button" onClick={refreshControl}>Retry access check <i className="fa-solid fa-arrow-right" aria-hidden="true" /></button></div>
                  : <p className="ops-helper"><i className="fa-solid fa-spinner fa-spin" aria-hidden="true" /> Checking your access…</p>
                : !control.configured ? <div className="ops-control-message"><span className="ops-control-icon"><i className="fa-solid fa-lock" aria-hidden="true" /></span><p>Host controls are not connected.</p></div>
                : control.allowed ? <>
                  <div className="ops-control-buttons"><button onClick={() => void runControl("start")} disabled={controlBusy !== null || !canStart}><i className={`fa-solid ${controlBusy === "start" ? "fa-spinner fa-spin" : "fa-play"}`} aria-hidden="true" /> Start server</button><button className="stop" onClick={() => void runControl("stop")} disabled={controlBusy !== null || !canStop}><i className={`fa-solid ${controlBusy === "stop" ? "fa-spinner fa-spin" : "fa-stop"}`} aria-hidden="true" /> Stop</button></div>
                  <p className="ops-helper">{transitional ? "An operation is in progress." : !statusLive ? "Controls require live server status." : online ? "The server is accepting players." : "Ready to start."}</p>
                </> : <div className="ops-control-message"><span className="ops-control-icon"><i className="fa-solid fa-lock" aria-hidden="true" /></span><p>{user ? "Verify your membership to access server controls." : "Sign in to manage the server."}</p><Link className="ops-button ops-control-link" href={user ? "/settings" : "/login"}>{user ? "Verify membership" : "Sign in with Discord"}<i className="fa-solid fa-arrow-right" aria-hidden="true" /></Link></div>}
              </div>
            </section>

            <section className="ops-panel" aria-labelledby="connection-title">
              <div className="ops-panel-head"><h2 id="connection-title">Server details</h2><i className="fa-solid fa-server" aria-hidden="true" /></div>
              <dl className="ops-details"><div><dt>Edition</dt><dd>Java</dd></div><div><dt>Software</dt><dd>{software}</dd></div><div><dt>Version</dt><dd>{version}</dd></div><div><dt>Difficulty</dt><dd>{siteConfig.difficulty}</dd></div><div><dt>Whitelist</dt><dd>{siteConfig.whitelist}</dd></div><div><dt>Region</dt><dd>{siteConfig.location}</dd></div><div><dt>Status refresh</dt><dd>{transitional ? "12 seconds" : "30 seconds"}</dd></div></dl>
            </section>
            <div className="ops-source-note"><i className={`fa-solid ${statusLive ? "fa-circle-check" : "fa-circle-info"}`} aria-hidden="true" /><p>{statusLive ? "Status from the server host. Updates automatically." : "The host is unavailable. Configuration details may be defaults."}</p></div>
          </aside>
        </div>
      </div>
    </SubPage>
  );
}
