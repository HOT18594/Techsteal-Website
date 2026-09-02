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

const STATE_STYLE: Record<
  string,
  { color: string; glow: string; icon: string; message: string; spin?: boolean }
> = {
  online: {
    color: "var(--emerald)",
    glow: "var(--emerald-glow)",
    icon: "fa-bolt",
    message: "All systems are responding. The realm is ready.",
  },
  starting: {
    color: "var(--diamond)",
    glow: "rgba(56,211,240,0.4)",
    icon: "fa-rocket",
    message: "Powering up the world. This screen will update automatically.",
  },
  loading: {
    color: "var(--diamond)",
    glow: "rgba(56,211,240,0.4)",
    icon: "fa-spinner",
    message: "Loading the world and preparing player data.",
    spin: true,
  },
  stopping: {
    color: "#ffd166",
    glow: "rgba(255,209,102,0.35)",
    icon: "fa-moon",
    message: "Saving progress and shutting down safely.",
  },
  restarting: {
    color: "var(--diamond)",
    glow: "rgba(56,211,240,0.4)",
    icon: "fa-rotate-right",
    message: "Restart in progress. Live checks are running faster.",
    spin: true,
  },
  crashed: {
    color: "var(--redstone)",
    glow: "var(--redstone-glow)",
    icon: "fa-triangle-exclamation",
    message: "The last run ended unexpectedly. Check the console below.",
  },
  pending: {
    color: "#ffd166",
    glow: "rgba(255,209,102,0.35)",
    icon: "fa-hourglass-half",
    message: "The host has queued the next server operation.",
  },
  offline: {
    color: "var(--muted)",
    glow: "rgba(124,145,184,0.18)",
    icon: "fa-power-off",
    message: "The realm is resting. Authorized members can start it here.",
  },
  unknown: {
    color: "var(--muted-2)",
    glow: "rgba(124,145,184,0.12)",
    icon: "fa-satellite-dish",
    message: "The live host did not answer. Try another status check.",
  },
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
  const height = 154;
  const inset = 12;
  const chartPoints = points.slice(-36);
  const coordinates = chartPoints.map((point, index) => {
    const x = chartPoints.length <= 1 ? inset : inset + (index / (chartPoints.length - 1)) * (width - inset * 2);
    const y = height - inset - (Math.min(point.players, max) / Math.max(max, 1)) * (height - inset * 2);
    return [x, y] as const;
  });
  const line = coordinates.map(([x, y]) => `${x},${y}`).join(" ");
  const area = coordinates.length > 1
    ? `${inset},${height - inset} ${line} ${width - inset},${height - inset}`
    : "";
  const peak = chartPoints.reduce((highest, point) => Math.max(highest, point.players), 0);

  return (
    <div className="status-chart-wrap">
      <div className="status-chart-summary">
        <span><strong>{chartPoints.length}</strong> live samples</span>
        <span>Peak <strong>{peak}</strong></span>
      </div>
      <svg
        className="status-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Player activity from ${chartPoints.length} live samples. Peak ${peak} of ${max} slots.`}
      >
        <defs>
          <linearGradient id="player-activity-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--diamond)" stopOpacity=".32" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g className="status-chart-grid" aria-hidden="true">
          <line x1={inset} y1="38" x2={width - inset} y2="38" />
          <line x1={inset} y1="77" x2={width - inset} y2="77" />
          <line x1={inset} y1="116" x2={width - inset} y2="116" />
        </g>
        {area ? <polygon points={area} fill="url(#player-activity-fill)" aria-hidden="true" /> : null}
        {line ? <polyline points={line} className="status-chart-line" aria-hidden="true" /> : null}
        {coordinates.map(([x, y], index) => (
          <circle key={`${x}-${index}`} cx={x} cy={y} r={index === coordinates.length - 1 ? 5 : 2.6} className="status-chart-point" />
        ))}
      </svg>
      {chartPoints.length < 2 ? (
        <p className="status-chart-empty">The activity graph fills with real samples while you keep this page open.</p>
      ) : null}
    </div>
  );
}

function ConsolePanel({ telemetry, loading }: { telemetry: ServerTelemetry; loading: boolean }) {
  const [filter, setFilter] = useState<ConsoleFilter>("all");
  const filters: Array<{ id: ConsoleFilter; label: string }> = [
    { id: "all", label: "All" },
    { id: "info", label: "Info" },
    { id: "warning", label: "Warnings" },
    { id: "error", label: "Errors" },
    { id: "chat", label: "Chat" },
  ];
  const visibleLines = telemetry.lines.filter((line) => filter === "all" || line.level === filter).slice(-16);

  return (
    <section className="status-console status-panel" aria-labelledby="console-title">
      <div className="status-panel-head console-head">
        <div>
          <span className="status-section-kicker"><i className="fa-solid fa-terminal" /> Diagnostics</span>
          <h2 id="console-title">Server console</h2>
        </div>
        <div className="console-live-badge">
          <span className={telemetry.source === "live" ? "is-live" : ""} />
          {loading ? "Connecting" : telemetry.source === "live" ? "Live snapshot" : "Unavailable"}
        </div>
      </div>
      <div className="console-toolbar" aria-label="Filter console lines">
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={filter === item.id}
            className={filter === item.id ? "active" : ""}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="console-screen thin-scroll" role="log" aria-live="off" aria-label="Recent server console output">
        <div className="console-command"><span>techsteal@realm</span>:~$ tail --live server.log</div>
        {visibleLines.length ? visibleLines.map((line) => (
          <div key={line.id} className={`console-line console-${line.level}`}>
            <span className="console-marker" aria-hidden="true" />
            <code>{line.text}</code>
          </div>
        )) : (
          <div className="console-empty">
            <i className="fa-solid fa-wave-square" aria-hidden="true" />
            {telemetry.source === "live"
              ? `No ${filter === "all" ? "recent" : filter} lines in this snapshot.`
              : "Console data will appear when the hosting panel is reachable."}
          </div>
        )}
      </div>
      <p className="console-footnote">
        Read-only snapshot · refreshes every 45 seconds · control characters are removed before display
      </p>
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
    fetch("/api/server/control")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { configured?: boolean; allowed?: boolean } | null) => {
        if (controlSeq.current !== seq || !data) return;
        setControl({ configured: Boolean(data.configured), allowed: Boolean(data.allowed) });
      })
      .catch(() => {});
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
    <SubPage className="max-w-[1500px]">
      <div
        className="status-ops"
        style={{ "--status-color": stateStyle.color, "--status-glow": stateStyle.glow } as CSSProperties}
      >
        <header className="status-page-header">
          <div>
            <span className="status-eyebrow"><i className="fa-solid fa-satellite-dish" /> Live realm operations</span>
            <h1 className="page-title">Server status</h1>
            <p>Everything you need to check, join, and operate Techsteal—without hunting through the site.</p>
          </div>
          <div className="status-header-actions">
            <span className="status-freshness" role="status" aria-live="polite">
              <i className="fa-regular fa-clock" aria-hidden="true" /> {freshness}
            </span>
            <button className="status-refresh" onClick={() => void refreshAll()} disabled={refreshing}>
              <i className={`fa-solid fa-rotate-right ${refreshing ? "fa-spin" : ""}`} aria-hidden="true" />
              {refreshing ? "Checking" : "Refresh all"}
            </button>
          </div>
        </header>

        <section className="status-command-deck" aria-labelledby="current-state-title">
          <div className="status-deck-grid" aria-hidden="true" />
          <div className="status-state-copy">
            <div className="status-state-label">
              <span className="status-state-dot" />
              {statusLoading && !statusLive ? "Establishing live signal" : "Current realm state"}
            </div>
            <h2 id="current-state-title">{heroLabel}</h2>
            <p className="status-state-message">
              {status.motd && statusLive ? status.motd : stateStyle.message}
            </p>
            {status.serverName ? <span className="status-server-name">{status.serverName}</span> : null}
            <div className="status-primary-actions">
              <button className="status-copy-address" onClick={() => void copy()}>
                <span>
                  <small>Java server address</small>
                  <strong>{siteConfig.address}</strong>
                </span>
                <i className={`fa-solid ${copied ? "fa-check" : "fa-copy"}`} aria-hidden="true" />
                <span className="sr-only">{copied ? "Address copied" : "Copy server address"}</span>
              </button>
              <Link href="/join" className="status-join-button">
                <i className="fa-solid fa-compass" aria-hidden="true" />
                Open join guide
              </Link>
            </div>
            {transitional && statusLive ? (
              <div className="status-transition-note">
                <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />
                Transition tracking is running every 12 seconds.
              </div>
            ) : null}
          </div>

          <div className="status-radar-wrap" role="img" aria-label={`Server is ${heroLabel}`}>
            <div className="status-radar-orbit orbit-one" />
            <div className="status-radar-orbit orbit-two" />
            <div className="status-radar-core">
              <i className={`fa-solid ${stateStyle.icon} ${stateStyle.spin ? "fa-spin" : ""}`} aria-hidden="true" />
            </div>
            <span className="radar-node node-one" />
            <span className="radar-node node-two" />
            <span className="radar-node node-three" />
          </div>
        </section>

        <section className="status-metric-rail" aria-label="Server overview">
          <div className="status-rail-metric">
            <span className="status-rail-icon"><i className="fa-solid fa-user-group" /></span>
            <div><small>Players online</small><strong>{statusLive ? players : "—"}<em>/{max}</em></strong></div>
          </div>
          <div className="status-rail-metric">
            <span className="status-rail-icon"><i className="fa-solid fa-door-open" /></span>
            <div><small>Open slots</small><strong>{statusLive ? freeSlots : "—"}</strong></div>
          </div>
          <div className="status-rail-metric">
            <span className="status-rail-icon"><i className="fa-solid fa-memory" /></span>
            <div><small>Memory allocated</small><strong>{telemetry.ramGb ?? "—"}<em>{telemetry.ramGb !== null ? " GB" : ""}</em></strong></div>
          </div>
          <div className="status-rail-metric">
            <span className="status-rail-icon"><i className="fa-solid fa-shield-halved" /></span>
            <div><small>Access mode</small><strong className="metric-word">Whitelist</strong></div>
          </div>
        </section>

        <div className="status-dashboard-grid">
          <div className="status-dashboard-main">
            <ConsolePanel telemetry={telemetry} loading={telemetryLoading} />

            <section className="status-panel status-activity" aria-labelledby="activity-title">
              <div className="status-panel-head">
                <div>
                  <span className="status-section-kicker"><i className="fa-solid fa-chart-line" /> Session telemetry</span>
                  <h2 id="activity-title">Player activity</h2>
                </div>
                <span className="status-panel-context">This device · latest 36 checks</span>
              </div>
              <ActivityChart points={activity} max={max} />
            </section>

            <section className="status-panel status-roster" aria-labelledby="roster-title">
              <div className="status-panel-head">
                <div>
                  <span className="status-section-kicker"><i className="fa-solid fa-gamepad" /> Live roster</span>
                  <h2 id="roster-title">Inside the realm</h2>
                </div>
                <span className={`roster-count ${online ? "online" : ""}`}>{statusLive ? `${players} online` : "Unknown"}</span>
              </div>
              <div className="status-capacity-track" role="img" aria-label={`${players} of ${max} player slots occupied`}>
                <span style={{ width: `${capacityPct}%` }} />
              </div>
              <div className="status-capacity-labels"><span>{capacityPct}% occupied</span><span>{freeSlots} slots open</span></div>
              {statusLive && online && playerList.length ? (
                <div className="status-player-grid">
                  {playerList.map((name) => (
                    <div key={name} className="status-player-chip">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={minotarUrl(name)} alt="" loading="lazy" width={34} height={34} />
                      <span><strong>{name}</strong><small>In game now</small></span>
                      <i className="fa-solid fa-signal" aria-label="Online" />
                    </div>
                  ))}
                  {playerList.length < players ? (
                    <p className="status-roster-note">The server reports {players} online but only shares {playerList.length} names.</p>
                  ) : null}
                </div>
              ) : (
                <div className="status-roster-empty">
                  <span><i className={`fa-solid ${online ? "fa-wind" : "fa-bed"}`} /></span>
                  <div><strong>No visible players</strong><p>{rosterMessage}</p></div>
                </div>
              )}
            </section>
          </div>

          <aside className="status-dashboard-side" aria-label="Server details and controls">
            <section className="status-panel status-capacity-card" aria-labelledby="capacity-title">
              <div className="status-panel-head compact">
                <div>
                  <span className="status-section-kicker"><i className="fa-solid fa-gauge-high" /> Load</span>
                  <h2 id="capacity-title">Realm capacity</h2>
                </div>
              </div>
              <div className="status-capacity-ring-row">
                <div
                  className="status-capacity-ring"
                  style={{ "--capacity-angle": `${capacityPct * 3.6}deg` } as CSSProperties}
                  role="img"
                  aria-label={`${capacityPct}% of player capacity in use`}
                >
                  <div><strong>{capacityPct}%</strong><span>occupied</span></div>
                </div>
                <dl className="status-capacity-facts">
                  <div><dt>Playing</dt><dd>{statusLive ? players : "—"}</dd></div>
                  <div><dt>Available</dt><dd>{statusLive ? freeSlots : "—"}</dd></div>
                  <div><dt>Total</dt><dd>{max}</dd></div>
                </dl>
              </div>
            </section>

            <section className="status-panel status-connection" aria-labelledby="connection-title">
              <div className="status-panel-head compact">
                <div>
                  <span className="status-section-kicker"><i className="fa-solid fa-link" /> Connection</span>
                  <h2 id="connection-title">Server details</h2>
                </div>
              </div>
              <button className="status-address-row" onClick={() => void copy()}>
                <span><small>Address</small><code>{siteConfig.address}</code></span>
                <i className={`fa-solid ${copied ? "fa-check" : "fa-copy"}`} aria-hidden="true" />
              </button>
              <dl className="status-detail-list">
                <div><dt>Version</dt><dd>{version}</dd></div>
                <div><dt>Software</dt><dd>{software}</dd></div>
                <div><dt>Difficulty</dt><dd>{siteConfig.difficulty}</dd></div>
                <div><dt>Whitelist</dt><dd className="is-good">{siteConfig.whitelist}</dd></div>
                <div><dt>Region</dt><dd>{siteConfig.location}</dd></div>
                <div><dt>Refresh</dt><dd>{transitional ? "12 seconds" : "30 seconds"}</dd></div>
              </dl>
            </section>

            <section className="status-panel status-control" aria-labelledby="control-title">
              <div className="status-panel-head compact">
                <div>
                  <span className="status-section-kicker"><i className="fa-solid fa-sliders" /> Operations</span>
                  <h2 id="control-title">Realm control</h2>
                </div>
              </div>
              {control === null ? (
                <div className="status-control-message"><i className="fa-solid fa-spinner fa-spin" /> Checking your access…</div>
              ) : !control.configured ? (
                <div className="status-control-message"><i className="fa-solid fa-lock" /> Host controls are not connected.</div>
              ) : control.allowed ? (
                <>
                  <div className="status-control-buttons">
                    <button onClick={() => void runControl("start")} disabled={controlBusy !== null || !canStart}>
                      <i className={`fa-solid ${controlBusy === "start" ? "fa-spinner fa-spin" : "fa-play"}`} /> Start
                    </button>
                    <button className="stop" onClick={() => void runControl("stop")} disabled={controlBusy !== null || !canStop}>
                      <i className={`fa-solid ${controlBusy === "stop" ? "fa-spinner fa-spin" : "fa-stop"}`} /> Stop
                    </button>
                  </div>
                  <p>{transitional ? "A server transition is already in progress." : online ? "The realm is online and accepting players." : "The realm is ready for an authorized start."}</p>
                </>
              ) : user ? (
                <div className="status-control-gate">
                  <p>Verify your Discord membership to unlock server operations.</p>
                  <Link href="/settings"><i className="fa-solid fa-user-check" /> Verify in settings</Link>
                </div>
              ) : (
                <div className="status-control-gate">
                  <p>Members can start or stop the realm after signing in.</p>
                  <Link href="/login"><i className="fa-brands fa-discord" /> Sign in with Discord</Link>
                </div>
              )}
            </section>

            <div className="status-source-note">
              <i className={`fa-solid ${statusLive ? "fa-circle-check" : "fa-triangle-exclamation"}`} aria-hidden="true" />
              <span><strong>{statusLive ? "Live host data" : "Fallback data"}</strong>{statusLive ? "Status is supplied by the server host and refreshed automatically." : "Live host data is temporarily unavailable. Displayed configuration values may be defaults."}</span>
            </div>
          </aside>
        </div>
      </div>
    </SubPage>
  );
}
