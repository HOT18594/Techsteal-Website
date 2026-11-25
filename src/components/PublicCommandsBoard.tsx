"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { minotarUrl } from "@/lib/minotar";
import { siteConfig } from "@/lib/site";
import { timeAgo } from "@/lib/time";
import type {
  PublicCommandsResponse,
  ServerCommandSource,
  ServerCommandType,
} from "@/types";
import "./public-commands.css";

const EMPTY_RESPONSE: PublicCommandsResponse = {
  entries: [],
  stats: {
    total: 0,
    flagged: 0,
    gamemode: 0,
    give: 0,
    effect: 0,
    teleport: 0,
    operator: 0,
    uniqueActors: 0,
  },
  actors: [],
  lastSyncedAt: null,
  dbConnected: true,
  pagination: { page: 1, limit: 50, total: 0, hasMore: false },
};

type FilterKey = "all" | "flagged" | ServerCommandType;

const FILTER_META: Array<{ id: FilterKey; label: string; icon: string; alert?: boolean }> = [
  { id: "all", label: "All commands", icon: "fa-list" },
  { id: "flagged", label: "Flagged", icon: "fa-shield-halved", alert: true },
  { id: "gamemode", label: "Gamemode", icon: "fa-wand-magic-sparkles", alert: true },
  { id: "give", label: "Give & Items", icon: "fa-gift", alert: true },
  { id: "effect", label: "Effects & XP", icon: "fa-flask", alert: true },
  { id: "teleport", label: "Teleport", icon: "fa-location-crosshairs" },
  { id: "operator", label: "Operators", icon: "fa-crown" },
  { id: "world", label: "World", icon: "fa-earth-americas" },
  { id: "trigger", label: "Triggers", icon: "fa-bolt" },
  { id: "other", label: "Other", icon: "fa-terminal" },
];

const TYPE_LABELS: Record<ServerCommandType, string> = {
  gamemode: "Gamemode",
  give: "Give / Item",
  effect: "Effect / Enchant",
  teleport: "Teleport",
  operator: "Operator",
  world: "World",
  trigger: "Trigger",
  other: "Command",
};

const SOURCE_LABELS: Record<ServerCommandSource, string> = {
  ingame: "In-Game",
  server_console: "Server Console",
  web_console: "Web Console",
  playerlist: "Ops List",
};

function isSystemActor(actor: string): boolean {
  const lower = actor.trim().toLowerCase();
  return lower === "server" || lower === "console" || lower === "rcon" || lower === "@";
}

function formatFullTimestamp(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function PublicCommandsBoard() {
  const [data, setData] = useState<PublicCommandsResponse>(EMPTY_RESPONSE);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<FilterKey>("all");
  const [actorFilter, setActorFilter] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const reqSeq = useRef(0);

  // Debounce search typing
  useEffect(() => {
    const id = window.setTimeout(() => {
      setSearch(searchDraft.trim());
      setPage(1);
    }, 220);
    return () => window.clearTimeout(id);
  }, [searchDraft]);

  const fetchCommands = useCallback(
    async (opts?: { forceSync?: boolean; silent?: boolean }) => {
      const seq = ++reqSeq.current;
      if (opts?.forceSync) setSyncing(true);
      else if (!opts?.silent) setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          type: typeFilter,
          page: String(page),
          limit: "50",
        });
        if (actorFilter) params.set("actor", actorFilter);
        if (search) params.set("q", search);
        if (opts?.forceSync) params.set("sync", "1");

        const res = await fetch(`/api/commands?${params.toString()}`, {
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as
          | (PublicCommandsResponse & { error?: string })
          | null;

        if (reqSeq.current !== seq) return;
        if (!res.ok || !json) {
          throw new Error(json?.error || "Couldn't load the public command log.");
        }
        setData(json);
      } catch (err) {
        if (reqSeq.current !== seq) return;
        setError(err instanceof Error ? err.message : "Couldn't load the public command log.");
      } finally {
        if (reqSeq.current === seq) {
          setLoading(false);
          setSyncing(false);
        }
      }
    },
    [typeFilter, actorFilter, search, page]
  );

  useEffect(() => {
    void fetchCommands();
  }, [fetchCommands]);

  // Quietly refresh every 45s while the tab is visible
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void fetchCommands({ silent: true });
      }
    }, 45_000);
    return () => window.clearInterval(id);
  }, [fetchCommands]);

  const filterBadge = (id: FilterKey): number | null => {
    switch (id) {
      case "all":
        return data.stats.total;
      case "flagged":
        return data.stats.flagged;
      case "gamemode":
        return data.stats.gamemode;
      case "give":
        return data.stats.give;
      case "effect":
        return data.stats.effect;
      case "teleport":
        return data.stats.teleport;
      case "operator":
        return data.stats.operator;
      default:
        return null;
    }
  };

  const totalPages = Math.max(1, Math.ceil(data.pagination.total / data.pagination.limit));

  return (
    <div className="cmd-board">
      {/* Permanent transparency banner */}
      <section className="cmd-banner" aria-label="Anti-cheat transparency ledger">
        <div className="cmd-banner-copy">
          <span className="cmd-banner-icon" aria-hidden="true">
            <i className="fa-solid fa-shield-halved" />
          </span>
          <div>
            <h2>Permanent Public Command Ledger · {siteConfig.season}</h2>
            <p>
              Every gamemode switch, <code>/give</code>, <code>/effect</code>, teleport, operator
              change, and server command is automatically archived from Exaroton and stored
              permanently to prevent cheating. Entries are append-only and cannot be deleted.
            </p>
          </div>
        </div>
        <div className="cmd-banner-actions">
          <span className="cmd-sync-meta">
            {data.lastSyncedAt ? `Synced ${timeAgo(data.lastSyncedAt)}` : "Auto-sync active"}
          </span>
          <button
            type="button"
            className="cmd-sync-btn"
            disabled={syncing || loading}
            onClick={() => void fetchCommands({ forceSync: true })}
          >
            <i className={`fa-solid fa-rotate ${syncing ? "fa-spin" : ""}`} aria-hidden="true" />
            {syncing ? "Syncing…" : "Sync live logs"}
          </button>
        </div>
      </section>

      {/* KPI metrics */}
      <section className="cmd-kpis" aria-label="Command ledger summary">
        <div className="cmd-kpi">
          <span>Commands archived</span>
          <strong>{data.stats.total.toLocaleString("en-US")}</strong>
          <small>Stored permanently</small>
        </div>
        <div className="cmd-kpi">
          <span>Flagged alerts</span>
          <strong className={data.stats.flagged > 0 ? "is-alert" : ""}>
            {data.stats.flagged.toLocaleString("en-US")}
          </strong>
          <small>Gamemode, give, effect, OP, TP</small>
        </div>
        <div className="cmd-kpi">
          <span>Gamemode / Give / Effect</span>
          <strong>
            {(data.stats.gamemode + data.stats.give + data.stats.effect).toLocaleString("en-US")}
          </strong>
          <small>
            {data.stats.gamemode} gm · {data.stats.give} give · {data.stats.effect} effect
          </small>
        </div>
        <div className="cmd-kpi">
          <span>Unique accounts</span>
          <strong>{data.stats.uniqueActors.toLocaleString("en-US")}</strong>
          <small>Players &amp; consoles logged</small>
        </div>
      </section>

      {/* Ledger table & filters */}
      <section className="cmd-panel" aria-label="Permanent server command log">
        <div className="cmd-controls">
          <div className="cmd-filter-row" role="group" aria-label="Filter commands by category">
            {FILTER_META.map((item) => {
              const badge = filterBadge(item.id);
              const active = typeFilter === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  className={`cmd-chip ${active ? "is-active" : ""} ${item.alert ? "is-alert" : ""}`}
                  onClick={() => {
                    setTypeFilter(item.id);
                    setPage(1);
                  }}
                >
                  <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
                  {item.label}
                  {badge !== null ? (
                    <span className="cmd-chip-count">{badge.toLocaleString("en-US")}</span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="cmd-search-row">
            <label className="cmd-search">
              <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
              <span className="sr-only">Search command log</span>
              <input
                type="search"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                placeholder="Search player, item, gamemode, or command…"
              />
            </label>

            <select
              value={actorFilter}
              onChange={(e) => {
                setActorFilter(e.target.value);
                setPage(1);
              }}
              className="cmd-actor-select"
              aria-label="Filter by player or console"
            >
              <option value="">All players &amp; consoles</option>
              {data.actors.map((actor) => (
                <option key={actor} value={actor}>
                  {actor}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading && data.entries.length === 0 ? (
          <div className="cmd-empty">
            <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />
            <strong>Loading permanent command ledger…</strong>
            <p>Syncing the latest events from the server host.</p>
          </div>
        ) : error ? (
          <div className="cmd-empty">
            <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
            <strong>Couldn&apos;t load command log</strong>
            <p>{error}</p>
          </div>
        ) : data.entries.length === 0 ? (
          <div className="cmd-empty">
            <i className="fa-solid fa-shield-halved" aria-hidden="true" />
            <strong>
              {typeFilter !== "all" || actorFilter || search
                ? "No commands match this filter"
                : "No commands recorded yet"}
            </strong>
            <p>
              {typeFilter !== "all" || actorFilter || search
                ? "Try clearing the search query or switching back to All commands."
                : "Whenever anyone uses /gamemode, /give, /effect, or any server command, it will appear here permanently."}
            </p>
          </div>
        ) : (
          <div className="cmd-list" role="log" aria-label="Archived server commands">
            {data.entries.map((entry) => {
              const sys = isSystemActor(entry.actor);
              return (
                <article
                  key={entry.id}
                  className={`cmd-row is-${entry.severity}`}
                >
                  <div className="cmd-actor">
                    {sys ? (
                      <span className="cmd-actor-sys" aria-hidden="true">
                        <i className="fa-solid fa-terminal" />
                      </span>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={minotarUrl(entry.actor, 32)}
                        alt=""
                        width={28}
                        height={28}
                        loading="lazy"
                        className="cmd-actor-head"
                      />
                    )}
                    <div className="cmd-actor-meta">
                      <span className="cmd-actor-name">{entry.actor}</span>
                      <span className="cmd-actor-src">
                        {SOURCE_LABELS[entry.actorSource] ?? "Server"}
                      </span>
                    </div>
                  </div>

                  <div className="cmd-body">
                    <div className="cmd-badges">
                      <span className={`cmd-pill is-${entry.severity}`}>
                        {TYPE_LABELS[entry.commandType] ?? "Command"}
                      </span>
                      {entry.severity === "critical" ? (
                        <span className="cmd-pill is-critical">
                          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" /> Flagged
                        </span>
                      ) : null}
                    </div>
                    <code className="cmd-text">{entry.summary}</code>
                  </div>

                  <div className="cmd-time" title={formatFullTimestamp(entry.occurredAt)}>
                    <strong>{timeAgo(entry.occurredAt)}</strong>
                    <span>{formatFullTimestamp(entry.occurredAt)}</span>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {data.pagination.total > 0 ? (
          <div className="cmd-pagination">
            <span>
              Showing {((data.pagination.page - 1) * data.pagination.limit + 1).toLocaleString("en-US")}
              –
              {Math.min(
                data.pagination.page * data.pagination.limit,
                data.pagination.total
              ).toLocaleString("en-US")}{" "}
              of {data.pagination.total.toLocaleString("en-US")} archived command
              {data.pagination.total === 1 ? "" : "s"}
            </span>
            <div className="cmd-page-btns">
              <button
                type="button"
                className="cmd-sync-btn !min-h-[34px] !py-1 !px-3"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <i className="fa-solid fa-chevron-left" aria-hidden="true" /> Prev
              </button>
              <span>
                Page {page} / {totalPages}
              </span>
              <button
                type="button"
                className="cmd-sync-btn !min-h-[34px] !py-1 !px-3"
                disabled={!data.pagination.hasMore || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <i className="fa-solid fa-chevron-right" aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
