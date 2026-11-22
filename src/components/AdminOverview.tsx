"use client";

import { useCallback, useEffect, useState } from "react";
import { AUDIT_ACTION_META } from "@/components/AuditLog";
import { AdminLaunchPanel } from "@/components/AdminLaunchPanel";
import { EmptyState } from "@/components/EmptyState";
import { useLaunchState } from "@/components/LaunchProvider";
import { useToast } from "@/components/Toast";
import { siteConfig } from "@/lib/site";
import { timeAgo } from "@/lib/time";
import type { AuditEntry, ServerStatus } from "@/types";

export type AdminSectionId =
  | "overview"
  | "members"
  | "server"
  | "content"
  | "moderation"
  | "audit";

interface OverviewResponse {
  members?: {
    active: number;
    banned: number;
    admins: number;
    verified: number;
    mcLinked: number;
    pendingSetup: number;
  };
  forum?: {
    threads: number;
    replies: number;
    activePolls: number;
  };
  gallery?: {
    builds: number;
    featured: number;
    comments: number;
  };
  content?: {
    activeAnnouncements: number;
    ruleSections: number;
    timelineEvents: number;
    seasonTimeline?: {
      exists: boolean;
      id: number | null;
      title: string | null;
      date: string | null;
      era: string | null;
    } | null;
  };
  hosting?: {
    exarotonConfigured: boolean;
    discordBotConfigured: boolean;
    storageConfigured: boolean;
    aiConfigured: boolean;
    status?: ServerStatus | null;
  };
  config?: {
    seasonLive?: boolean;
    seasonStart?: string;
  };
  auditEntries?: AuditEntry[];
  error?: string;
}

export function AdminOverview({
  onNavigate,
}: {
  onNavigate: (tab: AdminSectionId) => void;
}) {
  const { show } = useToast();
  const { launch } = useLaunchState();
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/overview", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as OverviewResponse;
      if (!res.ok) throw new Error(json.error || "Couldn't load overview.");
      setData(json);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't load overview.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const quickSeedRules = async () => {
    setBusyAction("rules");
    try {
      const res = await fetch("/api/admin/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seed_defaults" }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Couldn't seed rules.");
      show("Rules initialized", "Default server rule sections are now saved in the database.");
      await load();
    } catch (err) {
      show("Action failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setBusyAction(null);
    }
  };

  const quickSyncSeasonTimeline = async (mode: "prep" | "launch") => {
    setBusyAction("timeline");
    try {
      const effectiveStart = launch.enabled
        ? launch.launchAt.slice(0, 10)
        : (data?.config?.seasonStart ?? siteConfig.seasonStart);
      const res = await fetch("/api/admin/timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "season_transition",
          mode,
          launchDate: effectiveStart,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Couldn't update timeline.");
      show(
        "Timeline updated",
        mode === "launch"
          ? `${siteConfig.season} is marked live in the History timeline.`
          : `${siteConfig.season} is prepared as Coming soon in the History timeline.`
      );
      await load();
    } catch (err) {
      show("Action failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setBusyAction(null);
    }
  };

  if (error && !data) {
    return (
      <EmptyState
        className="admin-empty"
        icon="fa-triangle-exclamation"
        title="Overview unavailable"
        hint={error}
        action={
          <button type="button" className="btn-secondary btn-sm" onClick={() => void load()}>
            <i className="fa-solid fa-rotate" aria-hidden="true" /> Retry
          </button>
        }
      />
    );
  }

  const m = data?.members;
  const f = data?.forum;
  const g = data?.gallery;
  const c = data?.content;
  const h = data?.hosting;
  const status = h?.status;
  const serverLabel = status?.stateLabel ?? (status?.online ? "Online" : "Offline");

  const seasonLive = launch.configured ? launch.seasonLive : (data?.config?.seasonLive ?? siteConfig.seasonLive);
  const rulesReady = (c?.ruleSections ?? 0) > 0;
  const seasonTimeline = c?.seasonTimeline;
  const seasonEventExists = Boolean(seasonTimeline?.exists);
  const timelineReady = seasonLive
    ? Boolean(seasonEventExists && seasonTimeline?.date && !/coming soon/i.test(seasonTimeline.date))
    : seasonEventExists;

  return (
    <div className="grid gap-4">
      <section className="admin-metrics" aria-label="Sitewide KPIs">
        <div className="admin-metric">
          <span className="admin-metric-icon is-blue">
            <i className="fa-solid fa-users" aria-hidden="true" />
          </span>
          <div>
            <span>
              Members · {loading ? "—" : `${m?.verified ?? 0} verified · ${m?.mcLinked ?? 0} MC`}
            </span>
            <strong>{loading ? "—" : m?.active ?? 0}</strong>
          </div>
        </div>
        <div className="admin-metric">
          <span className="admin-metric-icon is-purple">
            <i className="fa-solid fa-comments" aria-hidden="true" />
          </span>
          <div>
            <span>
              Forum · {loading ? "—" : `${f?.replies ?? 0} replies · ${f?.activePolls ?? 0} polls`}
            </span>
            <strong>{loading ? "—" : f?.threads ?? 0}</strong>
          </div>
        </div>
        <div className="admin-metric">
          <span className="admin-metric-icon is-amber">
            <i className="fa-solid fa-images" aria-hidden="true" />
          </span>
          <div>
            <span>
              Gallery · {loading ? "—" : `${g?.featured ?? 0} featured · ${g?.comments ?? 0} comments`}
            </span>
            <strong>{loading ? "—" : g?.builds ?? 0}</strong>
          </div>
        </div>
        <div className="admin-metric">
          <span className={`admin-metric-icon ${status?.online ? "is-green" : "is-slate"}`}>
            <i className="fa-solid fa-server" aria-hidden="true" />
          </span>
          <div>
            <span>
              {siteConfig.season} · {seasonLive ? "Publicly live" : "Pre-launch prep"}
            </span>
            <strong>
              {loading
                ? "—"
                : status?.online
                  ? `${status.players ?? 0}/${status.max ?? siteConfig.maxPlayers}`
                  : serverLabel}
            </strong>
          </div>
        </div>
      </section>

      <AdminLaunchPanel />

      <div className="grid gap-4 lg:grid-cols-12">
        <section className="admin-directory lg:col-span-7">
          <div className="admin-directory-head">
            <div>
              <h2>{siteConfig.season} launch &amp; operations readiness</h2>
              <p>
                Current mode:{" "}
                <strong className="text-[var(--fg)]">
                  {seasonLive ? "Live Season" : "Preparing for Launch"}
                </strong>{" "}
                · Target {siteConfig.software} {siteConfig.version} ({siteConfig.address})
              </p>
            </div>
            <button
              type="button"
              className="admin-action-btn"
              onClick={() => void load()}
              disabled={loading}
            >
              <i className={`fa-solid fa-rotate ${loading ? "fa-spin" : ""}`} aria-hidden="true" /> Refresh
            </button>
          </div>

          <div className="divide-y divide-[var(--border)]">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--fg)]">
                  <i
                    className={`fa-solid ${
                      h?.exarotonConfigured ? "fa-circle-check text-[var(--emerald)]" : "fa-circle-exclamation text-[#ffd166]"
                    }`}
                    aria-hidden="true"
                  />
                  Exaroton Hosting &amp; Server Controls
                </div>
                <p className="text-xs text-[var(--muted)] mt-0.5">
                  {h?.exarotonConfigured
                    ? `Connected (${serverLabel}). Admins can boot, run console commands, and manage player lists.`
                    : "EXAROTON_TOKEN / EXAROTON_SERVER_ID not detected — falling back to public pings."}
                </p>
              </div>
              <button type="button" className="admin-action-btn" onClick={() => onNavigate("server")}>
                Open Server Ops <i className="fa-solid fa-arrow-right" aria-hidden="true" />
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--fg)]">
                  <i
                    className={`fa-solid ${
                      rulesReady ? "fa-circle-check text-[var(--emerald)]" : "fa-circle-minus text-[#ffd166]"
                    }`}
                    aria-hidden="true"
                  />
                  Server Rules in Database
                </div>
                <p className="text-xs text-[var(--muted)] mt-0.5">
                  {rulesReady
                    ? `${c?.ruleSections} rule section(s) stored in Postgres and editable live.`
                    : "Database table is empty — /rules is currently serving static fallback defaults."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!rulesReady && !loading ? (
                  <button
                    type="button"
                    className="admin-action-btn"
                    disabled={busyAction === "rules"}
                    onClick={() => void quickSeedRules()}
                  >
                    <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true" /> Seed Defaults
                  </button>
                ) : null}
                <button type="button" className="admin-action-btn" onClick={() => onNavigate("content")}>
                  Edit Rules
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--fg)]">
                  <i
                    className={`fa-solid ${
                      timelineReady ? "fa-circle-check text-[var(--emerald)]" : "fa-circle-exclamation text-[#ffd166]"
                    }`}
                    aria-hidden="true"
                  />
                  {siteConfig.season} Timeline Entry (Launch Step 3)
                </div>
                <p className="text-xs text-[var(--muted)] mt-0.5">
                  {seasonEventExists
                    ? `Found "${seasonTimeline?.title}" (${seasonTimeline?.date} · ${seasonTimeline?.era}).`
                    : `No ${siteConfig.season} milestone in database yet (${c?.timelineEvents ?? 0} total rows).`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="admin-action-btn"
                  disabled={busyAction === "timeline"}
                  onClick={() => void quickSyncSeasonTimeline(seasonLive ? "launch" : "prep")}
                  title="Update season timeline rows without SQL"
                >
                  <i className="fa-solid fa-bolt" aria-hidden="true" />{" "}
                  {seasonLive ? "Mark Launched" : "Sync Prep Row"}
                </button>
                <button type="button" className="admin-action-btn" onClick={() => onNavigate("content")}>
                  Timeline CMS
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--fg)]">
                  <i
                    className={`fa-solid ${
                      (m?.mcLinked ?? 0) > 0 ? "fa-circle-check text-[var(--emerald)]" : "fa-user-clock text-[#ffd166]"
                    }`}
                    aria-hidden="true"
                  />
                  {siteConfig.whitelist === "Enabled"
                    ? "Member Roster & Whitelist Readiness"
                    : "Member Roster (No Whitelist)"}
                </div>
                <p className="text-xs text-[var(--muted)] mt-0.5">
                  {m?.mcLinked ?? 0} member(s) linked a Minecraft IGN · {m?.pendingSetup ?? 0} account(s) still pending setup
                  {siteConfig.whitelist === "Disabled" ? " · Whitelist disabled" : ""}.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" className="admin-action-btn" onClick={() => onNavigate("members")}>
                  Members
                </button>
                {siteConfig.whitelist === "Enabled" ? (
                  <button type="button" className="admin-action-btn" onClick={() => onNavigate("server")}>
                    Sync Whitelist
                  </button>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-2)] mb-1.5">
                  Connected services
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className={`admin-pill ${h?.exarotonConfigured ? "is-good" : "is-warn"}`}>
                    Exaroton {h?.exarotonConfigured ? "Ready" : "Unset"}
                  </span>
                  <span className={`admin-pill ${h?.discordBotConfigured ? "is-good" : "is-warn"}`}>
                    Discord Bot {h?.discordBotConfigured ? "Ready" : "Unset"}
                  </span>
                  <span className={`admin-pill ${h?.storageConfigured ? "is-good" : "is-warn"}`}>
                    Storage Bucket {h?.storageConfigured ? "Ready" : "Unset"}
                  </span>
                  <span className={`admin-pill ${h?.aiConfigured ? "is-good" : "is-warn"}`}>
                    {siteConfig.assistant.name} AI {h?.aiConfigured ? "Ready" : "Unset"}
                  </span>
                  <span className="admin-pill is-accent">
                    {c?.activeAnnouncements ?? 0} Active Banner(s)
                  </span>
                </div>
              </div>
              <button type="button" className="admin-action-btn" onClick={() => onNavigate("moderation")}>
                Moderation Hub <i className="fa-solid fa-arrow-right" aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>

        <section className="admin-directory lg:col-span-5">
          <div className="admin-directory-head">
            <div>
              <h2>Recent admin activity</h2>
              <p>Latest privileged mutations across the server.</p>
            </div>
            <button type="button" className="admin-action-btn" onClick={() => onNavigate("audit")}>
              Full log <i className="fa-solid fa-arrow-right" aria-hidden="true" />
            </button>
          </div>

          {loading ? (
            <div className="audit-loading">
              {[0, 1, 2, 3].map((r) => (
                <div key={r} />
              ))}
            </div>
          ) : (data?.auditEntries ?? []).length === 0 ? (
            <EmptyState
              className="admin-empty"
              icon="fa-clipboard-list"
              title="No recent audit entries"
              hint="Admin actions will stream here automatically."
            />
          ) : (
            <ul className="audit-list">
              {(data?.auditEntries ?? []).map((e) => {
                const meta = AUDIT_ACTION_META[e.action] ?? {
                  icon: "fa-circle-info",
                  label: e.action,
                  tone: "is-neutral",
                };
                return (
                  <li key={e.id} className="audit-item">
                    <span className={`audit-icon ${meta.tone}`} aria-hidden="true">
                      <i className={`fa-solid ${meta.icon}`} />
                    </span>
                    <div className="audit-body">
                      <p className="audit-text">
                        <strong>{e.actorName || "System"}</strong> {meta.label}
                        {e.targetName ? (
                          <>
                            {" "}
                            <span className="audit-target">{e.targetName}</span>
                          </>
                        ) : null}
                      </p>
                      {e.detail ? <p className="audit-detail">{e.detail}</p> : null}
                    </div>
                    <time className="audit-time" dateTime={e.createdAt}>
                      {e.createdAt ? timeAgo(e.createdAt) : ""}
                    </time>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
