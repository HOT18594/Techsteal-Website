"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { siteConfig } from "@/lib/site";
import { fallbackStatus } from "@/lib/fallback-data";
import type { ServerStatus } from "@/types";
import { useToast } from "@/components/Toast";
import { useCopyAddress } from "@/components/CopyIpButton";
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
  // Unavailable status gets the neutral "unknown" look — never a green
  // online icon sitting next to "Status unavailable".
  if (status.source !== "live") return STATE_STYLE.unknown;
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
    // Also re-probe the control-panel capability — a one-shot miss must not
    // hide the card until the session changes.
    refreshControl();
    setRefreshing(false);
  };

  // "Updated Xs ago" ticker — both timestamps start null so the server and
  // the first client frame render nothing (no hydration mismatch), then the
  // effect stamps them client-side only.
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setUpdatedAt(Date.now());
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    setUpdatedAt(Date.now());
  }, [STATUS]);
  const updatedLabel = (() => {
    if (updatedAt === null || now === null) return null;
    const ageS = Math.max(0, Math.round((now - updatedAt) / 1000));
    return ageS < 8 ? "Updated just now" : `Updated ${ageS}s ago`;
  })();

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
  const capacityPct = max > 0 ? Math.min(100, Math.round((players / max) * 100)) : 0;

  // ------------------------------------------------------------------
  // Server control (start/stop via Exaroton) — capability from /api/
  // server/control, buttons gated by the LIVE state, not just online.
  // ------------------------------------------------------------------
  const [control, setControl] = useState<{ configured: boolean; allowed: boolean } | null>(null);
  const [controlBusy, setControlBusy] = useState<"start" | "stop" | null>(null);

  // One-shot probes are re-runnable: a single blipped request used to hide
  // the entire Server Control card until the next full session change.
  //
  // Staleness is handled with a sequence ref rather than a returned cleanup
  // closure: `refresh()` below also calls this, and it had no way to hold on
  // to a cleanup, so a manual refresh raced the effect's probe and whichever
  // response landed last won. Bumping the sequence makes only the newest
  // probe able to write.
  const controlSeq = useRef(0);
  const refreshControl = useCallback(() => {
    if (sessionLoading || !user) return;
    const seq = ++controlSeq.current;
    fetch("/api/server/control")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { configured?: boolean; allowed?: boolean } | null) => {
        if (controlSeq.current !== seq || !d) return;
        setControl({ configured: !!d.configured, allowed: !!d.allowed });
      })
      .catch(() => {});
  }, [user, sessionLoading]);

  useEffect(() => {
    refreshControl();
    // Abandon an in-flight probe's result on unmount / re-run. The ref is read
    // (and written) at cleanup time on purpose — that's the whole point of the
    // sequence guard, so the exhaustive-deps ref warning doesn't apply: there
    // is no "current at effect time" value we want here, we want the latest.
    const seqRef = controlSeq;
    return () => {
      seqRef.current++;
    };
  }, [refreshControl]);

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
        show("Couldn't " + (action === "start" ? "start" : "stop"), data.error ?? "Try again soon.", "error");
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

  // Start/Stop are gated on LIVE status only. The placeholder fallback
  // claims online:true, and acting on that could stop (or fail to start)
  // a server whose real state we simply don't know right now.
  const canStart =
    statusLive &&
    (STATUS.state === undefined ? !online : ["offline", "crashed"].includes(STATUS.state));
  const canStop =
    statusLive && (STATUS.state === undefined ? online : ["online"].includes(STATUS.state));

  const { copied, copy } = useCopyAddress();

  const heroLabel = statusLive
    ? STATUS.stateLabel ?? (online ? "Online" : "Offline")
    : "Status unavailable";

  const rosterEmpty = (() => {
    if (!statusLive)
      return { icon: "fa-satellite-dish", text: "Status data unavailable right now." };
    if (!online) return { icon: "fa-bed", text: "Nobody here — the server is down." };
    // Online with players but no names: the query protocol hides the list on
    // some setups. "The realm is quiet right now." directly contradicted the
    // "N playing" line right above it.
    if (players > 0)
      return {
        icon: "fa-user-secret",
        text: `${players} ${players === 1 ? "player is" : "players are"} online, but the server isn't sharing names.`,
      };
    return { icon: "fa-leaf", text: "The realm is quiet right now." };
  })();

  return (
    <SubPage>
      <div className="w-full">
        {/* Header */}
        <div className="page-header rowed mb-8 gap-4">
          <div>
            <h1 className="page-title">Server Status</h1>
          </div>
          <div className="flex items-center gap-3">
            {/* Single source of truth for freshness — the hero below is the
                one authoritative state display, so no duplicate pill here. */}
            <span className="text-xs text-[var(--muted-2)] whitespace-nowrap hidden sm:block">
              {updatedLabel}
            </span>
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
          </div>
        </div>

        {/* Hero — THE authoritative state display: big label + MOTD on the
            left, quick-glance metrics strip on the right, ambient glow
            tinted by the current state color. */}
        <div className="card p-6 sm:p-8 relative overflow-hidden">
          <div
            className="absolute inset-x-0 top-0 h-[2px]"
            style={{ background: `linear-gradient(90deg, transparent, ${style.color}, transparent)` }}
            aria-hidden="true"
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(560px 200px at 88% -30%, color-mix(in srgb, ${style.color} 14%, transparent), transparent 70%)`,
            }}
            aria-hidden="true"
          />
          <div className="relative flex flex-col xl:flex-row xl:items-center gap-7">
            <div className="flex items-center gap-5 flex-1 min-w-0">
              <span
                className={`w-16 h-16 rounded-2xl border flex items-center justify-center text-2xl flex-shrink-0 ${
                  style.spin ? "animate-pulse" : ""
                }`}
                style={{
                  color: style.color,
                  borderColor: style.color.includes("var")
                    ? `color-mix(in srgb, ${style.color} 45%, transparent)`
                    : style.glow,
                  background: `color-mix(in srgb, ${style.color} 10%, transparent)`,
                  boxShadow: `0 0 26px -8px ${style.glow}`,
                }}
                aria-hidden="true"
              >
                <i className={`fa-solid ${style.icon} ${style.spin ? "fa-spin" : ""}`} />
              </span>
              <div className="min-w-0">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="font-display text-3xl font-bold px-optical" style={{ color: style.color }}>
                    {heroLabel}
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
                {transitional && statusLive ? (
                  <p className="text-xs text-[var(--diamond)] mt-2 flex items-center gap-2">
                    <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />
                    Tracking the transition — this page updates itself.
                  </p>
                ) : null}
              </div>
            </div>

            {/* Quick-glance metric strip */}
            <div className="status-metrics flex-shrink-0 py-1 border-t border-[var(--border-strong)] pt-4 xl:border-0 xl:pt-0 flex-wrap gap-y-3">
              <div className="status-metric">
                <span className="status-metric-label">Players</span>
                <span className="status-metric-value px-optical" style={{ color: online ? "var(--emerald)" : undefined }}>
                  {statusLive ? `${players}/${max}` : "—"}
                </span>
              </div>
              <div className="status-metric">
                <span className="status-metric-label">Version</span>
                <span className="status-metric-value px-optical">{version}</span>
              </div>
              <div className="status-metric">
                <span className="status-metric-label">Software</span>
                <span className="status-metric-value px-optical">{software}</span>
              </div>
              <div className="status-metric">
                <span className="status-metric-label">Region</span>
                <span className="status-metric-value px-optical">{siteConfig.location}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Main dashboard grid — activity/control left, connection right */}
        <div className="grid lg:grid-cols-5 gap-6 mt-6 items-start">
          {/* ------------------------------------------------ left ---- */}
          <div className="lg:col-span-3 flex flex-col gap-6">
            {/* Who's in game */}
            <div className="card p-6">
              <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                <h2 className="font-display text-xl font-bold flex items-center gap-2">
                  <i className="fa-solid fa-user-group text-[var(--accent)]" />
                  <span className="px-optical">Who&apos;s in game</span>
                </h2>
                <span
                  className="text-xs font-bold px-2.5 py-1 rounded-full border"
                  style={{
                    color: statusLive ? (online ? "var(--emerald)" : "var(--muted)") : "var(--muted)",
                    borderColor:
                      statusLive && online
                        ? "color-mix(in srgb, var(--emerald) 40%, transparent)"
                        : "var(--border)",
                    background:
                      statusLive && online ? "rgba(34,197,94,0.08)" : "transparent",
                  }}
                >
                  {statusLoading && !statusLive
                    ? "Checking…"
                    : statusLive
                      ? `${players}/${max} online`
                      : "Unknown"}
                </span>
              </div>

              {/* Capacity meter */}
              <div className="capacity-bar" role="img" aria-label={`${players} of ${max} player slots in use`}>
                <span style={{ width: `${capacityPct}%` }} />
              </div>
              <div className="flex justify-between text-[11px] text-[var(--muted-2)] mt-1.5 mb-4">
                <span>{players} playing</span>
                <span>{Math.max(max - players, 0)} slots free</span>
              </div>

              {statusLive && online && playerList.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {playerList.map((name) => (
                    <span key={name} className="player-chip">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={minotarUrl(name)} alt="" loading="lazy" width={22} height={22} />
                      <span className="truncate max-w-[140px]">{name}</span>
                    </span>
                  ))}
                  {/* The count and the name list come from different fields:
                      the query protocol only returns a SAMPLE of names on many
                      servers, so "12 playing" next to 8 chips is correct, not
                      a bug. Say so rather than letting it read as one. */}
                  {playerList.length < players ? (
                    <span className="w-full text-[11px] text-[var(--muted-2)] mt-1">
                      Showing {playerList.length} of {players} names — the server only reports a
                      sample.
                    </span>
                  ) : null}
                </div>
              ) : (
                <div className="text-sm text-[var(--muted-2)] py-7 text-center border border-dashed border-[var(--border)] rounded-xl">
                  <i className={`fa-solid ${rosterEmpty.icon} text-2xl mb-2 block opacity-60`} />
                  {rosterEmpty.text}
                </div>
              )}
            </div>

            {/* Server Control — start/stop via Exaroton (verified members).
                Promoted next to the roster: it's the page's action center. */}
            {control && control.configured && (
              <div className="card p-6">
                <h2 className="font-display text-xl font-bold mb-1 flex items-center gap-2">
                  <i className="fa-solid fa-power-off text-[var(--accent)]" />
                  <span className="px-optical">Server Control</span>
                </h2>
                <p className="text-sm text-[var(--muted)] mb-5">
                  Start or stop the Minecraft server via the hosting panel.
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
                          ? "Transition in progress."
                          : online
                            ? "Server is online — stop it to save credits."
                            : "The server is offline right now."}
                      </span>
                    </div>
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

          {/* ----------------------------------------------- right ---- */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            {/* Connection — everything needed to actually join */}
            <div className="card p-6">
              <h2 className="font-display text-xl font-bold mb-5 flex items-center gap-2">
                <i className="fa-solid fa-server text-[var(--accent)]" />
                <span className="px-optical">Connection</span>
              </h2>
              <div className="space-y-2">
                <div className="flex justify-between items-center gap-3 pb-2 border-b border-[var(--border)]">
                  <span className="text-sm text-[var(--muted)] flex-shrink-0">Address</span>
                  <span className="min-w-0 flex items-center gap-2">
                    <code className="text-sm text-[var(--accent)] font-display break-all">
                      {siteConfig.address}
                    </code>
                    <button
                      onClick={() => void copy()}
                      className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
                      aria-label="Copy server address"
                      title="Copy address"
                    >
                      <i className={`fa-solid ${copied ? "fa-check text-[var(--emerald)]" : "fa-copy"}`} />
                    </button>
                  </span>
                </div>
                {([
                  // `as const` tuples: without them TS widened every row to
                  // string[], which cost a `label as string` cast on the key
                  // and let a typo in `kind` pass unnoticed.
                  ["Version", `${version} · ${software}`, "text"],
                  ["Difficulty", siteConfig.difficulty, "text"],
                  ["Whitelist", siteConfig.whitelist, "emerald"],
                  ["Location", siteConfig.location, "text"],
                ] as const satisfies readonly (readonly [string, string, "text" | "emerald"])[]).map(
                  ([label, value, kind]) => (
                  <div key={label} className="flex justify-between items-center gap-4 pb-2 border-b border-[var(--border)] last:border-b-0 last:pb-0">
                    <span className="text-sm text-[var(--muted)] flex-shrink-0">{label}</span>
                    <span className="min-w-0 text-right break-all">
                      {kind === "emerald" ? (
                        <span className="text-sm text-[var(--emerald)]">{value}</span>
                      ) : (
                        <span className="text-sm">{value}</span>
                      )}
                    </span>
                  </div>
                  )
                )}
              </div>
              <Link href="/join" className="btn-secondary w-full justify-center mt-5">
                <i className="fa-solid fa-compass" />
                New here? Full join guide
              </Link>
            </div>

            {/* Data provenance footnote */}
            <div className="card p-4 flex items-start gap-3 text-xs text-[var(--muted-2)] leading-relaxed">
              <i className={`fa-solid mt-0.5 ${statusLive ? "fa-satellite-dish text-[var(--emerald)]" : "fa-triangle-exclamation text-[#ffd166]"}`} />
              <span>
                {statusLive
                  ? "Live from the Exaroton hosting panel — refreshes itself every 30s automatically."
                  : "The panel can't be reached right now, so values above fall back to defaults."}
              </span>
            </div>
          </div>
        </div>
      </div>
    </SubPage>
  );
}
