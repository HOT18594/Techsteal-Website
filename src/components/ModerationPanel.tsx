"use client";

// Admin → Moderation & Storage Hub. Centralizes forum threads + polls, global
// replies/gallery comments stream, gallery builds, and Supabase bucket orphan GC.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { timeAgo } from "@/lib/time";

type ModTab = "threads" | "comments" | "gallery" | "storage";

interface ModThread {
  id: number;
  title: string;
  author: string;
  category: string;
  replies: number;
  views: number;
  likes: number;
  pinned: boolean;
  locked: boolean;
  createdAt: string | null;
  poll: {
    pollId: number;
    question: string;
    endsAt: string;
    ended: boolean;
    voteCount: number;
  } | null;
}

interface ModBuild {
  id: number;
  title: string;
  builder: string;
  category: string;
  likes: number;
  views: number;
  image: string;
  featured: boolean;
  createdAt: string | null;
}

interface ModComment {
  kind: "forum_reply" | "gallery_comment";
  id: number;
  parentId: number;
  parentTitle: string;
  author: string;
  content: string;
  pinned: boolean;
  createdAt: string | null;
}

interface StorageScan {
  configured: boolean;
  totalObjects: number;
  referencedCount: number;
  orphanCount: number;
  orphans: string[];
}

export function ModerationPanel() {
  const { show } = useToast();
  const [subTab, setSubTab] = useState<ModTab>("threads");
  const [threads, setThreads] = useState<ModThread[]>([]);
  const [gallery, setGallery] = useState<ModBuild[]>([]);
  const [comments, setComments] = useState<ModComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // Storage scan state
  const [scan, setScan] = useState<StorageScan | null>(null);
  const [scanning, setScanning] = useState(false);

  // Confirm delete dialog
  const [confirmItem, setConfirmItem] = useState<
    | { type: "thread"; item: ModThread }
    | { type: "build"; item: ModBuild }
    | { type: "comment"; item: ModComment }
    | { type: "poll"; pollId: number; question: string }
    | null
  >(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/moderation", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as {
        threads?: ModThread[];
        gallery?: ModBuild[];
        recentComments?: ModComment[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Couldn't load moderation hub.");
      setThreads(data.threads ?? []);
      setGallery(data.gallery ?? []);
      setComments(data.recentComments ?? []);
    } catch (err) {
      show("Load failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleThreadFlag = async (t: ModThread, field: "pinned" | "locked") => {
    const key = `t-${field}-${t.id}`;
    setBusyKey(key);
    try {
      const nextVal = !t[field];
      const res = await fetch("/api/forum", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: t.id, [field]: nextVal }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Update failed.");
      setThreads((prev) => prev.map((row) => (row.id === t.id ? { ...row, [field]: nextVal } : row)));
      show("Updated", `${field === "pinned" ? (nextVal ? "Pinned" : "Unpinned") : nextVal ? "Locked" : "Unlocked"} "${t.title}".`);
    } catch (err) {
      show("Action failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setBusyKey(null);
    }
  };

  const endPollNow = async (pollId: number) => {
    setBusyKey(`poll-end-${pollId}`);
    try {
      const res = await fetch("/api/admin/moderation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "end_poll", pollId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't close poll.");
      show("Poll ended", "Voting is now closed and final results are shown.");
      await load();
    } catch (err) {
      show("Action failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setBusyKey(null);
    }
  };

  const toggleFeaturedBuild = async (b: ModBuild) => {
    setBusyKey(`b-feat-${b.id}`);
    try {
      const nextFeatured = !b.featured;
      const res = await fetch(`/api/gallery/${b.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featured: nextFeatured }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Update failed.");
      setGallery((prev) => prev.map((row) => (row.id === b.id ? { ...row, featured: nextFeatured } : row)));
      show(nextFeatured ? "Featured" : "Unfeatured", `"${b.title}" updated.`);
    } catch (err) {
      show("Action failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setBusyKey(null);
    }
  };

  const toggleReplyPin = async (c: ModComment) => {
    if (c.kind !== "forum_reply") return;
    setBusyKey(`c-pin-${c.id}`);
    try {
      const nextPin = !c.pinned;
      const res = await fetch(`/api/forum/${c.parentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replyId: c.id, pinned: nextPin }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't toggle pin.");
      setComments((prev) =>
        prev.map((row) =>
          row.kind === "forum_reply" && row.id === c.id ? { ...row, pinned: nextPin } : row
        )
      );
      show(nextPin ? "Reply pinned" : "Reply unpinned");
    } catch (err) {
      show("Action failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setBusyKey(null);
    }
  };

  const executeConfirmedDelete = async () => {
    if (!confirmItem) return;
    setBusyKey("confirm-del");
    try {
      if (confirmItem.type === "thread") {
        // The route reads the id from the JSON body — the old query-string
        // form parsed as an empty body and always answered 400.
        const res = await fetch("/api/forum", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: confirmItem.item.id }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(data.error || "Delete failed.");
        setThreads((prev) => prev.filter((r) => r.id !== confirmItem.item.id));
        show("Thread deleted", `"${confirmItem.item.title}" and its replies were removed.`);
      } else if (confirmItem.type === "build") {
        const res = await fetch(`/api/gallery/${confirmItem.item.id}`, { method: "DELETE" });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(data.error || "Delete failed.");
        setGallery((prev) => prev.filter((r) => r.id !== confirmItem.item.id));
        show("Build deleted", `"${confirmItem.item.title}" removed from gallery.`);
      } else if (confirmItem.type === "comment") {
        const c = confirmItem.item;
        // Both DELETE handlers read the id from the JSON body. A body-less
        // request to the gallery route means "delete the whole post" — the
        // query string was silently ignored, so this was destructive.
        const url =
          c.kind === "forum_reply" ? `/api/forum/${c.parentId}` : `/api/gallery/${c.parentId}`;
        const res = await fetch(url, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(c.kind === "forum_reply" ? { replyId: c.id } : { commentId: c.id }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(data.error || "Delete failed.");
        setComments((prev) => prev.filter((r) => !(r.kind === c.kind && r.id === c.id)));
        show("Deleted", "Comment removed.");
      } else if (confirmItem.type === "poll") {
        const res = await fetch("/api/admin/moderation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete_poll", pollId: confirmItem.pollId }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(data.error || "Delete failed.");
        show("Poll removed", "Detached poll and votes from thread.");
        await load();
      }
      setConfirmItem(null);
    } catch (err) {
      show("Delete failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setBusyKey(null);
    }
  };

  const scanStorage = async () => {
    setScanning(true);
    try {
      const res = await fetch("/api/admin/storage", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as StorageScan & { error?: string };
      if (!res.ok) throw new Error(data.error || "Storage scan failed.");
      setScan(data);
    } catch (err) {
      show("Scan failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setScanning(false);
    }
  };

  const cleanOrphans = async () => {
    setBusyKey("clean-storage");
    try {
      const res = await fetch("/api/admin/storage", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { deleted?: number; error?: string };
      if (!res.ok) throw new Error(data.error || "Cleanup failed.");
      show("Storage cleaned", `Removed ${data.deleted ?? 0} orphaned file(s).`);
      await scanStorage();
    } catch (err) {
      show("Cleanup failed", err instanceof Error ? err.message : "Try again.", "error");
    } finally {
      setBusyKey(null);
    }
  };

  const q = query.trim().toLowerCase();

  const filteredThreads = useMemo(
    () =>
      threads.filter(
        (t) =>
          !q ||
          t.title.toLowerCase().includes(q) ||
          t.author.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q) ||
          t.poll?.question.toLowerCase().includes(q)
      ),
    [threads, q]
  );

  const filteredComments = useMemo(
    () =>
      comments.filter(
        (c) =>
          !q ||
          c.content.toLowerCase().includes(q) ||
          c.author.toLowerCase().includes(q) ||
          c.parentTitle.toLowerCase().includes(q)
      ),
    [comments, q]
  );

  const filteredGallery = useMemo(
    () =>
      gallery.filter(
        (g) =>
          !q ||
          g.title.toLowerCase().includes(q) ||
          g.builder.toLowerCase().includes(q) ||
          g.category.toLowerCase().includes(q)
      ),
    [gallery, q]
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="admin-directory-tabs" role="tablist" aria-label="Moderation view">
          <button
            type="button"
            role="tab"
            aria-selected={subTab === "threads"}
            className={subTab === "threads" ? "is-active" : ""}
            onClick={() => setSubTab("threads")}
          >
            <i className="fa-solid fa-comments" aria-hidden="true" /> Threads &amp; Polls{" "}
            <span>{threads.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === "comments"}
            className={subTab === "comments" ? "is-active" : ""}
            onClick={() => setSubTab("comments")}
          >
            <i className="fa-solid fa-reply" aria-hidden="true" /> Replies &amp; Comments{" "}
            <span>{comments.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === "gallery"}
            className={subTab === "gallery" ? "is-active" : ""}
            onClick={() => setSubTab("gallery")}
          >
            <i className="fa-solid fa-images" aria-hidden="true" /> Gallery Builds{" "}
            <span>{gallery.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === "storage"}
            className={subTab === "storage" ? "is-active" : ""}
            onClick={() => setSubTab("storage")}
          >
            <i className="fa-solid fa-hard-drive" aria-hidden="true" /> Storage GC
          </button>
        </div>

        {subTab !== "storage" ? (
          <button
            type="button"
            className="admin-action-btn"
            onClick={() => void load()}
            disabled={loading}
          >
            <i className={`fa-solid fa-rotate ${loading ? "fa-spin" : ""}`} aria-hidden="true" /> Refresh
          </button>
        ) : null}
      </div>

      {subTab === "storage" ? (
        <section className="admin-directory">
          <div className="admin-directory-head">
            <div>
              <h2>Supabase Storage orphan maintenance</h2>
              <p>
                Scans the public <code>gallery</code> bucket against every live forum thread, reply, gallery build, and comment.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void scanStorage()}
                disabled={scanning || busyKey === "clean-storage"}
                className="btn-primary btn-sm"
              >
                <i className={`fa-solid fa-magnifying-glass ${scanning ? "fa-spin" : ""}`} aria-hidden="true" />
                {scanning ? "Scanning…" : "Scan Bucket"}
              </button>
              {scan && scan.orphanCount > 0 ? (
                <button
                  type="button"
                  onClick={() => void cleanOrphans()}
                  disabled={busyKey === "clean-storage"}
                  className="admin-confirm-remove"
                >
                  <i className="fa-solid fa-broom" aria-hidden="true" />
                  {busyKey === "clean-storage" ? "Cleaning…" : `Delete ${scan.orphanCount} Orphan(s)`}
                </button>
              ) : null}
            </div>
          </div>

          {!scan ? (
            <EmptyState
              className="admin-empty"
              icon="fa-hard-drive"
              title="Ready to scan storage"
              hint="Click Scan Bucket to compare uploaded image files against database references."
            />
          ) : !scan.configured ? (
            <EmptyState
              className="admin-empty"
              icon="fa-plug-circle-xmark"
              title="Supabase Storage not configured"
              hint="Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to inspect storage objects."
            />
          ) : (
            <div className="p-5 grid gap-4">
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-2)] p-4">
                  <div className="text-xs text-[var(--muted)]">Total bucket files</div>
                  <div className="text-xl font-bold text-[var(--fg)] mt-1 tabular-nums">{scan.totalObjects}</div>
                </div>
                <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-2)] p-4">
                  <div className="text-xs text-[var(--muted)]">Referenced by posts</div>
                  <div className="text-xl font-bold text-[var(--emerald)] mt-1 tabular-nums">
                    {scan.referencedCount}
                  </div>
                </div>
                <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-2)] p-4">
                  <div className="text-xs text-[var(--muted)]">Unreferenced orphans</div>
                  <div
                    className={`text-xl font-bold mt-1 tabular-nums ${
                      scan.orphanCount > 0 ? "text-[#ffd166]" : "text-[var(--fg)]"
                    }`}
                  >
                    {scan.orphanCount}
                  </div>
                </div>
              </div>

              {scan.orphans.length > 0 ? (
                <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg)] p-3.5 max-h-56 overflow-y-auto thin-scroll font-mono text-xs text-[var(--muted)]">
                  {scan.orphans.map((p) => (
                    <div key={p} className="py-0.5 truncate">
                      {p}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[var(--emerald)]">
                  <i className="fa-solid fa-circle-check mr-1.5" aria-hidden="true" />
                  Storage bucket is clean — zero orphaned files detected.
                </p>
              )}
            </div>
          )}
        </section>
      ) : (
        <section className="admin-directory">
          <div className="admin-toolbar">
            <label className="admin-search">
              <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
              <span className="sr-only">Filter moderation items</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search title, author, content, or poll question…"
              />
              {query ? (
                <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              ) : null}
            </label>
          </div>

          {loading ? (
            <div className="admin-loading">
              {[0, 1, 2, 3].map((r) => (
                <div key={r} />
              ))}
            </div>
          ) : subTab === "threads" ? (
            filteredThreads.length === 0 ? (
              <EmptyState
                className="admin-empty"
                icon="fa-comments"
                title="No threads found"
                hint={threads.length === 0 ? "Forum discussions will appear here." : "Try clearing your search query."}
              />
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {filteredThreads.map((t) => (
                  <div key={t.id} className="px-5 py-3.5 flex flex-col gap-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/forum/${t.id}`}
                            className="font-semibold text-sm text-[var(--fg)] hover:text-[var(--accent-bright)]"
                          >
                            {t.title}
                          </Link>
                          <span className="admin-pill">{t.category}</span>
                          {t.pinned ? (
                            <span className="admin-pill is-accent">
                              <i className="fa-solid fa-thumbtack" aria-hidden="true" /> Pinned
                            </span>
                          ) : null}
                          {t.locked ? (
                            <span className="admin-pill is-warn">
                              <i className="fa-solid fa-lock" aria-hidden="true" /> Locked
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs text-[var(--muted)]">
                          By {t.author} · {t.replies} repl{t.replies === 1 ? "y" : "ies"} · {t.views} views ·{" "}
                          {t.likes} like{t.likes === 1 ? "" : "s"}
                          {t.createdAt ? ` · ${timeAgo(t.createdAt)}` : ""}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => void toggleThreadFlag(t, "pinned")}
                          disabled={busyKey === `t-pinned-${t.id}`}
                          className="admin-action-btn"
                        >
                          <i className="fa-solid fa-thumbtack" aria-hidden="true" />
                          {t.pinned ? "Unpin" : "Pin"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void toggleThreadFlag(t, "locked")}
                          disabled={busyKey === `t-locked-${t.id}`}
                          className="admin-action-btn"
                        >
                          <i className={`fa-solid ${t.locked ? "fa-lock-open" : "fa-lock"}`} aria-hidden="true" />
                          {t.locked ? "Unlock" : "Lock"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmItem({ type: "thread", item: t })}
                          className="admin-action-btn is-danger"
                          aria-label={`Delete thread ${t.title}`}
                        >
                          <i className="fa-solid fa-trash" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    {t.poll ? (
                      <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-2)] px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <i className="fa-solid fa-square-poll-horizontal text-[var(--accent-bright)]" aria-hidden="true" />
                          <strong className="text-[var(--fg)] truncate">{t.poll.question}</strong>
                          <span className={`admin-pill ${t.poll.ended ? "" : "is-good"}`}>
                            {t.poll.ended ? "Ended" : "Active poll"}
                          </span>
                          <span className="text-[var(--muted)]">{t.poll.voteCount} vote(s)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {!t.poll.ended ? (
                            <button
                              type="button"
                              onClick={() => void endPollNow(t.poll!.pollId)}
                              disabled={busyKey === `poll-end-${t.poll.pollId}`}
                              className="admin-action-btn !min-h-7 !py-1 !px-2.5"
                            >
                              End now
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmItem({
                                type: "poll",
                                pollId: t.poll!.pollId,
                                question: t.poll!.question,
                              })
                            }
                            className="admin-action-btn is-danger !min-h-7 !py-1 !px-2.5"
                          >
                            Delete poll
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )
          ) : subTab === "comments" ? (
            filteredComments.length === 0 ? (
              <EmptyState
                className="admin-empty"
                icon="fa-reply"
                title="No recent replies or comments"
                hint="Forum replies and gallery build comments appear here newest first."
              />
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {filteredComments.map((c) => {
                  const href =
                    c.kind === "forum_reply" ? `/forum/${c.parentId}` : `/gallery?item=${c.parentId}`;
                  return (
                    <div key={`${c.kind}-${c.id}`} className="px-5 py-3.5 flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-semibold text-[var(--fg)]">{c.author}</span>
                          <span className="text-[var(--muted-2)]">on</span>
                          <Link href={href} className="font-medium text-[var(--accent-bright)] hover:underline">
                            {c.parentTitle}
                          </Link>
                          <span className="admin-pill">
                            {c.kind === "forum_reply" ? "Forum reply" : "Gallery comment"}
                          </span>
                          {c.pinned ? <span className="admin-pill is-accent">Pinned</span> : null}
                          {c.createdAt ? (
                            <span className="text-[var(--muted-2)]">{timeAgo(c.createdAt)}</span>
                          ) : null}
                        </div>
                        <p className="mt-1.5 text-xs text-[var(--fg-2)] line-clamp-3 whitespace-pre-wrap">
                          {c.content}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {c.kind === "forum_reply" ? (
                          <button
                            type="button"
                            onClick={() => void toggleReplyPin(c)}
                            disabled={busyKey === `c-pin-${c.id}`}
                            className="admin-action-btn"
                          >
                            <i className="fa-solid fa-thumbtack" aria-hidden="true" />
                            {c.pinned ? "Unpin" : "Pin"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setConfirmItem({ type: "comment", item: c })}
                          className="admin-action-btn is-danger"
                          aria-label={`Delete comment by ${c.author}`}
                        >
                          <i className="fa-solid fa-trash" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : filteredGallery.length === 0 ? (
            <EmptyState
              className="admin-empty"
              icon="fa-images"
              title="No gallery builds found"
              hint={gallery.length === 0 ? "Published community builds will appear here." : "Try clearing your search query."}
            />
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {filteredGallery.map((b) => (
                <div key={b.id} className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={b.image}
                      alt=""
                      className="w-12 h-12 rounded-[10px] object-cover border border-[var(--border)] flex-none bg-[var(--bg-2)]"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/gallery?item=${b.id}`}
                          className="font-semibold text-sm text-[var(--fg)] hover:text-[var(--accent-bright)] truncate"
                        >
                          {b.title}
                        </Link>
                        <span className="admin-pill">{b.category}</span>
                        {b.featured ? (
                          <span className="admin-pill is-good">
                            <i className="fa-solid fa-star" aria-hidden="true" /> Featured
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-[var(--muted)]">
                        Built by {b.builder} · {b.likes} like{b.likes === 1 ? "" : "s"} · {b.views} views
                        {b.createdAt ? ` · ${timeAgo(b.createdAt)}` : ""}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void toggleFeaturedBuild(b)}
                      disabled={busyKey === `b-feat-${b.id}`}
                      className="admin-action-btn"
                    >
                      <i className="fa-solid fa-star" aria-hidden="true" />
                      {b.featured ? "Unfeature" : "Feature"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmItem({ type: "build", item: b })}
                      className="admin-action-btn is-danger"
                      aria-label={`Delete build ${b.title}`}
                    >
                      <i className="fa-solid fa-trash" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {confirmItem ? (
        <Modal
          label="Confirm moderation delete"
          onClose={() => {
            if (busyKey !== "confirm-del") setConfirmItem(null);
          }}
          cardClassName="admin-confirm-modal"
        >
          <div className="admin-confirm-icon">
            <i className="fa-solid fa-trash" aria-hidden="true" />
          </div>
          <div>
            <span className="admin-confirm-kicker">Permanent deletion</span>
            <h2>
              {confirmItem.type === "thread"
                ? `Delete thread "${confirmItem.item.title}"?`
                : confirmItem.type === "build"
                  ? `Delete build "${confirmItem.item.title}"?`
                  : confirmItem.type === "poll"
                    ? `Delete poll "${confirmItem.question}"?`
                    : `Delete comment by ${confirmItem.item.author}?`}
            </h2>
            <p>
              This action cannot be undone and will be recorded in the admin audit log. Any unreferenced uploaded images will be garbage-collected automatically.
            </p>
          </div>
          <div className="admin-confirm-actions">
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => setConfirmItem(null)}
              disabled={busyKey === "confirm-del"}
            >
              Cancel
            </button>
            <button
              type="button"
              className="admin-confirm-remove"
              onClick={() => void executeConfirmedDelete()}
              disabled={busyKey === "confirm-del"}
            >
              <i className="fa-solid fa-trash" aria-hidden="true" /> Delete permanently
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
