"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import { timeAgo } from "@/lib/time";
import type { AuditEntry } from "@/types";

const ACTION_META: Record<string, { icon: string; label: string; tone: string }> = {
  server_start: { icon: "fa-play", label: "started the server", tone: "is-green" },
  server_stop: { icon: "fa-stop", label: "stopped the server", tone: "is-red" },
  ban: { icon: "fa-user-slash", label: "removed", tone: "is-red" },
  unban: { icon: "fa-rotate-left", label: "restored", tone: "is-green" },
  role_change: { icon: "fa-user-shield", label: "changed the role of", tone: "is-accent" },
  permission_grant: { icon: "fa-plus", label: "granted access to", tone: "is-green" },
  permission_revoke: { icon: "fa-minus", label: "revoked access from", tone: "is-amber" },
  permissions_set: { icon: "fa-sliders", label: "set permissions for", tone: "is-accent" },
  admin_code: { icon: "fa-key", label: "claimed admin via code", tone: "is-accent" },
};

const FALLBACK_META = { icon: "fa-circle-info", label: "performed an action on", tone: "is-neutral" };

export function AuditLog() {
  const { show } = useToast();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/audit", { cache: "no-store" });
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
  }, [show]);

  useEffect(() => {
    void load(true);
  }, [load]);

  return (
    <section className="admin-directory audit-log" aria-label="Audit log">
      <div className="admin-directory-head">
        <div>
          <h2>Audit log</h2>
          <p>Every privileged action — role and access changes, removals, server control — newest first.</p>
        </div>
        <button
          type="button"
          className="admin-refresh"
          onClick={() => void load()}
          disabled={refreshing || loading}
          title="Refresh audit log"
        >
          <i className={`fa-solid fa-rotate ${refreshing ? "fa-spin" : ""}`} /><span>Refresh</span>
        </button>
      </div>

      {loading ? (
        <div className="audit-loading" aria-label="Loading audit log">
          {[0, 1, 2, 3, 4].map((row) => <div key={row} />)}
        </div>
      ) : error ? (
        <EmptyState
          className="admin-empty"
          icon="fa-triangle-exclamation"
          title="Audit log is unavailable"
          hint={error}
          action={<button type="button" className="btn-secondary btn-sm" onClick={() => void load()}><i className="fa-solid fa-rotate" /> Retry</button>}
        />
      ) : entries.length === 0 ? (
        <EmptyState
          className="admin-empty"
          icon="fa-clipboard-list"
          title="No admin actions recorded yet"
          hint="Role changes, removals, admin-code claims and server start/stop will appear here."
        />
      ) : (
        <ul className="audit-list">
          {entries.map((e) => {
            const meta = ACTION_META[e.action] ?? FALLBACK_META;
            return (
              <li key={e.id} className="audit-item">
                <span className={`audit-icon ${meta.tone}`} aria-hidden="true">
                  <i className={`fa-solid ${meta.icon}`} />
                </span>
                <div className="audit-body">
                  <p className="audit-text">
                    <strong>{e.actorName || "System"}</strong> {meta.label}
                    {e.targetName ? <> <span className="audit-target">{e.targetName}</span></> : null}
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
      )}
    </section>
  );
}

function absoluteDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-US");
}