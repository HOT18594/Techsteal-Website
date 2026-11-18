"use client";

// Admin → Site Content CMS. Unified workspace for Announcements, Server Rules
// (`rule_sections`), and Season History (`timeline_events`) — editable live in
// Postgres without SQL scripts or redeployments.

import { useCallback, useEffect, useState } from "react";
import { AnnouncementsPanel } from "@/components/AnnouncementsPanel";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { siteConfig } from "@/lib/site";
import type { RuleSection, TimelineEvent } from "@/types";

type ContentTab = "announcements" | "rules" | "timeline";

const RULE_ICONS = [
  "fa-handshake",
  "fa-shield-halved",
  "fa-gavel",
  "fa-cubes",
  "fa-bolt",
  "fa-compass",
  "fa-comments",
  "fa-skull",
  "fa-wand-magic-sparkles",
  "fa-scale-balanced",
];

const ERA_PRESETS = ["Current Season", "Past Seasons", "Origins"];

export function ContentCmsPanel() {
  const [subTab, setSubTab] = useState<ContentTab>("announcements");

  return (
    <div className="grid gap-4">
      <div className="admin-directory-tabs" role="tablist" aria-label="Content type">
        <button
          type="button"
          role="tab"
          aria-selected={subTab === "announcements"}
          className={subTab === "announcements" ? "is-active" : ""}
          onClick={() => setSubTab("announcements")}
        >
          <i className="fa-solid fa-bullhorn" aria-hidden="true" /> Announcements
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === "rules"}
          className={subTab === "rules" ? "is-active" : ""}
          onClick={() => setSubTab("rules")}
        >
          <i className="fa-solid fa-scale-balanced" aria-hidden="true" /> Server Rules
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === "timeline"}
          className={subTab === "timeline" ? "is-active" : ""}
          onClick={() => setSubTab("timeline")}
        >
          <i className="fa-solid fa-clock-rotate-left" aria-hidden="true" /> History Timeline
        </button>
      </div>

      {subTab === "announcements" ? (
        <AnnouncementsPanel />
      ) : subTab === "rules" ? (
        <RulesEditor />
      ) : (
        <TimelineEditor />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Server Rules CMS (`rule_sections`)
// ---------------------------------------------------------------------------

function RulesEditor() {
  const { show } = useToast();
  const [sections, setSections] = useState<RuleSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Modal state ("new" or existing section)
  const [modalMode, setModalMode] = useState<"new" | RuleSection | null>(null);
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState("fa-shield-halved");
  const [rules, setRules] = useState<string[]>([""]);
  const [confirmDelete, setConfirmDelete] = useState<RuleSection | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/rules", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as {
        sections?: RuleSection[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Couldn't load rules.");
      setSections(data.sections ?? []);
    } catch (err) {
      show("Load failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => {
    void load();
  }, [load]);

  const openNew = () => {
    setModalMode("new");
    setTitle("");
    setIcon("fa-shield-halved");
    setRules([""]);
  };

  const openEdit = (sec: RuleSection) => {
    setModalMode(sec);
    setTitle(sec.title);
    setIcon(sec.icon || "fa-shield-halved");
    setRules(sec.rules.length > 0 ? [...sec.rules] : [""]);
  };

  const saveSection = async () => {
    const cleanRules = rules.map((r) => r.trim()).filter((r) => r.length >= 2);
    if (title.trim().length < 2) {
      show("Title required", "Enter a section title of at least 2 characters.", "error");
      return;
    }
    if (cleanRules.length === 0) {
      show("Add at least one rule", "Each section needs at least one rule entry.", "error");
      return;
    }
    setBusy(true);
    try {
      const isNew = modalMode === "new";
      const res = await fetch("/api/admin/rules", {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isNew ? {} : { id: (modalMode as RuleSection).id }),
          title: title.trim(),
          icon: icon.trim() || "fa-shield-halved",
          rules: cleanRules,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't save rule section.");
      setModalMode(null);
      show(isNew ? "Section created" : "Section updated", "Changes are live on /rules.");
      await load();
    } catch (err) {
      show("Save failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  const swapOrder = async (indexA: number, indexB: number) => {
    const a = sections[indexA];
    const b = sections[indexB];
    if (!a?.id || !b?.id) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "swap", idA: a.id, idB: b.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't reorder sections.");
      await load();
    } catch (err) {
      show("Reorder failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  const removeSection = async (sec: RuleSection) => {
    if (!sec.id) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/rules", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sec.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't delete section.");
      setConfirmDelete(null);
      show("Deleted", `Removed "${sec.title}".`);
      await load();
    } catch (err) {
      show("Delete failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  const seedDefaults = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seed_defaults" }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't import defaults.");
      show("Imported", "Default server rules copied into the database.");
      await load();
    } catch (err) {
      show("Import failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="admin-directory">
      <div className="admin-directory-head">
        <div>
          <h2>Server rules (/rules)</h2>
          <p>Sections and numbered rules published on the public Rules page and read by {siteConfig.assistant.name}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sections.length === 0 && !loading ? (
            <button
              type="button"
              onClick={() => void seedDefaults()}
              disabled={busy}
              className="admin-action-btn"
            >
              <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true" /> Import Default Rules
            </button>
          ) : null}
          <button type="button" onClick={openNew} disabled={busy} className="btn-primary btn-sm">
            <i className="fa-solid fa-plus" aria-hidden="true" /> New Section
          </button>
        </div>
      </div>

      {loading ? (
        <div className="admin-loading">
          {[0, 1, 2].map((r) => (
            <div key={r} />
          ))}
        </div>
      ) : sections.length === 0 ? (
        <EmptyState
          className="admin-empty"
          icon="fa-scale-balanced"
          title="No custom rules in database yet"
          hint="Import the default ruleset to start editing, or create your first rule section from scratch."
          action={
            <button type="button" className="btn-secondary btn-sm" onClick={() => void seedDefaults()}>
              Import Default Rules
            </button>
          }
        />
      ) : (
        <div className="divide-y divide-[var(--border)]">
          {sections.map((sec, idx) => (
            <div key={sec.id ?? idx} className="p-5 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="admin-metric-icon is-blue !w-9 !h-9 !flex-none">
                    <i className={`fa-solid ${sec.icon || "fa-shield-halved"}`} aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="font-semibold text-sm text-[var(--fg)]">{sec.title}</h3>
                    <span className="text-xs text-[var(--muted-2)]">
                      {sec.rules.length} rule{sec.rules.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className="admin-icon-button"
                    disabled={busy || idx === 0}
                    onClick={() => void swapOrder(idx, idx - 1)}
                    aria-label={`Move ${sec.title} up`}
                    title="Move up"
                  >
                    <i className="fa-solid fa-arrow-up" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="admin-icon-button"
                    disabled={busy || idx === sections.length - 1}
                    onClick={() => void swapOrder(idx, idx + 1)}
                    aria-label={`Move ${sec.title} down`}
                    title="Move down"
                  >
                    <i className="fa-solid fa-arrow-down" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="admin-action-btn"
                    disabled={busy}
                    onClick={() => openEdit(sec)}
                  >
                    <i className="fa-solid fa-pen" aria-hidden="true" /> Edit
                  </button>
                  <button
                    type="button"
                    className="admin-action-btn is-danger"
                    disabled={busy}
                    onClick={() => setConfirmDelete(sec)}
                    aria-label={`Delete ${sec.title}`}
                  >
                    <i className="fa-solid fa-trash" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <ol className="list-decimal pl-6 grid gap-1 text-xs text-[var(--fg-2)]">
                {sec.rules.map((r, rIdx) => (
                  <li key={rIdx}>{r}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}

      {modalMode ? (
        <Modal
          label={modalMode === "new" ? "New rule section" : `Edit ${modalMode.title}`}
          onClose={() => {
            if (!busy) setModalMode(null);
          }}
          cardClassName="admin-edit-modal"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-bold">
              {modalMode === "new" ? "New rule section" : "Edit rule section"}
            </h2>
            <button
              type="button"
              onClick={() => setModalMode(null)}
              disabled={busy}
              className="admin-icon-button"
              aria-label="Close"
            >
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          </div>

          <div className="grid gap-3.5 modal-scroll max-h-[70dvh] pr-1">
            <div>
              <label htmlFor="rule-sec-title" className="block text-xs font-semibold text-[var(--fg-2)] mb-1.5">
                Section title
              </label>
              <input
                id="rule-sec-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={80}
                placeholder="e.g. Fair Play & Client Mods"
                className="input"
              />
            </div>

            <div>
              <span className="block text-xs font-semibold text-[var(--fg-2)] mb-1.5">Icon</span>
              <div className="flex flex-wrap gap-1.5">
                {RULE_ICONS.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    aria-label={ic}
                    aria-pressed={icon === ic}
                    onClick={() => setIcon(ic)}
                    className={`admin-icon-button border ${
                      icon === ic
                        ? "!border-[var(--accent)] !bg-[var(--accent-dim)] !text-[var(--fg)]"
                        : "!border-[var(--border)] !bg-[var(--bg-2)]"
                    }`}
                  >
                    <i className={`fa-solid ${ic}`} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-[var(--fg-2)]">Numbered rules</span>
                <button
                  type="button"
                  onClick={() => setRules((prev) => [...prev, ""])}
                  disabled={rules.length >= 25}
                  className="admin-action-btn !min-h-7 !py-1 !px-2.5"
                >
                  <i className="fa-solid fa-plus" aria-hidden="true" /> Add rule
                </button>
              </div>
              <div className="grid gap-2">
                {rules.map((ruleText, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-xs font-mono text-[var(--muted-2)] w-5 text-right">{idx + 1}.</span>
                    <input
                      value={ruleText}
                      onChange={(e) =>
                        setRules((prev) => prev.map((item, i) => (i === idx ? e.target.value : item)))
                      }
                      maxLength={300}
                      aria-label={`Rule ${idx + 1}`}
                      placeholder="Write a clear, concise rule…"
                      className="input !py-2 text-xs flex-1"
                    />
                    {rules.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => setRules((prev) => prev.filter((_, i) => i !== idx))}
                        aria-label={`Remove rule ${idx + 1}`}
                        className="admin-icon-button"
                      >
                        <i className="fa-solid fa-xmark" aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border)]">
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => setModalMode(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary btn-sm"
                onClick={() => void saveSection()}
                disabled={busy}
              >
                {busy ? "Saving…" : "Save section"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {confirmDelete ? (
        <Modal
          label={`Delete ${confirmDelete.title}`}
          onClose={() => {
            if (!busy) setConfirmDelete(null);
          }}
          cardClassName="admin-confirm-modal"
        >
          <div className="admin-confirm-icon">
            <i className="fa-solid fa-trash" aria-hidden="true" />
          </div>
          <div>
            <span className="admin-confirm-kicker">Delete rule section</span>
            <h2>Delete &ldquo;{confirmDelete.title}&rdquo;?</h2>
            <p>All {confirmDelete.rules.length} rule(s) in this section will be removed from /rules immediately.</p>
          </div>
          <div className="admin-confirm-actions">
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => setConfirmDelete(null)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="admin-confirm-remove"
              onClick={() => void removeSection(confirmDelete)}
              disabled={busy}
            >
              <i className="fa-solid fa-trash" aria-hidden="true" /> Delete section
            </button>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// History / Timeline CMS (`timeline_events`)
// ---------------------------------------------------------------------------

function TimelineEditor() {
  const { show } = useToast();
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [modalMode, setModalMode] = useState<"new" | TimelineEvent | null>(null);
  const [date, setDate] = useState("");
  const [title, setTitle] = useState("");
  const [era, setEra] = useState("Current Season");
  const [major, setMajor] = useState(false);
  const [description, setDescription] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<TimelineEvent | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/timeline", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as {
        events?: TimelineEvent[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Couldn't load timeline.");
      setEvents(data.events ?? []);
    } catch (err) {
      show("Load failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => {
    void load();
  }, [load]);

  const openNew = () => {
    setModalMode("new");
    setDate(siteConfig.seasonLive ? siteConfig.seasonStart : "Coming soon");
    setTitle("");
    setEra("Current Season");
    setMajor(true);
    setDescription("");
  };

  const openEdit = (ev: TimelineEvent) => {
    setModalMode(ev);
    setDate(ev.date);
    setTitle(ev.title);
    setEra(ev.era);
    setMajor(ev.major);
    setDescription(ev.description ?? "");
  };

  const saveEvent = async () => {
    if (!date.trim() || title.trim().length < 2) {
      show("Missing fields", "Provide both a date/status label and a title.", "error");
      return;
    }
    setBusy(true);
    try {
      const isNew = modalMode === "new";
      const res = await fetch("/api/admin/timeline", {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isNew ? {} : { id: (modalMode as TimelineEvent).id }),
          date: date.trim(),
          title: title.trim(),
          era: era.trim() || "Current Season",
          major,
          description: description.trim() || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't save milestone.");
      setModalMode(null);
      show(isNew ? "Milestone added" : "Milestone updated", "Changes are live on /history.");
      await load();
    } catch (err) {
      show("Save failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  const swapOrder = async (indexA: number, indexB: number) => {
    const a = events[indexA];
    const b = events[indexB];
    if (!a?.id || !b?.id) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/timeline", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "swap", idA: a.id, idB: b.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't reorder milestones.");
      await load();
    } catch (err) {
      show("Reorder failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  const removeEvent = async (ev: TimelineEvent) => {
    if (!ev.id) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/timeline", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ev.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't delete milestone.");
      setConfirmDelete(null);
      show("Deleted", `Removed "${ev.title}".`);
      await load();
    } catch (err) {
      show("Delete failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  const runSeasonTransition = async (mode: "prep" | "launch") => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "season_transition",
          mode,
          launchDate: siteConfig.seasonStart,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Transition failed.");
      show(
        "Timeline synced",
        mode === "launch"
          ? `${siteConfig.season} marked live (${siteConfig.seasonStart}) and ${siteConfig.previousSeason} archived.`
          : `${siteConfig.season} set to Coming soon.`
      );
      await load();
    } catch (err) {
      show("Action failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  const seedDefaults = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seed_defaults" }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't import defaults.");
      show("Imported", "Default history timeline copied into the database.");
      await load();
    } catch (err) {
      show("Import failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="admin-directory">
      <div className="admin-directory-head">
        <div>
          <h2>History timeline (/history)</h2>
          <p>Ordered newest-first top to bottom. Includes one-click season launch transitions.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {events.length === 0 && !loading ? (
            <button type="button" onClick={() => void seedDefaults()} disabled={busy} className="admin-action-btn">
              <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true" /> Import Defaults
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void runSeasonTransition("prep")}
            disabled={busy}
            className="admin-action-btn"
            title={`Set ${siteConfig.season} to Coming soon`}
          >
            <i className="fa-solid fa-hourglass-half" aria-hidden="true" /> {siteConfig.season} Prep
          </button>
          <button
            type="button"
            onClick={() => void runSeasonTransition("launch")}
            disabled={busy}
            className="admin-action-btn"
            title={`Mark ${siteConfig.season} launched (${siteConfig.seasonStart}) and archive ${siteConfig.previousSeason}`}
          >
            <i className="fa-solid fa-rocket" aria-hidden="true" /> Mark {siteConfig.season} Live
          </button>
          <button type="button" onClick={openNew} disabled={busy} className="btn-primary btn-sm">
            <i className="fa-solid fa-plus" aria-hidden="true" /> Add Milestone
          </button>
        </div>
      </div>

      {loading ? (
        <div className="admin-loading">
          {[0, 1, 2, 3].map((r) => (
            <div key={r} />
          ))}
        </div>
      ) : events.length === 0 ? (
        <EmptyState
          className="admin-empty"
          icon="fa-clock-rotate-left"
          title="No timeline events in database"
          hint="Import the default season history or add your first milestone."
          action={
            <button type="button" className="btn-secondary btn-sm" onClick={() => void seedDefaults()}>
              Import Default Timeline
            </button>
          }
        />
      ) : (
        <div className="divide-y divide-[var(--border)]">
          {events.map((ev, idx) => (
            <div key={ev.id ?? idx} className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-sm text-[var(--fg)]">{ev.title}</span>
                  <span className="admin-pill is-accent">{ev.date}</span>
                  <span className="admin-pill">{ev.era}</span>
                  {ev.major ? (
                    <span className="admin-pill is-good">
                      <i className="fa-solid fa-star" aria-hidden="true" /> Major
                    </span>
                  ) : null}
                </div>
                {ev.description ? (
                  <p className="mt-1 text-xs text-[var(--muted)] line-clamp-2">{ev.description}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="admin-icon-button"
                  disabled={busy || idx === 0}
                  onClick={() => void swapOrder(idx, idx - 1)}
                  aria-label={`Move ${ev.title} up`}
                >
                  <i className="fa-solid fa-arrow-up" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="admin-icon-button"
                  disabled={busy || idx === events.length - 1}
                  onClick={() => void swapOrder(idx, idx + 1)}
                  aria-label={`Move ${ev.title} down`}
                >
                  <i className="fa-solid fa-arrow-down" aria-hidden="true" />
                </button>
                <button type="button" className="admin-action-btn" disabled={busy} onClick={() => openEdit(ev)}>
                  <i className="fa-solid fa-pen" aria-hidden="true" /> Edit
                </button>
                <button
                  type="button"
                  className="admin-action-btn is-danger"
                  disabled={busy}
                  onClick={() => setConfirmDelete(ev)}
                  aria-label={`Delete ${ev.title}`}
                >
                  <i className="fa-solid fa-trash" aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalMode ? (
        <Modal
          label={modalMode === "new" ? "Add milestone" : `Edit ${modalMode.title}`}
          onClose={() => {
            if (!busy) setModalMode(null);
          }}
          cardClassName="admin-edit-modal"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-bold">
              {modalMode === "new" ? "Add timeline milestone" : "Edit timeline milestone"}
            </h2>
            <button
              type="button"
              onClick={() => setModalMode(null)}
              disabled={busy}
              className="admin-icon-button"
              aria-label="Close"
            >
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          </div>

          <div className="grid gap-3.5">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="tl-date" className="block text-xs font-semibold text-[var(--fg-2)] mb-1.5">
                  Date or status label
                </label>
                <input
                  id="tl-date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  maxLength={40}
                  placeholder="e.g. Nov 2026, Coming soon, Concluded"
                  className="input"
                />
              </div>
              <div>
                <label htmlFor="tl-era" className="block text-xs font-semibold text-[var(--fg-2)] mb-1.5">
                  Era filter group
                </label>
                <input
                  id="tl-era"
                  value={era}
                  onChange={(e) => setEra(e.target.value)}
                  maxLength={50}
                  placeholder="Current Season"
                  className="input"
                />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {ERA_PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setEra(p)}
                      className="text-[11px] px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)]"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="tl-title" className="block text-xs font-semibold text-[var(--fg-2)] mb-1.5">
                Milestone title
              </label>
              <input
                id="tl-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                placeholder={`e.g. ${siteConfig.season} — Autumn Archipelago`}
                className="input"
              />
            </div>

            <div>
              <label htmlFor="tl-desc" className="block text-xs font-semibold text-[var(--fg-2)] mb-1.5">
                Description <span className="text-[var(--muted-2)] font-normal">(optional, shown on major milestones)</span>
              </label>
              <textarea
                id="tl-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={600}
                rows={3}
                className="input resize-y"
              />
            </div>

            <label className="inline-flex items-center gap-2.5 text-xs font-semibold text-[var(--fg-2)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={major}
                onChange={(e) => setMajor(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              Highlight as a major season milestone
            </label>

            <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border)]">
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => setModalMode(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary btn-sm"
                onClick={() => void saveEvent()}
                disabled={busy}
              >
                {busy ? "Saving…" : "Save milestone"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {confirmDelete ? (
        <Modal
          label={`Delete ${confirmDelete.title}`}
          onClose={() => {
            if (!busy) setConfirmDelete(null);
          }}
          cardClassName="admin-confirm-modal"
        >
          <div className="admin-confirm-icon">
            <i className="fa-solid fa-trash" aria-hidden="true" />
          </div>
          <div>
            <span className="admin-confirm-kicker">Delete milestone</span>
            <h2>Delete &ldquo;{confirmDelete.title}&rdquo;?</h2>
            <p>This milestone will be permanently removed from the History timeline.</p>
          </div>
          <div className="admin-confirm-actions">
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => setConfirmDelete(null)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="admin-confirm-remove"
              onClick={() => void removeEvent(confirmDelete)}
              disabled={busy}
            >
              <i className="fa-solid fa-trash" aria-hidden="true" /> Delete milestone
            </button>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
