"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { fallbackThreads } from "@/lib/fallback-data";
import type { ForumThread } from "@/types";
import { Avatar } from "@/components/Avatar";
import { SubPage } from "@/components/SubPage";
import { useApi } from "@/lib/use-api";
import { useToast } from "@/components/Toast";
import { useSession } from "@/lib/use-session";
import { timeAgo } from "@/lib/time";
import { CATEGORY_LIST, categoryClass } from "@/lib/forum-categories";

export default function ForumPage() {
  const { show } = useToast();
  const { user, loading: sessionLoading } = useSession();
  const { data: apiThreads, refetch } = useApi<ForumThread[]>("/api/forum", fallbackThreads);
  // Threads created this session (persisted server-side when a DB is present).
  const [fresh, setFresh] = useState<ForumThread[]>([]);
  // Pinned threads always float to the top, whether from the DB or this session.
  const threads = useMemo(
    () =>
      [...fresh, ...apiThreads].sort(
        (a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
      ),
    [fresh, apiThreads]
  );
  const [filter, setFilter] = useState<"all" | "pinned" | "hot">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
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

  const visible: ForumThread[] = (() => {
    let list = threads;
    if (categoryFilter !== "All") {
      list = list.filter((t) => t.category === categoryFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.content ?? "").toLowerCase().includes(q) ||
          t.author.toLowerCase().includes(q)
      );
    }
    if (filter === "pinned") list = list.filter((t) => t.pinned);
    if (filter === "hot") list = [...list].sort((a, b) => b.replies - a.replies);
    return list;
  })();

  const openModal = () => {
    // If the session is still loading, just open the modal — the composer
    // section inside decides what to show once we know who this is.
    setModalOpen(true);
  };

  const submit = async () => {
    const t = title.trim();
    const c = content.trim();
    if (!t || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/forum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t, content: c, category }),
      });
      if (res.ok) {
        const created = (await res.json()) as ForumThread;
        setFresh((prev) => [created, ...prev]);
        setTitle("");
        setContent("");
        setModalOpen(false);
      } else if (res.status === 401) {
        show("Sign in to post", "Log in with Discord to create threads.");
        setModalOpen(false);
      } else if (res.status === 503) {
        show("Can't post yet", "Posting needs the database — it isn't configured.");
        setModalOpen(false);
      } else if (res.status === 429) {
        show("Slow down", "You're posting too fast — wait a moment.");
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
    // Deleting is destructive and unrecoverable — confirm first.
    if (action === "delete") {
      const ok = window.confirm(`Delete "${thread.title}"? This can't be undone.`);
      if (!ok) return;
    }
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
        if (res.status === 503) {
          // No database configured — threads live only in client state, so
          // the server can't moderate them. Mirror the action locally so the
          // admin isn't stuck with an unpinnable/undeletable thread.
          if (action === "delete") {
            setFresh((prev) => prev.filter((t) => t.id !== thread.id));
            show("Deleted", `"${thread.title}" was removed.`);
          } else {
            setFresh((prev) =>
              prev.map((t) =>
                t.id === thread.id ? { ...t, pinned: !t.pinned } : t
              )
            );
            show(
              thread.pinned ? "Unpinned" : "Pinned",
              `"${thread.title}" ${thread.pinned ? "is no longer pinned" : "is now pinned"}.`
            );
          }
          return;
        }
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
        show(
          updated.pinned ? "Pinned" : "Unpinned",
          `"${thread.title}" ${updated.pinned ? "is now pinned" : "is no longer pinned"}.`
        );
      }
      // The DB thread's pinned flag changed — pull it back so the list
      // (and the pinned-first ordering) reflects the update immediately.
      void refetch();
    } catch {
      show("Couldn't update", "Check your connection and try again.");
    } finally {
      setBusyThread(null);
    }
  };

  const inputClass =
    "w-full bg-[var(--bg-2)] border border-[var(--border)] px-4 py-3 text-sm text-[var(--fg)] outline-none focus:border-[var(--accent)] transition placeholder:text-[var(--muted-2)] rounded-lg";

  return (
    <SubPage>
      <div className="w-full">
        {/* Header */}
        <div className="page-header rowed mb-8 gap-4">
          <h1 className="page-title">Forum</h1>
          <div className="flex items-center gap-3 flex-1 justify-end min-w-0">
            {/* Search — filters by title, body and author */}
            <div className="relative flex-1 max-w-xs min-w-[10rem]">
              <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-2)]" />
              <input
                className="w-full bg-[var(--bg-2)] border border-[var(--border)] pl-9 pr-8 py-2.5 text-sm text-[var(--fg)] outline-none focus:border-[var(--accent)] transition placeholder:text-[var(--muted-2)] rounded-lg"
                placeholder="Search threads…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search threads"
              />
              {search ? (
                <button
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-2)] hover:text-[var(--fg)] transition"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              ) : null}
            </div>
            <button
              className="btn-secondary py-2.5! px-5! text-xs! flex-shrink-0"
              onClick={openModal}
            >
              <i className="fa-solid fa-pen-to-square" />
              New Thread
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Threads list */}
          <div className="lg:col-span-2 card p-6">
            <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
              <h2 className="font-display text-lg font-bold">
                Recent discussions
                {visible.length > 0 ? (
                  <span className="ml-2 text-xs font-normal text-[var(--muted-2)]">
                    {visible.length}
                  </span>
                ) : null}
              </h2>
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

            <div id="forum-threads" className="space-y-3">
              {visible.length === 0 ? (
                <div className="text-sm text-[var(--muted)] py-12 text-center border border-dashed border-[var(--border)] rounded-xl">
                  <i className="fa-solid fa-comments text-3xl text-[var(--muted-2)] mb-3 block" />
                  {search.trim() || categoryFilter !== "All" ? (
                    <>
                      No threads match
                      {search.trim() ? ` "${search.trim()}"` : ""}
                      {categoryFilter !== "All" ? ` in ${categoryFilter}` : ""}.
                      <button
                        className="block mx-auto mt-3 text-[var(--accent)] hover:text-[var(--accent-bright)] transition"
                        onClick={() => {
                          setSearch("");
                          setCategoryFilter("All");
                        }}
                      >
                        Clear filters
                      </button>
                    </>
                  ) : (
                    "No threads yet — start the first discussion!"
                  )}
                </div>
              ) : (
                visible.map((t, i) => (
                  <div
                    key={t.id ?? `${i}-${t.title}`}
                    className={`relative ${t.pinned ? "thread-row-pinned" : ""}`}
                  >
                    {/* The whole post opens the thread (X-style feed) */}
                    <Link
                      href={`/forum/${t.id ?? ""}`}
                      className="absolute inset-0 z-0 rounded-xl"
                      aria-label={`Open thread: ${t.title}`}
                    />
                    <div className="relative z-10 thread-row group flex items-start gap-4 p-4 sm:p-5 pointer-events-none rounded-xl">
                      <Avatar name={t.author} src={t.avatarUrl} size="md" color={t.color} />
                      <div className="flex-1 min-w-0">
                        {/* Meta row: author · time · category · pinned */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-[var(--fg)]">
                            {t.author}
                          </span>
                          <span className="text-xs text-[var(--muted-2)]">· {timeAgo(t.last)}</span>
                          <span
                            className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border ${categoryClass(t.category)}`}
                          >
                            {t.category}
                          </span>
                          {t.pinned ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[var(--accent)] border border-[var(--accent)] rounded px-1.5 py-0.5">
                              <i className="fa-solid fa-thumbtack" /> Pinned
                            </span>
                          ) : null}
                        </div>
                        <h3 className="thread-title mt-1.5 text-base font-bold text-[var(--fg)] leading-snug line-clamp-2 group-hover:text-[var(--accent)] transition">
                          {t.title}
                        </h3>
                        {t.content ? (
                          <p className="mt-1 text-sm text-[var(--muted)] line-clamp-2">
                            {t.content}
                          </p>
                        ) : null}
                      </div>

                      {/* Right column: replies pill + moderation */}
                      <div className="pointer-events-auto relative z-20 flex flex-col items-end gap-2 flex-shrink-0">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--muted)] border border-[var(--border)] rounded-full px-2.5 py-1 group-hover:border-[var(--accent)]/50 group-hover:text-[var(--accent)] transition">
                          <i className="fa-regular fa-comment" />
                          {t.replies}
                        </span>
                        {isAdmin || (user && t.authorId === user.id && t.authorId !== "") ? (
                          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                            {isAdmin ? (
                              <button
                                className="w-8 h-8 flex items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition disabled:opacity-40"
                                onClick={() => void moderate(t, "pin")}
                                disabled={busyThread !== null}
                                aria-label={t.pinned ? "Unpin thread" : "Pin thread"}
                                title={t.pinned ? "Unpin" : "Pin"}
                              >
                                <i className={`fa-solid fa-thumbtack text-xs ${t.pinned ? "text-[var(--accent)]" : ""}`} />
                              </button>
                            ) : null}
                            <button
                              className="w-8 h-8 flex items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] hover:border-[var(--redstone)] hover:text-[var(--redstone)] transition disabled:opacity-40"
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
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:sticky lg:top-24 self-start">
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-base font-bold">Categories</h3>
                {categoryFilter !== "All" ? (
                  <button
                    className="text-xs text-[var(--accent)] hover:text-[var(--accent-bright)] transition"
                    onClick={() => setCategoryFilter("All")}
                  >
                    Reset
                  </button>
                ) : null}
              </div>
              <div className="space-y-1">
                {/* Clickable category filters. "All" resets; counts read
                    from real threads. */}
                {["All", ...CATEGORY_LIST].map((c) => {
                  const active = categoryFilter === c;
                  const count =
                    c === "All"
                      ? threads.length
                      : threads.filter((t) => t.category === c).length;
                  return (
                    <button
                      key={c}
                      className={`w-full flex items-center justify-between py-2 px-3 rounded-lg text-sm transition ${
                        active
                          ? "bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--accent)]/50 font-semibold"
                          : "text-[var(--fg-2)] border border-transparent hover:bg-white/5 hover:text-[var(--fg)]"
                      }`}
                      onClick={() => setCategoryFilter(c)}
                      aria-pressed={active}
                    >
                      <span className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full opacity-70" style={{ background: "currentColor" }} />
                        {c}
                      </span>
                      <span className="text-xs text-[var(--muted)]">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Signed-in as / sign-in prompt */}
            <div className="card p-6 mt-6">
              {user ? (
                <>
                  <h3 className="font-display text-base font-bold mb-1">Posting as</h3>
                  <p className="text-sm text-[var(--fg-2)] flex items-center gap-2">
                    <Avatar name={user.username} src={user.avatarUrl} size="sm" className="!w-6 !h-6" />
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
                    Sign in with Discord to create threads and reply.
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
          <div
            className="card p-6 w-full max-w-md"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-thread-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="new-thread-title" className="font-display text-xl font-bold mb-5">New Thread</h3>

            {user ? (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
              >
                <input
                  ref={titleRef}
                  className={inputClass}
                  placeholder="Thread title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={120}
                />
                <textarea
                  className={`${inputClass} min-h-[120px] resize-y`}
                  placeholder="What's on your mind? (optional)"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  maxLength={4000}
                />
                <div className="flex items-center gap-2 px-1 text-xs text-[var(--muted)]">
                  <Avatar name={user.username} src={user.avatarUrl} size="sm" className="!w-5 !h-5" />
                  Posting as <span className="text-[var(--fg-2)] font-medium">{user.username}</span>
                </div>
                <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORY_LIST.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <div className="flex gap-3 pt-1">
                  <button
                    type="submit"
                    className="btn-primary w-full"
                    disabled={submitting || !title.trim()}
                  >
                    {submitting ? "Posting…" : "Create Thread"}
                  </button>
                  <button type="button" className="btn-secondary w-full" onClick={() => setModalOpen(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : sessionLoading ? (
              <p className="text-sm text-[var(--muted)] text-center py-6">Checking session…</p>
            ) : (
              <div className="text-center py-4">
                <i className="fa-brands fa-discord text-3xl text-[#5865F2] mb-4 block" />
                <p className="text-sm text-[var(--muted)] mb-5">
                  Sign in with Discord to create a thread.
                </p>
                <Link href="/login" className="btn-primary w-full justify-center">
                  <i className="fa-brands fa-discord" />
                  Log in
                </Link>
                <button className="btn-ghost w-full mt-2" onClick={() => setModalOpen(false)}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </SubPage>
  );
}
