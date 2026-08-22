"use client";

import { useEffect, useMemo, useState } from "react";
import { siteConfig } from "@/lib/site";
import { fallbackStatus } from "@/lib/fallback-data";
import type { ServerStatus } from "@/types";
import { useToast } from "@/components/Toast";
import { CopyIpButton } from "@/components/CopyIpButton";
import { SubPage } from "@/components/SubPage";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/use-session";
import { minotarUrl } from "@/lib/minotar";
import Link from "next/link";

/** Visual identity per exaroton state: color + icon + animation. */
const STATE_STYLE: Record<
  string,
  { color: string; glow: string; icon: string; spin: boolean }
> = {
  online: { color: "var(--emerald)", glow: "var(--emerald-glow)", icon: "fa-circle-check", spin: false },
  starting: { color: "var(--diamond)", glow: "rgba(56,211,240,0.4)", icon: "fa-rocket", spin: false },
  loading: { color: "var(--diamond)", glow: "rgba(56,211,240,0.4)", icon: "fa-spinner", spin: true },
  stopping: { color: "#ffd166", glow: "rgba(255,209,102,0.35)", icon: "fa-moon", spin: false },
  restarting: { color: "var(--diamond)", glow: "rgba(56,211,240,0.4)", icon: "fa-rotate-right", spin: true },
  crashed: { color: "var(--redstone)", glow: "var(--redstone-glow)", icon: "fa-triangle-exclamation", spin: false },
  pending: { color: "#ffd166", glow: "rgba(255,209,102,0.35)", icon: "fa-hourglass-half", spin: false },
  offline: { color: "var(--muted-2)", glow: "transparent", icon: "fa-circle-minus", spin: false },
  unknown: { color: "var(--muted-2)", glow: "transparent", icon: "fa-circle-question", spin: false },
};

function styleFor(status: ServerStatus) {
  return STATE_STYLE[status.state ?? (status.online ? "online" : "offline")] ?? STATE_STYLE.unknown;
}

export default function StatusPage() {
  const { show } = useToast();
  const { user, loading: sessionLoading } = useSession();
  const { data: STATUS, refetch, loading: statusLoading } = useApi<ServerStatus>(
    "/api/status",
    fallbackStatus
  );

  // Transitional states (loading/starting/…) flip within a minute or two,
  // so poll faster while one is active; steady states refresh every 30s.
  const transitional =
    STATUS.state === "loading" ||
    STATUS.state === "starting" ||
    STATUS.state === "stopping" ||
    STATUS.state === "restarting";
  useEffect(() => {
    const id = setInterval(() => void refetch(), transitional ? 12_000 : 30_000);
    return () => clearInterval(id);
  }, [refetch, transitional]);

  // Manual refresh shows its own spinner (the hook's `loading` is only true
  // for the first load, so pills never flicker on background refreshes).
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const statusLive = STATUS.source === "live";
  const style = styleFor(STATUS);
  const online = Boolean(STATUS.online);
  const players = statusLive ? (STATUS.players ?? 0) : 0;
  const max = STATUS.max ?? siteConfig.maxPlayers;
  const playerList = useMemo(
    () => (statusLive ? [...(STATUS.playerList ?? [])].sort((a, b) => a.localeCompare(b)) : []),
    [statusLive, STATUS.playerList]
  );
  const software = STATUS.software ?? siteConfig.software;
  const version = STATUS.version ?? siteConfig.version;

  // ------------------------------------------------------------------
  // Server control (start/stop via Exaroton) — capability from /api/
  // server/control, buttons gated by the LIVE state, not just online.
  // ------------------------------------------------------------------
  const [control, setControl] = useState<{ configured: boolean; allowed: boolean } | null>(null);
  const [controlBusy, setControlBusy] = useState<"start" | "stop" | null>(null);

  useEffect(() => {
    if (sessionLoading) return;
    if (!user) {
      setControl(null);
      return;
    }
    let cancelled = false;
    fetch("/api/server/control")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { configured?: boolean; allowed?: boolean } | null) => {
        if (!cancelled && d) setControl({ configured: !!d.configured, allowed: !!d.allowed });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, sessionLoading]);

  const runControl = async (action: "start" | "stop") => {
    if (controlBusy) return;
    if (action === "stop" && !window.confirm("Stop the server? Players will be kicked off.")) {
      return;
    }
    setControlBusy(action);
    try {
      const res = await fetch("/api/server/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        show("Couldn't " + (action === "start" ? "start" : "stop"), data.error ?? "Try again soon.");
        return;
      }
      show(
        action === "start" ? "Server starting" : "Server stopping",
        action === "start"
          ? "Kicking it up — this page tracks the boot automatically."
          : "Shutting down — players have been kicked."
      );
      // Immediate refetch so the state pill flips without waiting a tick.
      void refetch();
    } catch {
      show("Couldn't " + (action === "start" ? "start" : "stop"), "Something went wrong.", "error");
    } finally {
      setControlBusy(null);
    }
  };

  const canStart =
    STATUS.state === undefined
      ? !online
      : ["offline", "crashed"].includes(STATUS.state);
  const canStop =
    STATUS.state === undefined ? online : ["online"].includes(STATUS.state);

  return (
    <SubPage>
      <div className="w-full">
        {/* Header */}
        <div className="page-header rowed mb-8 gap-4">
          <div>
            <p className="page-kicker">
              <i className="fa-solid fa-signal" aria-hidden="true" />
              Live telemetry
            </p>
            <h1 className="page-title">Server Status</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              className="btn-ghost btn-sm"
              onClick={() => void refresh()}
              disabled={refreshing}
              aria-label="Refresh status"
              title="Refresh now"
            >
              <i className={`fa-solid fa-rotate-right ${refreshing ? "fa-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <div className={`status-pill ${online ? "" : "offline"}`}>
              <span className={`pulse-dot ${online ? "" : "muted"}`} />
              <span>{statusLoading && !statusLive ? "Checking…" : online ? "Online" : statusLive ? STATUS.stateLabel ?? "Offline" : "Unavailable"}</span>
            </div>
          </div>
        </div>

        {/* Hero state banner */}
        <div className="card p-6 sm:p-8 relative overflow-hidden">
          <div
            className="absolute inset-x-0 top-0 h-[2px]"
            style={{ background: `linear-gradient(90deg, transparent, ${style.color}, transparent)` }}
            aria-hidden="true"
          />
          <div className="flex flex-col lg:flex-row lg:items-center gap-6">
            {/* State block */}
            <div className="flex items-center gap-5 flex-1 min-w-0">
              <span
                className={`w-16 h-16 rounded-2xl border flex items-center justify-center text-2xl flex-shrink-0 ${
                  style.spin ? "animate-pulse" : ""
                }`}
                style={{
                  color: style.color,
                  borderColor: style.color.includes("var") ? `color-mix(in srgb, ${style.color} 45%, transparent)` : style.glow,
                  background: `color-mix(in srgb, ${style.color} 10%, transparent)`,
                  boxShadow: `0 0 26px -8px ${style.glow}`,
                }}
                aria-hidden="true"
              >
                <i className={`fa-solid ${style.icon} ${style.spin ? "fa-spin" : ""}`} />
              </span>
              <div className="min-w-0">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="font-display text-3xl font-bold" style={{ color: style.color }}>
                    {statusLive ? (STATUS.stateLabel ?? (online ? "Online" : "Offline")) : "Status unavailable"}
                  </span>
                  {STATUS.serverName ? (
                    <span className="text-sm text-[var(--muted)]">{STATUS.serverName}</span>
                  ) : null}
                </div>
                <p className="text-sm text-[var(--muted)] mt-1">
                  {!statusLive
                    ? "Can't reach the status services right now — try refreshing."
                    : STATUS.motd ?? (online ? "The realm is live — jump in!" : "The realm sleeps.")}
                </p>
              </div>
            </div>

            {/* Software chips */}
            <div className="flex flex-wrap gap-2 flex-shrink-0">
              {[
                { icon: "fa-cube", text: `${software}` },
                { icon: "fa-code-branch", text: `${version}` },
                { icon: "fa-location-dot", text: siteConfig.location },
              ].map((chip) => (
                <span
                  key={chip.text}
                  className="inline-flex items-center gap-2 text-xs font-semibold border border-[var(--border)] bg-[var(--bg-2)] rounded-lg px-3 py-2 text-[var(--fg-2)]"
                >
                  <i className={`fa-solid ${chip.icon} text-[var(--accent-bright)]`} />
                  {chip.text}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-5 mt-6 stagger">
          {/* Players */}
          <div className="card stat-card p-5 flex flex-col">
            <div className="stat-icon">
              <i className="fa-solid fa-users" />
            </div>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="stat-number">{players}</span>
              <span className="font-display text-lg text-[var(--muted-2)]">/{max}</span>
            </div>
            <div className="mt-1 text-xs text-[var(--muted)] uppercase tracking-wider">
              players online
            </div>
            <div className="mt-3 min-h-[2rem]">
              <span className="text-xs text-[var(--muted-2)]">
                {statusLive
                  ? online
                    ? "Live from the server panel."
                    : "The panel is reachable; the server is down."
                  : "Status data unavailable right now."}
              </span>
            </div>
          </div>

          {/* Connection readiness */}
          <div className="card stat-card p-5 flex flex-col">
            <div
              className="stat-icon"
              style={{ color: "var(--diamond)", borderColor: "rgba(56,211,240,0.4)", background: "rgba(56,211,240,0.08)" }}
            >
              <i className="fa-solid fa-plug-circle-check" />
            </div>
            <div className="mt-4">
              <span className="stat-number text-xl! leading-tight block">
                {online ? "Joinable" : statusLive ? STATUS.stateLabel ?? "Not joinable" : "Unknown"}
              </span>
            </div>
            <div className="mt-1 text-xs text-[var(--muted)] uppercase tracking-wider">
              connection state
            </div>
            <div className="mt-3 text-xs text-[var(--muted-2)]">
              {online
                ? `Point your client at ${siteConfig.address}`
                : transitional
                  ? "Hang tight — the server is mid-transition."
                  : "Start the server below to open the gates."}
            </div>
          </div>

          {/* In-game roster */}
          <div className="card stat-card p-5 flex flex-col">
            <div
              className="stat-icon"
              style={{ color: "var(--emerald)", borderColor: "var(--emerald-glow)", background: "var(--emerald-glow)" }}
            >
              <i className="fa-solid fa-user-group" />
            </div>
            <div className="mt-4">
              <span className="stat-number text-xl! leading-tight block">In-game now</span>
            </div>
            <div className="mt-1 text-xs text-[var(--muted)] uppercase tracking-wider">
              {playerList.length} {playerList.length === 1 ? "player" : "players"} on the server
            </div>
            <div className="mt-3 min-h-[2rem]">
              {online && playerList.length > 0 ? (
                <div className="space-y-1.5">
                  {playerList.map((name) => (
                    <span key={name} className="flex items-center gap-2 text-xs text-[var(--fg-2)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={minotarUrl(name)}
                        alt=""
                        loading="lazy"
                        width={18}
                        height={18}
                        className="rounded-[3px] image-render-pixel"
                      />
                      <span className="truncate">{name}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-[var(--muted-2)]">
                  {statusLive
                    ? online
                      ? "The realm is quiet right now."
                      : "Nobody here — the server is down."
                    : "Status data unavailable right now."}
                </span>
              )}
            </div>
          </div>

          {/* Software */}
          <div className="card stat-card p-5 flex flex-col">
            <div className="stat-icon">
              <i className="fa-solid fa-server" />
            </div>
            <div className="mt-4 flex items-baseline gap-1.5">
              <span className="stat-number text-xl! leading-tight">{software}</span>
            </div>
            <div className="mt-1 text-xs text-[var(--muted)] uppercase tracking-wider">
              {version}
            </div>
            <div className="mt-3 text-xs text-[var(--muted-2)]">
              {statusLive ? "Read straight from the panel." : `Default — usually ${siteConfig.software}.`}
            </div>
          </div>
        </div>

        {/* Connection info */}
        <div className="grid lg:grid-cols-3 gap-6 mt-10">
          <div className="lg:col-span-2 card p-6">
            <h2 className="font-display text-xl font-bold mb-5 flex items-center gap-2">
              <i className="fa-solid fa-server text-[var(--accent)]" />
              Connection
            </h2>
            <div className="space-y-2">
              {[
                ["Address", siteConfig.address, "code"],
                ["Version", `${version} · ${software}`, "text"],
                ["Difficulty", siteConfig.difficulty, "text"],
                ["Whitelist", siteConfig.whitelist, "emerald"],
                ["Location", siteConfig.location, "text"],
              ].map(([label, value, kind]) => (
                <div key={label as string} className="flex justify-between items-center gap-4 pb-2 border-b border-[var(--border)] last:border-b-0 last:pb-0">
                  <span className="text-sm text-[var(--muted)] flex-shrink-0">{label}</span>
                  <span className="min-w-0 text-right break-all">
                    {kind === "code" ? (
                      <code className="text-sm text-[var(--accent)] font-display">{value}</code>
                    ) : kind === "emerald" ? (
                      <span className="text-sm text-[var(--emerald)]">{value}</span>
                    ) : (
                      <span className="text-sm">{value}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-5">
              <CopyIpButton />
            </div>
          </div>

          {/* Pointer to the full how-to-join steps — one source of truth
              (this used to duplicate /join with a different step count). */}
          <div className="card p-6 flex flex-col">
            <h2 className="font-display text-xl font-bold mb-5 flex items-center gap-2">
              <i className="fa-solid fa-compass text-[var(--accent)]" />
              New here?
            </h2>
            <p className="text-sm text-[var(--muted)] mb-5 flex-1">
              The full step-by-step guide to joining the server — versions,
              whitelist and all.
            </p>
            <Link href="/join" className="btn-secondary justify-center">
              <i className="fa-solid fa-arrow-right" />
              How to Join
            </Link>
          </div>
        </div>

        {/* Server Control — start/stop the Minecraft server (verified members) */}
        {control && control.configured && (
          <div className="card p-6 mt-10">
            <h2 className="font-display text-xl font-bold mb-1 flex items-center gap-2">
              <i className="fa-solid fa-power-off text-[var(--accent)]" />
              Server Control
            </h2>
            <p className="text-sm text-[var(--muted)] mb-5">
              Start or stop the Minecraft server via the hosting panel. Requires Discord verification.
            </p>
            {control.allowed ? (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    className="btn-primary"
                    onClick={() => void runControl("start")}
                    disabled={controlBusy !== null || !canStart}
                  >
                    {controlBusy === "start" ? (
                      <i className="fa-solid fa-spinner fa-spin" />
                    ) : (
                      <i className="fa-solid fa-play" />
                    )}
                    Start Server
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => void runControl("stop")}
                    disabled={controlBusy !== null || !canStop}
                  >
                    {controlBusy === "stop" ? (
                      <i className="fa-solid fa-spinner fa-spin" />
                    ) : (
                      <i className="fa-solid fa-stop" />
                    )}
                    Stop Server
                  </button>
                  <span className="text-xs text-[var(--muted-2)]">
                    {transitional
                      ? "Transition in progress — this page updates itself."
                      : online
                        ? "Server is online — stop it to save credits."
                        : "The server is offline right now."}
                  </span>
                </div>
                {transitional ? (
                  <p className="text-xs text-[var(--diamond)] mt-3 flex items-center gap-2">
                    <i className="fa-solid fa-spinner fa-spin" />
                    Tracking the transition — the state above flips automatically.
                  </p>
                ) : null}
              </>
            ) : user ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <p className="text-sm text-[var(--muted)]">
                  Verify you&apos;re in the official Discord server to control the server.
                </p>
                <Link href="/settings" className="btn-primary sm:ml-auto shrink-0 justify-center">
                  <i className="fa-solid fa-user-check" />
                  Verify in Settings
                </Link>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <p className="text-sm text-[var(--muted)]">
                  Sign in with Discord to control the server.
                </p>
                <Link href="/login" className="btn-primary sm:ml-auto shrink-0 justify-center">
                  <i className="fa-brands fa-discord" />
                  Log in with Discord
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </SubPage>
  );
}
