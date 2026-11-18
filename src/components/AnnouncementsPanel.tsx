"use client";

// Admin → Announcements. Publish a sitewide bar, preview how it renders under
// the navbar, edit its text/tone in place, toggle visibility, or delete it.

import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { timeAgo } from "@/lib/time";
import type { Announcement } from "@/types";

const TONES = [
  { value: "info", label: "Info", icon: "fa-bullhorn" },
  { value: "warning", label: "Warning", icon: "fa-triangle-exclamation" },
  { value: "critical", label: "Critical", icon: "fa-circle-exclamation" },
] as const;

export function AnnouncementsPanel() {
  const { show } = useToast();
  const [rows, setRows] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | "new" | "edit" | null>(null);

  // Composer state
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tone, setTone] = useState<string>("info");

  // Edit & delete modals
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editTone, setEditTone] = useState<string>("info");
  const [confirmDelete, setConfirmDelete] = useState<Announcement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/announcements", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as {
        announcements?: Announcement[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Couldn't load announcements.");
      setRows(data.announcements ?? []);
    } catch (err) {
      show("Load failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => {
    void load();
  }, [load]);

  const publish = async () => {
    if (title.trim().length < 3) {
      show("Title too short", "Use at least 3 characters.", "error");
      return;
    }
    setBusy("new");
    try {
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, tone }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't publish.");
      setTitle("");
      setBody("");
      setTone("info");
      show("Published", "The announcement bar is live on the site.");
      await load();
    } catch (err) {
      show("Publish failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (row: Announcement) => {
    setBusy(row.id);
    try {
      const nextActive = !row.active;
      const res = await fetch(`/api/announcements/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: nextActive }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't update.");
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, active: nextActive } : r)));
      show(nextActive ? "Shown" : "Hidden", nextActive ? "Announcement is visible again." : "Removed from the sitewide bar.");
    } catch (err) {
      show("Update failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setBusy(null);
    }
  };

  const openEdit = (row: Announcement) => {
    setEditing(row);
    setEditTitle(row.title);
    setEditBody(row.body ?? "");
    setEditTone(row.tone || "info");
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (editTitle.trim().length < 3) {
      show("Title too short", "Use at least 3 characters.", "error");
      return;
    }
    setBusy("edit");
    try {
      const res = await fetch(`/api/announcements/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim(),
          body: editBody.trim(),
          tone: editTone,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        announcement?: Announcement;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Couldn't save changes.");
      setEditing(null);
      show("Saved", "Announcement updated.");
      await load();
    } catch (err) {
      show("Save failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (row: Announcement) => {
    setBusy(row.id);
    try {
      const res = await fetch(`/api/announcements/${row.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Couldn't delete.");
      }
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setConfirmDelete(null);
      show("Deleted", "Announcement permanently removed.");
    } catch (err) {
      show("Delete failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setBusy(null);
    }
  };

  const primaryActiveId = rows.find((r) => r.active)?.id ?? null;
  const previewToneIcon =
    tone === "critical"
      ? "fa-circle-exclamation"
      : tone === "warning"
        ? "fa-triangle-exclamation"
        : "fa-bullhorn";

  return (
    <div className="grid gap-4">
      <section className="admin-directory">
        <div className="admin-directory-head">
          <div>
            <h2>Publish announcement</h2>
            <p>The newest active announcement renders as a dismissible bar directly below the navbar.</p>
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

        <div className="p-5 grid gap-3.5">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="announce-title" className="text-xs font-semibold text-[var(--fg-2)]">
                Headline
              </label>
              <span className="text-[11px] text-[var(--muted-2)] tabular-nums">{title.length}/120</span>
            </div>
            <input
              id="announce-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={120}
              placeholder="e.g. Maintenance window tonight at 9 PM EST"
              className="input"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="announce-body" className="text-xs font-semibold text-[var(--fg-2)]">
                Details <span className="text-[var(--muted-2)] font-normal">(optional, plain text)</span>
              </label>
              <span className="text-[11px] text-[var(--muted-2)] tabular-nums">{body.length}/400</span>
            </div>
            <textarea
              id="announce-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={400}
              rows={2}
              placeholder="Extra context shown alongside the headline on desktop screens…"
              className="input resize-y"
            />
          </div>

          {title.trim().length > 0 ? (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-2)] mb-1.5">
                Live banner preview
              </div>
              <div className={`announce-bar is-preview tone-${tone}`}>
                <div className="announce-inner">
                  <i className={`fa-solid ${previewToneIcon}`} aria-hidden="true" />
                  <strong>{title.trim()}</strong>
                  {body.trim() ? <span className="announce-text">{body.trim()}</span> : null}
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <div className="admin-filters" role="group" aria-label="Announcement tone">
              {TONES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={tone === option.value}
                  onClick={() => setTone(option.value)}
                  className={tone === option.value ? "is-active" : ""}
                >
                  <i className={`fa-solid ${option.icon}`} aria-hidden="true" />
                  {option.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void publish()}
              disabled={busy === "new" || title.trim().length < 3}
              className="btn-primary btn-sm ml-auto"
            >
              <i className="fa-solid fa-bullhorn" aria-hidden="true" />
              {busy === "new" ? "Publishing…" : "Publish"}
            </button>
          </div>
        </div>
      </section>

      <section className="admin-directory">
        <div className="admin-directory-head">
          <div>
            <h2>Announcement history</h2>
            <p>Hide an announcement to take it down while keeping it in history, or edit it in place.</p>
          </div>
          <span className="admin-pill is-accent">{rows.filter((r) => r.active).length} active</span>
        </div>

        {loading ? (
          <div className="admin-loading" aria-label="Loading announcements">
            {[0, 1, 2].map((r) => (
              <div key={r} />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            className="admin-empty"
            icon="fa-bullhorn"
            title="No announcements yet"
            hint="Publish an announcement above to display a banner across every page."
          />
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {rows.map((row) => {
              const isPrimary = row.id === primaryActiveId;
              return (
                <div key={row.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <span
                    className={`h-2 w-2 flex-none rounded-full ${
                      row.active ? "bg-[var(--emerald)]" : "bg-[var(--muted-2)]"
                    }`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm text-[var(--fg)]">{row.title}</span>
                      {isPrimary ? (
                        <span className="admin-pill is-good">
                          <i className="fa-solid fa-signal" aria-hidden="true" /> Showing on site
                        </span>
                      ) : row.active ? (
                        <span className="admin-pill">Queued active</span>
                      ) : (
                        <span className="admin-pill">Hidden</span>
                      )}
                      <span
                        className={`admin-pill ${
                          row.tone === "critical"
                            ? "is-bad"
                            : row.tone === "warning"
                              ? "is-warn"
                              : "is-accent"
                        }`}
                      >
                        {row.tone}
                      </span>
                    </div>
                    {row.body ? (
                      <p className="mt-0.5 text-xs text-[var(--muted)] line-clamp-2">{row.body}</p>
                    ) : null}
                    <div className="mt-1 text-[11px] text-[var(--muted-2)]">
                      By {row.authorName || "Admin"}
                      {row.createdAt ? ` · ${timeAgo(row.createdAt)}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEdit(row)}
                      disabled={busy === row.id}
                      className="admin-action-btn"
                      aria-label={`Edit ${row.title}`}
                    >
                      <i className="fa-solid fa-pen" aria-hidden="true" /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggle(row)}
                      disabled={busy === row.id}
                      className="admin-action-btn"
                    >
                      <i className={`fa-solid ${row.active ? "fa-eye-slash" : "fa-eye"}`} aria-hidden="true" />
                      {row.active ? "Hide" : "Show"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(row)}
                      disabled={busy === row.id}
                      aria-label={`Delete ${row.title}`}
                      className="admin-action-btn is-danger"
                    >
                      <i className="fa-solid fa-trash" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {editing ? (
        <Modal
          label={`Edit announcement: ${editing.title}`}
          onClose={() => {
            if (busy !== "edit") setEditing(null);
          }}
          cardClassName="admin-edit-modal"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-bold">Edit announcement</h2>
            <button
              type="button"
              onClick={() => setEditing(null)}
              disabled={busy === "edit"}
              className="admin-icon-button"
              aria-label="Close"
            >
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          </div>
          <div className="grid gap-3.5">
            <div>
              <label htmlFor="edit-announce-title" className="block text-xs font-semibold text-[var(--fg-2)] mb-1.5">
                Headline ({editTitle.length}/120)
              </label>
              <input
                id="edit-announce-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                maxLength={120}
                className="input"
              />
            </div>
            <div>
              <label htmlFor="edit-announce-body" className="block text-xs font-semibold text-[var(--fg-2)] mb-1.5">
                Details ({editBody.length}/400)
              </label>
              <textarea
                id="edit-announce-body"
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                maxLength={400}
                rows={3}
                className="input resize-y"
              />
            </div>
            <div>
              <span className="block text-xs font-semibold text-[var(--fg-2)] mb-1.5">Tone</span>
              <div className="admin-filters" role="group" aria-label="Edit tone">
                {TONES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={editTone === option.value}
                    onClick={() => setEditTone(option.value)}
                    className={editTone === option.value ? "is-active" : ""}
                  >
                    <i className={`fa-solid ${option.icon}`} aria-hidden="true" /> {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border)]">
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => setEditing(null)}
                disabled={busy === "edit"}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary btn-sm"
                onClick={() => void saveEdit()}
                disabled={busy === "edit" || editTitle.trim().length < 3}
              >
                {busy === "edit" ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {confirmDelete ? (
        <Modal
          label={`Delete ${confirmDelete.title}`}
          onClose={() => {
            if (busy !== confirmDelete.id) setConfirmDelete(null);
          }}
          cardClassName="admin-confirm-modal"
        >
          <div className="admin-confirm-icon">
            <i className="fa-solid fa-trash" aria-hidden="true" />
          </div>
          <div>
            <span className="admin-confirm-kicker">Delete announcement</span>
            <h2>Delete &ldquo;{confirmDelete.title}&rdquo;?</h2>
            <p>This permanently deletes the announcement from the database. To simply take it off the navbar, use Hide instead.</p>
          </div>
          <div className="admin-confirm-actions">
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => setConfirmDelete(null)}
              disabled={busy === confirmDelete.id}
            >
              Cancel
            </button>
            <button
              type="button"
              className="admin-confirm-remove"
              onClick={() => void remove(confirmDelete)}
              disabled={busy === confirmDelete.id}
            >
              <i className="fa-solid fa-trash" aria-hidden="true" /> Delete permanently
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
