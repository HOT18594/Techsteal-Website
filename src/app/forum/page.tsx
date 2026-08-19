"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { fallbackThreads } from "@/lib/fallback-data";
import type { ForumThread } from "@/types";
import { SubPage } from "@/components/SubPage";
import { useApi } from "@/lib/use-api";
import { useToast } from "@/components/Toast";
import { useSession } from "@/lib/use-session";

export default function ForumPage() {
  const { show } = useToast();
  const { user, loading: sessionLoading } = useSession();
  const { data: apiThreads } = useApi<ForumThread[]>("/api/forum", fallbackThreads);
  // Threads created this session (persisted server-side when a DB is present).
  const [fresh, setFresh] = useState<ForumThread[]>([]);
  const threads = [...fresh, ...apiThreads];
  const [filter, setFilter] = useState<"all" | "pinned" | "hot">("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("General");
  const [submitting, setSubmitting] = useState(false);
  const [busyThread, setBusyThread] = useState<number | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const isAdmin = user?.role === "admin";

  // Escape closes the modal; autofocus the title field; lock body scroll.
  useEffect(() => {
    if (!modalOpen) return;
    titleRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModalOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [modalOpen]);

  const visible: ForumThread[] =
    filter === "all"
      ? threads
      : filter === "pinned"
        ? threads.filter((t) => t.pinned)
        : [...threads].sort((a, b) => b.replies - a.replies);

  const openModal = () => {
    if (!user) {
      show("Sign in to post", "Log in with Discord to create threads.");
      return;
    }
    setModalOpen(true);
  };

  const submit = async () => {
    const t = title.trim();
    if (!t || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/forum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t, category }),
      });
      if (res.ok) {
        const created = (await res.json()) as ForumThread;
        setFresh((prev) => [created, ...prev]);
        setTitle("");
        setModalOpen(false);
      } else if (res.status === 401) {
        show("Sign in to post", "Log in with Discord to create threads.");
        setModalOpen(false);
      } else {
        show("Couldn't create thread", "The server rejected the request.");
      }
    } catch {
      show("Couldn't create thread", "Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const moderate = async (thread: ForumThread, action: "delete" | "pin") => {
    if (busyThread !== null) return;
    setBusyThread(thread.id ?? 0);
    try {
      const res =
        action === "delete"
          ? await fetch("/api/forum", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: thread.id }),
            })
          : await fetch("/api/forum", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: thread.id, pinned: !thread.pinned }),
            });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        show("Couldn't update", data.error ?? "The server rejected the request.");
        return;
      }
      if (action === "delete") {
        setFresh((prev) => prev.filter((t) => t.id !== thread.id));
        show("Deleted", `"${thread.title}" was removed.`);
      } else {
        const updated = (await res.json()) as ForumThread;
        setFresh((prev) =>
          prev.map((t) => (t.id === updated.id ? { ...t, pinned: updated.pinned } : t))
        );
        show(updated.pinned ? "Pinned" : "Unpinned", `"${thread.title}" ${updated.pinned ? "is now pinned" : "is no longer pinned"}.`);
      }
    } catch {
      show("Couldn't update", "Check your connection and try again.");
    } finally {
      setBusyThread(null);
    }
  };

  const inputClass =
    "w-full bg-[var(--bg-2)] border border-[var(--border)] px-4 py-3 text-sm text-[var(--fg)] outline-none focus:border-[var(--accent)] transition placeholder:text-[var(--muted-2)] rounded-lg";

  return (
    <SubPage className="mx-auto max-w-7xl pt-6 pb-16">
      <div className="max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="page-header rowed mb-8">
          <div>
            <span className="page-kicker">
              <i className="fa-solid fa-comments" aria-hidden="true" />
              Community · Forum
            </span>
            <h1 className="page-title">Forum</h1>
          </div>
          <button
            className="btn-secondary py-2.5! px-5! text-xs!"
            onClick={openModal}
          >
            <i className="fa-solid fa-pen-to-square" />
            New Thread
          </button>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Threads list */}
          <div className="lg:col-span-2 card p-6">
            <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
              <h2 className="font-display text-lg font-bold">Recent discussions</h2>
              <div className="flex items-center gap-1 text-sm text-[var(--muted)]">
                {(["all", "pinned", "hot"] as const).map((f) => (
                  <button
                    key={f}
                    className={`px-3 py-1.5 rounded-lg capitalize transition ${
                      filter === f
                        ? "bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--accent)]"
                        : "border-transparent hover:text-[var(--accent)]"
                    }`}
                    onClick={() => setFilter(f)}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div id="forum-threads">
              {visible.length === 0 ? (
                <p className="text-sm text-[var(--muted)] py-10 text-center">
                  No threads yet.
                </p>
              ) : (
                visible.map((t) => (
                  <div
                    key={t.id ?? t.title}
                    className="thread-row py-3.5 px-2 flex items-center gap-4"
                  >
                    <div className={`avatar avatar-2 size-sm ${t.color}`}>{t.avatar}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {t.pinned ? (
                          <i className="fa-solid fa-thumbtack text-[var(--accent)] text-xs" />
                        ) : null}
                        <span className={`tag ${t.tagClass}`}>{t.category}</span>
                      </div>
                      <div className="thread-title text-[var(--fg)] font-medium truncate">
                        {t.title}
                      </div>
                      <div className="text-xs text-[var(--muted)] mt-1">
                        by {t.author} · {t.last}
                      </div>
                    </div>
                    <div className="text-right hidden sm:block">
                      <div className="font-display text-lg text-[var(--accent)]">{t.replies}</div>
                      <div className="text-xs text-[var(--muted)] uppercase tracking-wider">replies</div>
                    </div>
                    {/* Admin moderation */}
                    {isAdmin ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          className="w-9 h-9 flex items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition disabled:opacity-40"
                          onClick={() => void moderate(t, "pin")}
                          disabled={busyThread !== null}
                          aria-label={t.pinned ? "Unpin thread" : "Pin thread"}
                          title={t.pinned ? "Unpin" : "Pin"}
                        >
                          <i className={`fa-solid fa-thumbtack text-xs ${t.pinned ? "text-[var(--accent)]" : ""}`} />
                        </button>
                        <button
                          className="w-9 h-9 flex items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] hover:border-[var(--redstone)] hover:text-[var(--redstone)] transition disabled:opacity-40"
                          onClick={() => void moderate(t, "delete")}
                          disabled={busyThread !== null}
                          aria-label="Delete thread"
                          title="Delete"
                        >
                          <i className="fa-solid fa-trash text-xs" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Categories sidebar */}
          <div>
            <div className="card p-6">
              <h3 className="font-display text-base font-bold mb-4">Categories</h3>
              <div className="space-y-1">
                {["Announcements", "Ideas", "Builds", "Redstone", "Technical", "Off-topic"].map(
                  (c) => (
                    <div
                      key={c}
                      className="flex items-center justify-between py-2 px-3 rounded-lg text-sm text-[var(--fg-2)]"
                    >
                      <span>{c}</span>
                      <span className="text-xs text-[var(--muted)]">
                        {threads.filter((t) => t.category === c).length}
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>

            {/* Signed-in as / sign-in prompt */}
            <div className="card p-6 mt-6">
              {user ? (
                <>
                  <h3 className="font-display text-base font-bold mb-1">Posting as</h3>
                  <p className="text-sm text-[var(--fg-2)] flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-gradient-to-br from-[var(--accent)] to-[var(--accent-bright)] flex items-center justify-center font-display font-bold text-white text-xs">
                      {user.username.charAt(0).toUpperCase()}
                    </span>
                    {user.username}
                    {isAdmin ? (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent)] border border-[var(--accent)] rounded px-1.5 py-0.5">
                        Admin
                      </span>
                    ) : null}
                  </p>
                </>
              ) : sessionLoading ? (
                <p className="text-sm text-[var(--muted)]">Checking session…</p>
              ) : (
                <>
                  <h3 className="font-display text-base font-bold mb-1">Want to post?</h3>
                  <p className="text-sm text-[var(--muted)] mb-3">
                    Sign in with Discord to create threads.
                  </p>
                  <Link href="/login" className="btn-primary w-full py-2.5! text-xs! justify-center">
                    <i className="fa-brands fa-discord" />
                    Log in
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* New thread modal */}
      {modalOpen ? (
        <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className="card p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-xl font-bold mb-5">New Thread</h3>
            <div className="space-y-3">
              <input
                ref={titleRef}
                className={inputClass}
                placeholder="Thread title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              {user ? (
                <div className="flex items-center gap-2 px-1 text-xs text-[var(--muted)]">
                  <span className="w-5 h-5 rounded bg-gradient-to-br from-[var(--accent)] to-[var(--accent-bright)] flex items-center justify-center font-display font-bold text-white text-[10px]">
                    {user.username.charAt(0).toUpperCase()}
                  </span>
                  Posting as <span className="text-[var(--fg-2)] font-medium">{user.username}</span>
                </div>
              ) : null}
              <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="General">General</option>
                {["Announcements", "Ideas", "Builds", "Redstone", "Technical", "Off-topic"].map(
                  (c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  )
                )}
              </select>
              <div className="flex gap-3 pt-1">
                <button className="btn-primary w-full" onClick={() => void submit()} disabled={submitting || !title.trim()}>
                  {submitting ? "Posting…" : "Create Thread"}
                </button>
                <button className="btn-secondary w-full" onClick={() => setModalOpen(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </SubPage>
  );
}
