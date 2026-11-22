"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import type { ExarotonConfigOption } from "@/lib/exaroton";

export function ServerConfigTab({
  configured,
  initialMotd,
  onMotdSaved,
}: {
  configured: boolean;
  initialMotd: string | null;
  onMotdSaved?: (motd: string) => void;
}) {
  const { show } = useToast();
  const [motd, setMotd] = useState(initialMotd ?? "");
  const [motdSaving, setMotdSaving] = useState(false);

  const [configPath, setConfigPath] = useState("server.properties");
  const [options, setOptions] = useState<ExarotonConfigOption[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string | number | boolean | string[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (initialMotd !== null) setMotd(initialMotd);
  }, [initialMotd]);

  const loadConfig = useCallback(
    async (path: string) => {
      if (!configured) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/server/config?path=${encodeURIComponent(path)}`, {
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as {
          options?: ExarotonConfigOption[];
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || "Couldn't load server config.");
        setOptions(data.options ?? []);
        setDrafts({});
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load server config.");
      } finally {
        setLoading(false);
      }
    },
    [configured]
  );

  useEffect(() => {
    void loadConfig(configPath);
  }, [configPath, loadConfig]);

  const saveMotd = async () => {
    setMotdSaving(true);
    try {
      const res = await fetch("/api/admin/server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "motd", motd }),
      });
      const data = (await res.json().catch(() => ({}))) as { motd?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't update MOTD.");
      const next = data.motd ?? motd;
      setMotd(next);
      onMotdSaved?.(next);
      show("MOTD updated", "Your Minecraft server list description has been saved.");
    } catch (err) {
      show("MOTD update failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setMotdSaving(false);
    }
  };

  const dirtyCount = Object.keys(drafts).length;

  const saveConfig = async () => {
    if (dirtyCount === 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/server/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: configPath, values: drafts }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        options?: ExarotonConfigOption[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Couldn't save configuration.");
      setOptions(data.options ?? options);
      setDrafts({});
      show("Configuration saved", `Updated ${dirtyCount} option(s) in ${configPath}.`);
    } catch (err) {
      show("Save failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  const updateField = (opt: ExarotonConfigOption, nextVal: string | number | boolean | string[]) => {
    setDrafts((prev) => {
      const copy = { ...prev };
      if (JSON.stringify(nextVal) === JSON.stringify(opt.value)) {
        delete copy[opt.key];
      } else {
        copy[opt.key] = nextVal;
      }
      return copy;
    });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (opt) =>
        opt.key.toLowerCase().includes(q) ||
        opt.label.toLowerCase().includes(q)
    );
  }, [options, search]);

  if (!configured) {
    return (
      <section className="admin-directory">
        <EmptyState
          className="admin-empty"
          icon="fa-plug-circle-xmark"
          title="Exaroton not connected"
          hint="Configure EXAROTON_TOKEN and EXAROTON_SERVER_ID to edit server options."
        />
      </section>
    );
  }

  return (
    <div className="grid gap-4">
      {/* Live MOTD editor */}
      <section className="admin-directory">
        <div className="admin-directory-head">
          <div>
            <h2>Server MOTD</h2>
            <p>Edit the Message of the Day shown in the Minecraft multiplayer server list.</p>
          </div>
          <button
            type="button"
            className="btn-primary btn-sm"
            disabled={motdSaving}
            onClick={() => void saveMotd()}
          >
            <i className={`fa-solid ${motdSaving ? "fa-spinner fa-spin" : "fa-floppy-disk"}`} aria-hidden="true" />
            {motdSaving ? "Saving…" : "Save MOTD"}
          </button>
        </div>
        <div className="p-5 grid gap-3">
          <input
            value={motd}
            onChange={(e) => setMotd(e.target.value)}
            maxLength={200}
            placeholder="Welcome to TECHSTEAL Season 6!"
            className="input font-mono text-xs"
            aria-label="Server MOTD"
          />
          <div className="rounded-[10px] border border-[var(--border)] bg-[#111312] px-4 py-3 text-xs font-mono text-[var(--fg-2)]">
            <div className="text-[10px] uppercase tracking-wider text-[var(--muted-2)] mb-1 font-sans">
              Server list preview
            </div>
            {motd.replace(/§[0-9a-fk-orx]/gi, "") || "(Empty MOTD)"}
          </div>
        </div>
      </section>

      {/* Structured server.properties / config editor */}
      <section className="admin-directory">
        <div className="admin-directory-head">
          <div>
            <h2>Server properties &amp; config</h2>
            <p>
              Structured Exaroton configuration editor for <code>{configPath}</code> ({options.length} options).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {dirtyCount > 0 ? (
              <>
                <button
                  type="button"
                  className="admin-action-btn"
                  disabled={saving}
                  onClick={() => setDrafts({})}
                >
                  Reset ({dirtyCount})
                </button>
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  disabled={saving}
                  onClick={() => void saveConfig()}
                >
                  <i className={`fa-solid ${saving ? "fa-spinner fa-spin" : "fa-floppy-disk"}`} aria-hidden="true" />
                  {saving ? "Saving…" : `Save ${dirtyCount} change${dirtyCount === 1 ? "" : "s"}`}
                </button>
              </>
            ) : null}
            <button
              type="button"
              className="admin-action-btn"
              onClick={() => void loadConfig(configPath)}
              disabled={loading}
            >
              <i className={`fa-solid fa-rotate ${loading ? "fa-spin" : ""}`} aria-hidden="true" /> Refresh
            </button>
          </div>
        </div>

        <div className="admin-toolbar">
          <label className="admin-search">
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <span className="sr-only">Filter config options</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter options (e.g. difficulty, pvp, view-distance, whitelist)…"
            />
          </label>
          <div className="flex items-center gap-2">
            <input
              value={configPath}
              onChange={(e) => setConfigPath(e.target.value)}
              className="input !py-1.5 !px-3 text-xs font-mono !w-48"
              aria-label="Config file path"
            />
            <button
              type="button"
              className="admin-action-btn"
              onClick={() => void loadConfig(configPath)}
              disabled={loading}
            >
              Load
            </button>
          </div>
        </div>

        {loading ? (
          <div className="admin-loading" aria-label="Loading configuration">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} />
            ))}
          </div>
        ) : error ? (
          <EmptyState
            className="admin-empty"
            icon="fa-triangle-exclamation"
            title="Config unavailable"
            hint={error}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            className="admin-empty"
            icon="fa-sliders"
            title="No matching options"
            hint="Clear the search filter to view all configuration fields."
          />
        ) : (
          <div className="p-5 grid gap-3 sm:grid-cols-2">
            {filtered.map((opt) => {
              const current = opt.key in drafts ? drafts[opt.key] : opt.value;
              const isDirty = opt.key in drafts;
              return (
                <div
                  key={opt.key}
                  className={`rounded-[10px] border p-3.5 bg-[var(--bg-2)] flex flex-col gap-2 ${
                    isDirty ? "border-[var(--accent)]" : "border-[var(--border)]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[var(--fg)]">{opt.label}</span>
                    <code className="text-[10px] text-[var(--muted-2)]">{opt.key}</code>
                  </div>

                  {opt.type === "boolean" ? (
                    <label className="inline-flex items-center gap-2.5 text-xs text-[var(--fg-2)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(current)}
                        onChange={(e) => updateField(opt, e.target.checked)}
                      />
                      <span>{Boolean(current) ? "Enabled" : "Disabled"}</span>
                    </label>
                  ) : opt.type === "select" && Array.isArray(opt.options) ? (
                    <select
                      value={String(current ?? "")}
                      onChange={(e) => updateField(opt, e.target.value)}
                      className="admin-role-select !w-full"
                    >
                      {opt.options.map((choice) => (
                        <option key={choice} value={choice}>
                          {choice}
                        </option>
                      ))}
                    </select>
                  ) : opt.type === "integer" || opt.type === "float" ? (
                    <input
                      type="number"
                      value={current === null || current === undefined ? "" : String(current)}
                      min={opt.min ?? undefined}
                      max={opt.max ?? undefined}
                      step={opt.step ?? (opt.type === "float" ? "any" : 1)}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (Number.isFinite(n)) updateField(opt, n);
                      }}
                      className="input !py-1.5 text-xs font-mono"
                    />
                  ) : (
                    <input
                      type="text"
                      value={current === null || current === undefined ? "" : String(current)}
                      onChange={(e) => updateField(opt, e.target.value)}
                      className="input !py-1.5 text-xs font-mono"
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
