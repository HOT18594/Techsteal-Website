"use client";

// Admin → Announcements. Publish a sitewide bar, hide/show it, or delete it.
// The list comes from the admin endpoint (all rows); publishing and toggling
// go through the public REST endpoints so the permissions logic lives in one
// place per operation.

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";

interface Row {
  id: number;
  title: string;
  body: string;
  tone: string;
  active: boolean;
  authorName: string;
  createdAt: string | null;
}

const TONES = [
  { value: "info", label: "Info" },
  { value: "warning", label: "Warning" },
  { value: "critical", label: "Critical" },
] as const;

export function AnnouncementsPanel() {
  const { show } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | "new" | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tone, setTone] = useState<string>("info");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/announcements");
      const data = (await res.json().catch(() => ({}))) as { announcements?: Row[]; error?: string };
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
      show("Published", "It's live on the site now.");
      await load();
    } catch (err) {
      show("Publish failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (row: Row) => {
    setBusy(row.id);
    try {
      const res = await fetch(`/api/announcements/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !row.active }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Couldn't update.");
      }
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, active: !row.active } : r)));
    } catch (err) {
      show("Update failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (row: Row) => {
    setBusy(row.id);
    try {
      const res = await fetch(`/api/announcements/${row.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Couldn't delete.");
      }
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      show("Deleted");
    } catch (err) {
      show("Delete failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-5">
      <section className="card p-6">
        <h2 className="font-display text-lg mb-4">New announcement</h2>
        <div className="grid gap-3">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={120}
            placeholder="Title"
            className="w-full rounded-[10px] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--muted-2)] focus:border-[var(--accent)] focus:outline-none"
          />
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={400}
            rows={2}
            placeholder="Message (optional)"
            className="w-full resize-y rounded-[10px] border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--muted-2)] focus:border-[var(--accent)] focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1" role="group" aria-label="Tone">
              {TONES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTone(option.value)}
                  className={`rounded-[10px] border px-3 py-1.5 text-xs ${
                    tone === option.value
                      ? "border-[var(--accent)] text-[var(--fg)]"
                      : "border-[var(--border)] text-[var(--muted)]"
                  }`}
                >
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

      <section className="card p-6">
        <h2 className="font-display text-lg mb-4">Published</h2>
        {loading ? (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Nothing yet.</p>
        ) : (
          <div className="grid gap-2">
            {rows.map((row) => (
              <div
                key={row.id}
                className="flex items-center gap-3 rounded-[10px] border border-[var(--border)] px-3 py-2.5"
              >
                <span
                  className={`h-1.5 w-1.5 flex-none rounded-full ${
                    row.active ? "bg-[var(--accent)]" : "bg-[var(--muted-2)]"
                  }`}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-[var(--fg)]">{row.title}</div>
                  {row.body ? (
                    <div className="truncate text-xs text-[var(--muted)]">{row.body}</div>
                  ) : null}
                </div>
                <span className="hidden flex-none text-[10px] uppercase tracking-wider text-[var(--muted-2)] sm:block">
                  {row.tone}
                </span>
                <button
                  type="button"
                  onClick={() => void toggle(row)}
                  disabled={busy === row.id}
                  className="flex-none rounded-[8px] border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--fg)]"
                >
                  {row.active ? "Hide" : "Show"}
                </button>
                <button
                  type="button"
                  onClick={() => void remove(row)}
                  disabled={busy === row.id}
                  aria-label={`Delete ${row.title}`}
                  className="flex-none rounded-[8px] border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] hover:border-[#8c4a3f] hover:text-[#e88373]"
                >
                  <i className="fa-solid fa-trash" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
