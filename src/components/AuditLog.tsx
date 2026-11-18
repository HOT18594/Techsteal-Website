"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import { timeAgo } from "@/lib/time";
import type { AuditEntry } from "@/types";

type AuditCategory = "all" | "server" | "members" | "content" | "moderation";

interface ActionMeta {
  icon: string;
  label: string;
  tone: string;
  category: Exclude<AuditCategory, "all">;
}

export const AUDIT_ACTION_META: Record<string, ActionMeta> = {
  // Server ops
  server_start: { icon: "fa-play", label: "started the server", tone: "is-green", category: "server" },
  server_stop: { icon: "fa-stop", label: "stopped the server", tone: "is-red", category: "server" },
  server_restart: { icon: "fa-rotate-right", label: "restarted the server", tone: "is-amber", category: "server" },
  server_command: { icon: "fa-terminal", label: "ran console command on", tone: "is-accent", category: "server" },
  server_ram: { icon: "fa-memory", label: "updated server RAM on", tone: "is-accent", category: "server" },
  whitelist_add: { icon: "fa-user-check", label: "whitelisted", tone: "is-green", category: "server" },
  whitelist_remove: { icon: "fa-user-minus", label: "removed from whitelist", tone: "is-amber", category: "server" },
  whitelist_sync: { icon: "fa-arrows-rotate", label: "synced whitelist", tone: "is-green", category: "server" },
  ops_add: { icon: "fa-crown", label: "granted operator to", tone: "is-amber", category: "server" },
  ops_remove: { icon: "fa-user-xmark", label: "revoked operator from", tone: "is-red", category: "server" },
  banlist_add: { icon: "fa-gavel", label: "banned player", tone: "is-red", category: "server" },
  banlist_remove: { icon: "fa-unlock", label: "pardoned player", tone: "is-green", category: "server" },

  // Member access
  ban: { icon: "fa-user-slash", label: "removed member", tone: "is-red", category: "members" },
  unban: { icon: "fa-rotate-left", label: "restored member", tone: "is-green", category: "members" },
  role_change: { icon: "fa-user-shield", label: "changed the role of", tone: "is-accent", category: "members" },
  permission_grant: { icon: "fa-plus", label: "granted access to", tone: "is-green", category: "members" },
  permission_revoke: { icon: "fa-minus", label: "revoked access from", tone: "is-amber", category: "members" },
  permissions_set: { icon: "fa-sliders", label: "set permissions for", tone: "is-accent", category: "members" },
  admin_code: { icon: "fa-key", label: "claimed admin via code", tone: "is-accent", category: "members" },
  member_update: { icon: "fa-user-pen", label: "updated profile for", tone: "is-accent", category: "members" },
  member_verify: { icon: "fa-circle-check", label: "updated Discord verification for", tone: "is-green", category: "members" },

  // Site content (announcements, rules, timeline)
  announcement_create: { icon: "fa-bullhorn", label: "published announcement", tone: "is-green", category: "content" },
  announcement_edit: { icon: "fa-pen", label: "edited announcement", tone: "is-accent", category: "content" },
  announcement_toggle: { icon: "fa-eye", label: "toggled announcement", tone: "is-amber", category: "content" },
  announcement_delete: { icon: "fa-trash", label: "deleted announcement", tone: "is-red", category: "content" },
  rule_create: { icon: "fa-scale-balanced", label: "created rule section", tone: "is-green", category: "content" },
  rule_update: { icon: "fa-pen-to-square", label: "updated rule section", tone: "is-accent", category: "content" },
  rule_delete: { icon: "fa-trash", label: "deleted rule section", tone: "is-red", category: "content" },
  rule_reorder: { icon: "fa-sort", label: "reordered rule sections", tone: "is-accent", category: "content" },
  timeline_create: { icon: "fa-clock-rotate-left", label: "added timeline milestone", tone: "is-green", category: "content" },
  timeline_update: { icon: "fa-pen-to-square", label: "updated timeline milestone", tone: "is-accent", category: "content" },
  timeline_delete: { icon: "fa-trash", label: "deleted timeline milestone", tone: "is-red", category: "content" },
  timeline_reorder: { icon: "fa-sort", label: "reordered timeline milestones", tone: "is-accent", category: "content" },

  // Moderation & storage
  thread_pin: { icon: "fa-thumbtack", label: "updated pin on thread", tone: "is-accent", category: "moderation" },
  thread_lock: { icon: "fa-lock", label: "updated lock on thread", tone: "is-amber", category: "moderation" },
  thread_edit: { icon: "fa-pen", label: "edited thread", tone: "is-accent", category: "moderation" },
  thread_delete: { icon: "fa-trash", label: "deleted thread", tone: "is-red", category: "moderation" },
  reply_pin: { icon: "fa-thumbtack", label: "updated pin on reply", tone: "is-accent", category: "moderation" },
  reply_edit: { icon: "fa-pen", label: "edited reply in", tone: "is-accent", category: "moderation" },
  reply_delete: { icon: "fa-trash", label: "deleted reply in", tone: "is-red", category: "moderation" },
  poll_end: { icon: "fa-square-poll-horizontal", label: "ended poll", tone: "is-amber", category: "moderation" },
  poll_delete: { icon: "fa-trash", label: "deleted poll", tone: "is-red", category: "moderation" },
  gallery_feature: { icon: "fa-star", label: "updated featured status on", tone: "is-accent", category: "moderation" },
  gallery_delete: { icon: "fa-trash", label: "deleted gallery build", tone: "is-red", category: "moderation" },
  gallery_comment_delete: { icon: "fa-comment-slash", label: "deleted build comment on", tone: "is-red", category: "moderation" },
  storage_cleanup: { icon: "fa-broom", label: "cleaned orphaned storage files", tone: "is-green", category: "moderation" },
};

const FALLBACK_META: ActionMeta = {
  icon: "fa-circle-info",
  label: "performed an action on",
  tone: "is-neutral",
  category: "moderation",
};

const CATEGORIES: Array<{ id: AuditCategory; label: string }> = [
  { id: "all", label: "All" },
  { id: "server", label: "Server" },
  { id: "members", label: "Members" },
  { id: "content", label: "Content" },
  { id: "moderation", label: "Moderation" },
];

export function AuditLog() {
  const { show } = useToast();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<AuditCategory>("all");
  const [limit, setLimit] = useState(200);

  const load = useCallback(
    async (initial = false, nextLimit = limit) => {
      if (initial) setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/audit?limit=${nextLimit}`, { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as { entries?: AuditEntry[]; error?: string };
        if (!res.ok) throw new Error(data.error || "Are you signed in as an admin?");
        setEntries(data.entries ?? []);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Are you signed in as an admin?";
        setError(message);
        show("Failed to load audit log", message, "error");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [limit, show]
  );

  useEffect(() => {
    void load(true, limit);
  }, [load, limit]);

  const normalizedQuery = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    return entries.filter((entry) => {
      const meta = AUDIT_ACTION_META[entry.action] ?? FALLBACK_META;
      if (category !== "all" && meta.category !== category) return false;
      if (!normalizedQuery) return true;
      return [entry.actorName, entry.targetName, entry.detail, entry.action, meta.label]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(normalizedQuery));
    });
  }, [entries, category, normalizedQuery]);

  const countsByCategory = useMemo(() => {
    const counts: Record<AuditCategory, number> = {
      all: entries.length,
      server: 0,
      members: 0,
      content: 0,
      moderation: 0,
    };
    for (const e of entries) {
      const cat = (AUDIT_ACTION_META[e.action] ?? FALLBACK_META).category;
      counts[cat]++;
    }
    return counts;
  }, [entries]);

  const exportCsv = () => {
    if (filtered.length === 0) return;
    const escapeCell = (val: string) => `"${(val ?? "").replace(/"/g, '""')}"`;
    const header = ["id", "timestamp", "actor_name", "actor_id", "action", "target_name", "target_id", "detail"].join(",");
    const lines = filtered.map((e) =>
      [
        String(e.id),
        escapeCell(e.createdAt),
        escapeCell(e.actorName),
        escapeCell(e.actorId),
        escapeCell(e.action),
        escapeCell(e.targetName),
        escapeCell(e.targetId),
        escapeCell(e.detail),
      ].join(",")
    );
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `techsteal-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    show("Exported", `Downloaded ${filtered.length} audit rows as CSV.`);
  };

  return (
    <section className="admin-directory audit-log" aria-label="Audit log">
      <div className="admin-directory-head">
        <div>
          <h2>Audit trail</h2>
          <p>Append-only record of member access changes, server commands, content edits, and moderation.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            aria-label="Maximum audit entries"
            className="admin-role-select !w-auto !px-3"
          >
            <option value={150}>Latest 150</option>
            <option value={300}>Latest 300</option>
            <option value={500}>Latest 500</option>
          </select>
          <button
            type="button"
            className="admin-action-btn"
            onClick={exportCsv}
            disabled={filtered.length === 0}
            title="Download filtered rows as CSV"
          >
            <i className="fa-solid fa-file-arrow-down" aria-hidden="true" /> Export CSV
          </button>
          <button
            type="button"
            className="admin-action-btn"
            onClick={() => void load(false, limit)}
            disabled={refreshing || loading}
            title="Refresh audit log"
          >
            <i className={`fa-solid fa-rotate ${refreshing ? "fa-spin" : ""}`} aria-hidden="true" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="admin-toolbar">
        <label className="admin-search">
          <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
          <span className="sr-only">Search audit trail</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search actor, target, command, or action…"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          ) : null}
        </label>
        <div className="admin-filters" role="group" aria-label="Filter by category">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={category === cat.id ? "is-active" : ""}
              aria-pressed={category === cat.id}
              onClick={() => setCategory(cat.id)}
            >
              {cat.label} <span>{countsByCategory[cat.id]}</span>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="audit-loading" aria-label="Loading audit log">
          {[0, 1, 2, 3, 4].map((row) => (
            <div key={row} />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          className="admin-empty"
          icon="fa-triangle-exclamation"
          title="Audit log is unavailable"
          hint={error}
          action={
            <button type="button" className="btn-secondary btn-sm" onClick={() => void load()}>
              <i className="fa-solid fa-rotate" aria-hidden="true" /> Retry
            </button>
          }
        />
      ) : entries.length === 0 ? (
        <EmptyState
          className="admin-empty"
          icon="fa-clipboard-list"
          title="No admin actions recorded yet"
          hint="Role changes, removals, server commands, content edits, and moderation will appear here."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          className="admin-empty"
          icon="fa-magnifying-glass"
          title="No audit entries match this filter"
          hint="Try clearing the search query or switching back to All categories."
          action={
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => {
                setQuery("");
                setCategory("all");
              }}
            >
              Clear filters
            </button>
          }
        />
      ) : (
        <>
          <ul className="audit-list">
            {filtered.map((e) => {
              const meta = AUDIT_ACTION_META[e.action] ?? FALLBACK_META;
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
                  <time className="audit-time" dateTime={e.createdAt} title={absoluteDate(e.createdAt)}>
                    {e.createdAt ? timeAgo(e.createdAt) : ""}
                  </time>
                </li>
              );
            })}
          </ul>
          <footer className="admin-directory-footer">
            <span>
              Showing {filtered.length} of {entries.length} loaded entries
            </span>
            <span>
              <i className="fa-solid fa-shield-halved" aria-hidden="true" /> Append-only audit log
            </span>
          </footer>
        </>
      )}
    </section>
  );
}

function absoluteDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-US");
}
