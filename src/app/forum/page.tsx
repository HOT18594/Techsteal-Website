"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fallbackThreads } from "@/lib/fallback-data";
import type { ForumThread } from "@/types";
import { Avatar } from "@/components/Avatar";
import { SubPage } from "@/components/SubPage";
import { Modal } from "@/components/Modal";
import { RichEditor } from "@/components/RichEditor";
import { EMPTY_POLL_DRAFT, PollBuilder, pollDraftPayload, pollDraftValid, type PollDraft } from "@/components/Poll";
import { useToast } from "@/components/Toast";
import { useSession } from "@/lib/use-session";
import { timeAgo } from "@/lib/time";
import { markdownExcerpt } from "@/lib/excerpt";
import { CATEGORY_LIST, categoryClass } from "@/lib/forum-categories";
import { ErrorState } from "@/components/EmptyState";

const SORTS = [
  { id: "new", label: "Latest" },
  { id: "top", label: "Top" },
  { id: "hot", label: "Hot" },
  { id: "views", label: "Most viewed" },
] as const;

interface ListData {
  threads: ForumThread[];
  total: number;
  page: number;
  perPage: number;
  hasMore: boolean;
  categoryCounts: Record<string, number>;
}

export default function ForumPage() {
  const { show } = useToast();
  const router = useRouter();
  const { user, loading: sessionLoading } = useSession();
  const isAdmin = user?.role === "admin";

  // ------------------------------------------------------------------
  // List state — server-side search/sort/pagination.
  // ------------------------------------------------------------------
  const [list, setList] = useState<ListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<(typeof SORTS)[number]["id"]>("new");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [unanswered, setUnanswered] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const reqRef = useRef(0);

  // Debounce the search box so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    const reqId = ++reqRef.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), sort });
      if (debouncedQ) params.set("q", debouncedQ);
      if (categoryFilter !== "All") params.set("category", categoryFilter);
      if (unanswered) params.set("unanswered", "1");
      const res = await fetch(`/api/forum?${params.toString()}`);
      if (!res.ok) throw new Error("list failed");
      const data = (await res.json()) as ListData | ForumThread[];
      if (reqId !== reqRef.current) return;
      // No-DB mode returns a bare array (fallback content) — normalize it.
      if (Array.isArray(data)) {
        setList({ threads: data, total: data.length, page: 1, perPage: data.length, hasMore: false, categoryCounts: {} });
      } else {
        setList(data);
        // The server clamps out-of-range pages (e.g. threads deleted while
        // the user sits on page 5) — follow it so the pager stays truthful.
        if (data.page !== page) setPage(data.page);
      }
      setLoadError(false);
    } catch {
      if (reqId === reqRef.current) {
        setList(null);
        setLoadError(true); // an outage must not read as "no threads yet"
      }
    } finally {
      if (reqId === reqRef.current) setLoading(false);
    }
  }, [page, sort, debouncedQ, categoryFilter, unanswered]);

  useEffect(() => {
    void load();
  }, [load]);

  const threads = list?.threads ?? [];
  const totalPages = list ? Math.max(1, Math.ceil(list.total / list.perPage)) : 1;
  const totalThreads =
    list?.total ??
    (Array.isArray(fallbackThreads) ? fallbackThreads.length : 0);

  // ------------------------------------------------------------------
  // Composer state.
  // ------------------------------------------------------------------
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("General");
  const [withPoll, setWithPoll] = useState(false);
  const [pollDraft, setPollDraft] = useState<PollDraft>(EMPTY_POLL_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

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

  const openModal = () => setModalOpen(true);

  const submit = async () => {
    const t = title.trim();
    if (!t || submitting) return;
    if (withPoll && !pollDraftValid(pollDraft)) {
      show("Poll incomplete", "Give it a question, two options, and a future end date.", "error");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/forum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: t,
          content: content.trim(),
          category,
          ...(withPoll && isAdmin ? { poll: pollDraftPayload(pollDraft) } : {}),
        }),
      });
      if (res.ok) {
        const created = (await res.json()) as ForumThread;
        setModalOpen(false);
        setTitle("");
        setContent("");
        setWithPoll(false);
        setPollDraft(EMPTY_POLL_DRAFT);
        show("Posted", "Your thread is live.");
        // Straight to the new thread — it may have a poll to admire.
        if (created.id) router.push(`/forum/${created.id}`);
        else void load();
      } else if (res.status === 401) {
        show("Sign in to post", "Log in with Discord to create threads.", "error");
        setModalOpen(false);
      } else if (res.status === 429) {
        show("Slow down", "You're posting too fast — wait a moment.", "error");
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        show("Couldn't create thread", data.error ?? "The server rejected the request.", "error");
      }
    } catch {
      show("Couldn't create thread", "Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ------------------------------------------------------------------
  // Moderation from the list (admin pin/lock/delete; owner delete).
  // ------------------------------------------------------------------
  const [busyThread, setBusyThread] = useState<number | null>(null);

  const moderate = async (
    thread: ForumThread,
    action: "delete" | "pin" | "lock"
  ) => {
    if (busyThread !== null) return;
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
              body: JSON.stringify({
                id: thread.id,
                ...(action === "pin" ? { pinned: !thread.pinned } : { locked: !thread.locked }),
              }),
            });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        show("Couldn't update", data.error ?? "The server rejected the request.");
        return;
      }
      show(
        action === "delete" ? "Deleted" : action === "pin" ? (thread.pinned ? "Unpinned" : "Pinned") : thread.locked ? "Unlocked" : "Locked",
        action === "delete"
          ? `"${thread.title}" was removed.`
          : action === "pin"
            ? `"${thread.title}" ${thread.pinned ? "is no longer pinned" : "is now pinned"}.`
            : `"${thread.title}" ${thread.locked ? "accepts replies again" : "no longer accepts replies"}.`
      );
      void load();
    } catch {
      show("Couldn't update", "Check your connection and try again.");
    } finally {
      setBusyThread(null);
    }
  };

  const inputClass =
    "w-full bg-[var(--bg-2)] border border-[var(--border)] px-4 py-3 text-sm text-[var(--fg)] outline-none focus:border-[var(--accent)] transition placeholder:text-[var(--muted-2)] rounded-lg";

  const canModerate = (t: ForumThread) =>
    isAdmin || (user && t.authorId === user.id && t.authorId !== "");

  return (
    <SubPage>
      <div className="w-full">
        {/* Header */}
        <div className="page-header rowed mb-8 gap-4">
          <h1 className="page-title">Forum</h1>
          <div className="flex items-center gap-3 flex-1 justify-end min-w-0">
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
            <button className="btn-secondary btn-sm flex-shrink-0" onClick={openModal}>
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
                Discussions
                {list ? (
                  <span className="ml-2 text-xs font-normal text-[var(--muted-2)]">
                    {list.total === list.threads.length
                      ? list.total
                      : `${(list.page - 1) * list.perPage + 1}–${(list.page - 1) * list.perPage + list.threads.length} of ${list.total}`}
                  </span>
                ) : null}
              </h2>
              <div className="flex items-center gap-1 text-sm text-[var(--muted)] flex-wrap">
                {SORTS.map((s) => (
                  <button
                    key={s.id}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      sort === s.id
                        ? "bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--accent)]"
                        : "border-transparent hover:text-[var(--accent)]"
                    }`}
                    onClick={() => {
                      setSort(s.id);
                      setPage(1);
                    }}
                  >
                    {s.label}
                  </button>
                ))}
                <button
                  className={`px-3 py-1.5 rounded-lg transition border ${
                    unanswered
                      ? "bg-[var(--accent-dim)] text-[var(--accent)] border-[var(--accent)]"
                      : "border-transparent hover:text-[var(--accent)]"
                  }`}
                  onClick={() => {
                    setUnanswered((u) => !u);
                    setPage(1);
                  }}
                  title="Threads with no replies yet"
                >
                  Unanswered
                </button>
              </div>
            </div>

            <div id="forum-threads" className="space-y-3 stagger">
              {loading && !list ? (
                <p className="text-sm text-[var(--muted)] py-12 text-center">Loading threads…</p>
              ) : loadError && !list ? (
                <ErrorState onRetry={() => void load()} what="threads" />
              ) : threads.length === 0 ? (
                <div className="text-sm text-[var(--muted)] py-12 text-center border border-dashed border-[var(--border)] rounded-xl">
                  <i className="fa-solid fa-comments text-3xl text-[var(--muted-2)] mb-3 block" />
                  {search.trim() || categoryFilter !== "All" || unanswered ? (
                    <>
                      No threads match
                      {search.trim() ? ` "${search.trim()}"` : ""}
                      {categoryFilter !== "All" ? ` in ${categoryFilter}` : ""}
                      {unanswered ? " (unanswered)" : ""}.
                      <button
                        className="block mx-auto mt-3 text-[var(--accent)] hover:text-[var(--accent-bright)] transition"
                        onClick={() => {
                          setSearch("");
                          setCategoryFilter("All");
                          setUnanswered(false);
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
                threads.map((t, i) => (
                  <div key={t.id ?? `${i}-${t.title}`} className={`relative ${t.pinned ? "thread-row-pinned" : ""}`}>
                    <div className="relative thread-row group rounded-xl">
                      {/* The whole post opens the thread (X-style feed). The
                          link is the hit target; the visual row opts out of
                          pointer events so hover still lands on this wrapper
                          and .thread-row:hover / group-hover styles apply. */}
                      <Link
                        href={`/forum/${t.id ?? ""}`}
                        className="absolute inset-0 z-0 rounded-xl"
                        aria-label={`Open thread: ${t.title}`}
                      />
                      <div className="relative z-10 flex items-start gap-4 p-4 sm:p-5 pointer-events-none">
                      <Avatar name={t.author} src={t.avatarUrl} size="md" color={t.color} />
                      <div className="flex-1 min-w-0">
                        {/* Meta row: author · time · category · badges */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-[var(--fg)]">{t.author}</span>
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
                          {t.locked ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[var(--diamond)] border border-[var(--diamond)]/40 rounded px-1.5 py-0.5">
                              <i className="fa-solid fa-lock" /> Locked
                            </span>
                          ) : null}
                          {t.hasPoll ? (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[var(--diamond)] border border-[var(--diamond)]/40 bg-[var(--diamond)]/10 rounded px-1.5 py-0.5"
                              title="This thread has a poll"
                            >
                              <i className="fa-solid fa-square-poll-vertical" /> Poll
                            </span>
                          ) : null}
                        </div>
                        <h3 className="thread-title mt-1.5 text-base font-bold text-[var(--fg)] leading-snug line-clamp-2 group-hover:text-[var(--accent)] transition">
                          {t.title}
                        </h3>
                        {t.content ? (
                          <p className="mt-1 text-sm text-[var(--muted)] line-clamp-2">
                            {markdownExcerpt(t.content)}
                          </p>
                        ) : null}
                      </div>

                      {/* Right column: stats + moderation */}
                      <div className="pointer-events-auto relative z-20 flex flex-col items-end gap-2 flex-shrink-0">
                        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--muted)]">
                          <span
                            className="inline-flex items-center gap-1.5 border border-[var(--border)] rounded-full px-2.5 py-1 group-hover:border-[var(--accent)]/50 group-hover:text-[var(--accent)] transition"
                            title="Replies"
                          >
                            <i className="fa-regular fa-comment" />
                            {t.replies}
                          </span>
                          <span
                            className="inline-flex items-center gap-1.5 border border-[var(--border)] rounded-full px-2.5 py-1 group-hover:border-[var(--redstone)]/50 group-hover:text-[var(--redstone)] transition"
                            title="Likes"
                          >
                            <i className="fa-solid fa-heart" />
                            {t.likes ?? 0}
                          </span>
                          {(t.views ?? 0) > 0 ? (
                            <span
                              className="hidden sm:inline-flex items-center gap-1.5 border border-[var(--border)] rounded-full px-2.5 py-1 transition"
                              title="Views"
                            >
                              <i className="fa-regular fa-eye" />
                              {t.views}
                            </span>
                          ) : null}
                        </div>
                        {canModerate(t) ? (
                          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                            {isAdmin ? (
                              <>
                                <button
                                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition disabled:opacity-40"
                                  onClick={() => void moderate(t, "pin")}
                                  disabled={busyThread !== null}
                                  aria-label={t.pinned ? "Unpin thread" : "Pin thread"}
                                  title={t.pinned ? "Unpin" : "Pin"}
                                >
                                  <i className={`fa-solid fa-thumbtack text-xs ${t.pinned ? "text-[var(--accent)]" : ""}`} />
                                </button>
                                <button
                                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] hover:border-[var(--diamond)] hover:text-[var(--diamond)] transition disabled:opacity-40"
                                  onClick={() => void moderate(t, "lock")}
                                  disabled={busyThread !== null}
                                  aria-label={t.locked ? "Unlock thread" : "Lock thread"}
                                  title={t.locked ? "Unlock (allow replies)" : "Lock (close replies)"}
                                >
                                  <i className={`fa-solid text-xs ${t.locked ? "fa-lock text-[var(--diamond)]" : "fa-lock-open"}`} />
                                </button>
                              </>
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
                  </div>
                ))
              )}
            </div>

            {/* Pagination */}
            {list && totalPages > 1 ? (
              <div className="flex items-center justify-center gap-3 mt-6 text-sm">
                <button
                  className="btn-secondary btn-sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <i className="fa-solid fa-chevron-left" /> Prev
                </button>
                <span className="text-[var(--muted)] text-xs">
                  Page {page} of {totalPages}
                </span>
                <button
                  className="btn-secondary btn-sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next <i className="fa-solid fa-chevron-right" />
                </button>
              </div>
            ) : null}
          </div>

          {/* Sidebar */}
          <div className="lg:sticky lg:top-24 self-start">
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-base font-bold">Categories</h3>
                {categoryFilter !== "All" ? (
                  <button
                    className="text-xs text-[var(--accent)] hover:text-[var(--accent-bright)] transition"
                    onClick={() => {
                      setCategoryFilter("All");
                      setPage(1);
                    }}
                  >
                    Reset
                  </button>
                ) : null}
              </div>
              <div className="space-y-1">
                {["All", ...CATEGORY_LIST].map((c) => {
                  const active = categoryFilter === c;
                  const count =
                    c === "All" ? totalThreads : list?.categoryCounts?.[c] ?? 0;
                  return (
                    <button
                      key={c}
                      className={`w-full flex items-center justify-between py-2 px-3 rounded-lg text-sm transition ${
                        active
                          ? "bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--accent)]/50 font-semibold"
                          : "text-[var(--fg-2)] border border-transparent hover:bg-white/5 hover:text-[var(--fg)]"
                      }`}
                      onClick={() => {
                        setCategoryFilter(c);
                        setPage(1);
                      }}
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
                    <Avatar name={user.username} src={user.avatarUrl} size="sm" className="w-6! h-6!" />
                    {user.username}
                    {isAdmin ? (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent)] border border-[var(--accent)] rounded px-1.5 py-0.5">
                        Admin
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-[var(--muted-2)] mt-2">
                    Posts support markdown, images and spoilers.
                    {isAdmin ? " Admins can attach polls with an end date." : ""}
                  </p>
                </>
              ) : sessionLoading ? (
                <p className="text-sm text-[var(--muted)]">Checking session…</p>
              ) : (
                <>
                  <h3 className="font-display text-base font-bold mb-1">Want to post?</h3>
                  <p className="text-sm text-[var(--muted)] mb-3">
                    Sign in with Discord to create threads, reply, and vote in polls.
                  </p>
                  <Link href="/login?next=/forum" className="btn-primary w-full justify-center">
                    <i className="fa-brands fa-discord" />
                    Log in
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* New thread modal — portal to body so it covers the viewport */}
      {modalOpen ? (
        <Modal
          label="New Thread"
          onClose={() => setModalOpen(false)}
          cardClassName="p-6 w-full max-w-2xl flex flex-col max-h-[calc(100dvh-3rem)]"
        >
            <h3 id="new-thread-title" className="font-display text-xl font-bold mb-4 flex-shrink-0">New Thread</h3>

            {user ? (
              <form
                className="modal-scroll space-y-4 pr-1 -mr-1"
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
                <div className="flex items-center gap-2 px-1 text-xs text-[var(--muted)]">
                  <Avatar name={user.username} src={user.avatarUrl} size="sm" className="w-5! h-5!" />
                  Posting as <span className="text-[var(--fg-2)] font-medium">{user.username}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
                    {CATEGORY_LIST.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  {isAdmin ? (
                    <button
                      type="button"
                      className={`btn-sm justify-center border rounded-lg transition flex items-center gap-2 px-4 ${
                        withPoll
                          ? "border-[var(--diamond)] text-[var(--diamond)] bg-[var(--diamond)]/10"
                          : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)]"
                      }`}
                      onClick={() => setWithPoll((p) => !p)}
                      aria-pressed={withPoll}
                    >
                      <i className="fa-solid fa-square-poll-vertical" />
                      {withPoll ? "Poll attached" : "Add a poll"}
                    </button>
                  ) : null}
                </div>

                <RichEditor
                  idPrefix="new-thread"
                  value={content}
                  onChange={setContent}
                  rows={8}
                  maxLength={20000}
                  placeholder="What's on your mind? Markdown, images (paste/drag), spoilers…"
                  onUploadError={(m) => show("Couldn't upload image", m, "error")}
                />

                {withPoll && isAdmin ? (
                  <div className="border border-[var(--diamond)]/30 rounded-xl p-4 bg-[var(--diamond)]/5">
                    <PollBuilder draft={pollDraft} onChange={setPollDraft} />
                  </div>
                ) : null}

                <div className="flex gap-3 pt-1">
                  <button
                    type="submit"
                    className="btn-primary w-full"
                    disabled={submitting || !title.trim() || (withPoll && !pollDraftValid(pollDraft))}
                  >
                    {submitting ? "Posting…" : withPoll ? "Post Thread + Poll" : "Create Thread"}
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
                <Link href="/login?next=/forum" className="btn-primary w-full justify-center">
                  <i className="fa-brands fa-discord" />
                  Log in
                </Link>
                <button className="btn-ghost w-full mt-2" onClick={() => setModalOpen(false)}>
                  Cancel
                </button>
              </div>
            )}
        </Modal>
      ) : null}
    </SubPage>
  );
}
