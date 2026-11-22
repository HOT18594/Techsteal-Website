"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import type { ExarotonFileInfo } from "@/lib/exaroton";

const QUICK_PATHS = [
  { path: "", label: "Root /", icon: "fa-folder-tree" },
  { path: "mods", label: "mods/", icon: "fa-puzzle-piece" },
  { path: "config", label: "config/", icon: "fa-gear" },
  { path: "crash-reports", label: "crash-reports/", icon: "fa-bug" },
  { path: "world", label: "world/", icon: "fa-earth-americas" },
];

const PROTECTED = new Set(["", "world", "world/level.dat", "server.properties", "ops.json"]);

function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function cleanPath(p: string): string {
  return p.replace(/^\/+|\/+$/g, "");
}

export function ServerFilesTab({
  configured,
  serverOnline,
}: {
  configured: boolean;
  serverOnline: boolean;
}) {
  const { show } = useToast();
  const [currentPath, setCurrentPath] = useState("");
  const [dirInfo, setDirInfo] = useState<ExarotonFileInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Active text file editor
  const [openFile, setOpenFile] = useState<ExarotonFileInfo | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [fileLoading, setFileLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Create folder / Delete confirm
  const [newFolderName, setNewFolderName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<ExarotonFileInfo | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);

  const loadDir = useCallback(
    async (path: string) => {
      if (!configured) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/admin/server/files?path=${encodeURIComponent(path)}&mode=info`,
          { cache: "no-store" }
        );
        const data = (await res.json().catch(() => ({}))) as {
          info?: ExarotonFileInfo;
          error?: string;
        };
        if (!res.ok || !data.info) throw new Error(data.error || "Couldn't load folder.");
        setDirInfo(data.info);
        setCurrentPath(cleanPath(path));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load folder.");
      } finally {
        setLoading(false);
      }
    },
    [configured]
  );

  useEffect(() => {
    void loadDir("");
  }, [loadDir]);

  const openTextFile = async (file: ExarotonFileInfo) => {
    const path = cleanPath(file.path);
    setFileLoading(true);
    setOpenFile(file);
    try {
      const res = await fetch(
        `/api/admin/server/files?path=${encodeURIComponent(path)}&mode=read`,
        { cache: "no-store" }
      );
      const data = (await res.json().catch(() => ({}))) as {
        info?: ExarotonFileInfo;
        content?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Couldn't open file.");
      setOpenFile(data.info ?? file);
      setFileContent(data.content ?? "");
      setOriginalContent(data.content ?? "");
    } catch (err) {
      setOpenFile(null);
      show("Can't open file", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setFileLoading(false);
    }
  };

  const saveFile = async () => {
    if (!openFile) return;
    setSaving(true);
    try {
      const path = cleanPath(openFile.path);
      const res = await fetch("/api/admin/server/files", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content: fileContent }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't save file.");
      setOriginalContent(fileContent);
      show("File saved", path);
      await loadDir(currentPath);
    } catch (err) {
      show("Save failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  const createFolder = async () => {
    const name = newFolderName.trim().replace(/^\/+|\/+$/g, "");
    if (!name || /[\\/]|\.\./.test(name)) {
      show("Invalid folder name", "Use a single folder name without slashes.", "error");
      return;
    }
    const target = currentPath ? `${currentPath}/${name}` : name;
    try {
      const res = await fetch("/api/admin/server/files", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: target, mkdir: true }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't create folder.");
      setNewFolderName("");
      show("Folder created", target);
      await loadDir(currentPath);
    } catch (err) {
      show("Create failed", err instanceof Error ? err.message : "Try again.", "error");
    }
  };

  const deleteItem = async (item: ExarotonFileInfo) => {
    setBusyDelete(true);
    try {
      const path = cleanPath(item.path);
      const res = await fetch("/api/admin/server/files", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't delete item.");
      if (openFile && cleanPath(openFile.path) === path) setOpenFile(null);
      setConfirmDelete(null);
      show("Deleted", path);
      await loadDir(currentPath);
    } catch (err) {
      show("Delete failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setBusyDelete(false);
    }
  };

  const breadcrumbs = currentPath ? currentPath.split("/") : [];
  const children = useMemo(() => {
    const list = dirInfo?.children ?? [];
    const q = search.trim().toLowerCase();
    return q ? list.filter((c) => c.name.toLowerCase().includes(q)) : list;
  }, [dirInfo, search]);

  if (!configured) {
    return (
      <section className="admin-directory">
        <EmptyState
          className="admin-empty"
          icon="fa-plug-circle-xmark"
          title="Exaroton not connected"
          hint="Configure EXAROTON_TOKEN and EXAROTON_SERVER_ID to browse server files and mods."
        />
      </section>
    );
  }

  return (
    <div className="grid gap-4">
      <section className="admin-directory">
        <div className="admin-directory-head">
          <div>
            <h2>Server files &amp; mods</h2>
            <p>Browse Exaroton files, inspect installed mods &amp; crash reports, and edit text/JSON/TOML configs.</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {QUICK_PATHS.map((q) => (
              <button
                key={q.label}
                type="button"
                className={`admin-action-btn ${currentPath === q.path ? "!border-[var(--accent)] !text-[var(--fg)]" : ""}`}
                onClick={() => void loadDir(q.path)}
              >
                <i className={`fa-solid ${q.icon}`} aria-hidden="true" /> {q.label}
              </button>
            ))}
          </div>
        </div>

        {/* Breadcrumbs & search */}
        <div className="admin-toolbar">
          <div className="flex flex-wrap items-center gap-1 text-xs font-mono text-[var(--fg-2)]">
            <button
              type="button"
              className="hover:text-[var(--accent-bright)] underline-offset-2 hover:underline"
              onClick={() => void loadDir("")}
            >
              /
            </button>
            {breadcrumbs.map((seg, i) => {
              const target = breadcrumbs.slice(0, i + 1).join("/");
              return (
                <span key={target} className="inline-flex items-center gap-1">
                  <span className="text-[var(--muted-2)]">/</span>
                  <button
                    type="button"
                    className="hover:text-[var(--accent-bright)] underline-offset-2 hover:underline"
                    onClick={() => void loadDir(target)}
                  >
                    {seg}
                  </button>
                </span>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <label className="admin-search !max-w-52">
              <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
              <span className="sr-only">Filter files</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter folder…"
              />
            </label>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void createFolder();
              }}
              className="flex items-center gap-1.5"
            >
              <input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="New folder…"
                maxLength={40}
                className="input !py-1.5 !px-2.5 text-xs !w-32"
                aria-label="New folder name"
              />
              <button type="submit" className="admin-action-btn" disabled={!newFolderName.trim()}>
                <i className="fa-solid fa-folder-plus" aria-hidden="true" />
              </button>
            </form>
            <button
              type="button"
              className="admin-action-btn"
              onClick={() => void loadDir(currentPath)}
              disabled={loading}
            >
              <i className={`fa-solid fa-rotate ${loading ? "fa-spin" : ""}`} aria-hidden="true" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="admin-loading" aria-label="Loading files">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} />
            ))}
          </div>
        ) : error ? (
          <EmptyState
            className="admin-empty"
            icon="fa-triangle-exclamation"
            title="Folder unavailable"
            hint={error}
          />
        ) : children.length === 0 ? (
          <EmptyState
            className="admin-empty"
            icon="fa-folder-open"
            title="Empty folder"
            hint="No files or subfolders match here."
          />
        ) : (
          <div className="divide-y divide-[var(--border)] max-h-[420px] overflow-y-auto thin-scroll">
            {currentPath ? (
              <button
                type="button"
                onClick={() => void loadDir(breadcrumbs.slice(0, -1).join("/"))}
                className="w-full text-left px-5 py-2.5 flex items-center gap-3 text-xs text-[var(--muted)] hover:bg-[var(--card-hover)]"
              >
                <i className="fa-solid fa-level-up-alt" aria-hidden="true" />
                <span>.. (parent folder)</span>
              </button>
            ) : null}
            {children.map((item) => {
              const p = cleanPath(item.path);
              const canRead = !item.isDirectory && (item.isTextFile || item.isConfigFile || item.isLog);
              const isProtected = PROTECTED.has(p.toLowerCase());
              return (
                <div
                  key={p}
                  className="px-5 py-2.5 flex items-center justify-between gap-3 hover:bg-[var(--card-hover)] text-xs"
                >
                  <button
                    type="button"
                    className="flex items-center gap-3 min-w-0 flex-1 text-left"
                    onClick={() => {
                      if (item.isDirectory) void loadDir(p);
                      else if (canRead) void openTextFile(item);
                      else show("Binary file", `${item.name} (${formatSize(item.size)}) cannot be edited as text.`);
                    }}
                  >
                    <i
                      className={`fa-solid ${
                        item.isDirectory
                          ? "fa-folder text-[#ffd166]"
                          : item.name.endsWith(".jar")
                            ? "fa-puzzle-piece text-[var(--accent)]"
                            : canRead
                              ? "fa-file-lines text-[var(--fg-2)]"
                              : "fa-file text-[var(--muted)]"
                      } w-4 text-center`}
                      aria-hidden="true"
                    />
                    <span className="font-mono text-[var(--fg)] truncate">{item.name}</span>
                    {item.isConfigFile ? <span className="admin-pill is-accent">Config</span> : null}
                    {item.isLog ? <span className="admin-pill">Log</span> : null}
                  </button>
                  <div className="flex items-center gap-3 flex-none">
                    <span className="text-[11px] font-mono text-[var(--muted-2)] tabular-nums">
                      {item.isDirectory ? "Folder" : formatSize(item.size)}
                    </span>
                    {!isProtected ? (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(item)}
                        className="admin-icon-button !w-7 !h-7"
                        aria-label={`Delete ${item.name}`}
                      >
                        <i className="fa-solid fa-trash" aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Inline File Editor */}
      {openFile ? (
        <section className="admin-directory">
          <div className="admin-directory-head">
            <div>
              <h2 className="font-mono text-sm">{cleanPath(openFile.path)}</h2>
              <p>
                {formatSize(openFile.size)}
                {openFile.isWritable ? " · Writable" : " · Read-only"}
                {fileContent !== originalContent ? " · Unsaved changes" : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="admin-action-btn"
                onClick={() => {
                  void navigator.clipboard.writeText(fileContent);
                  show("Copied", openFile.name);
                }}
              >
                <i className="fa-regular fa-copy" aria-hidden="true" /> Copy
              </button>
              {openFile.isWritable ? (
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  disabled={saving || fileContent === originalContent}
                  onClick={() => void saveFile()}
                >
                  <i className={`fa-solid ${saving ? "fa-spinner fa-spin" : "fa-floppy-disk"}`} aria-hidden="true" />
                  {saving ? "Saving…" : "Save file"}
                </button>
              ) : null}
              <button
                type="button"
                className="admin-icon-button"
                onClick={() => setOpenFile(null)}
                aria-label="Close file editor"
              >
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            </div>
          </div>
          {fileLoading ? (
            <div className="admin-loading">
              {[0, 1, 2].map((i) => (
                <div key={i} />
              ))}
            </div>
          ) : (
            <div className="p-4">
              <textarea
                value={fileContent}
                onChange={(e) => setFileContent(e.target.value)}
                readOnly={!openFile.isWritable}
                rows={16}
                spellCheck={false}
                className="input font-mono text-xs leading-relaxed resize-y"
                aria-label={`Edit ${openFile.name}`}
              />
            </div>
          )}
        </section>
      ) : null}

      {confirmDelete ? (
        <Modal
          label={`Delete ${confirmDelete.name}`}
          onClose={() => {
            if (!busyDelete) setConfirmDelete(null);
          }}
          cardClassName="admin-confirm-modal"
        >
          <div className="admin-confirm-icon">
            <i className="fa-solid fa-trash" aria-hidden="true" />
          </div>
          <div>
            <span className="admin-confirm-kicker">Delete server file</span>
            <h2>Delete &ldquo;{cleanPath(confirmDelete.path)}&rdquo;?</h2>
            <p>
              This permanently removes the {confirmDelete.isDirectory ? "folder and its contents" : "file"} from Exaroton.
              {serverOnline ? " The server is currently online — consider stopping it before deleting world or config files." : ""}
            </p>
          </div>
          <div className="admin-confirm-actions">
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => setConfirmDelete(null)}
              disabled={busyDelete}
            >
              Cancel
            </button>
            <button
              type="button"
              className="admin-confirm-remove"
              onClick={() => void deleteItem(confirmDelete)}
              disabled={busyDelete}
            >
              <i className="fa-solid fa-trash" aria-hidden="true" /> Delete permanently
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
