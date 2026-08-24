"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { Markdown } from "@/components/Markdown";
import { RichEditor } from "@/components/RichEditor";
import { PollViewer } from "@/components/Poll";
import { useToast } from "@/components/Toast";
import { SubPage } from "@/components/SubPage";
import { useSession } from "@/lib/use-session";
import { timeAgo } from "@/lib/time";
import { categoryClass } from "@/lib/forum-categories";
import { ErrorState } from "@/components/EmptyState";
import type { ForumPoll, ForumReply, ForumThread } from "@/types";

/** Pinned comments first, then oldest. */
function sortReplies(rs: ForumReply[]): ForumReply[] {
  return [...rs].sort(
    (a, b) =>
      Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
      (a.id ?? 0) - (b.id ?? 0)
  );
}

export default function ThreadPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { show } = useToast();
  const { user, loading: sessionLoading } = useSession();
  const isAdmin = user?.role === "admin";

  const [thread, setThread] = useState<ForumThread | null>(null);
  const [replies, setReplies] = useState<ForumReply[]>([]);
  const [poll, setPoll] = useState<ForumPoll | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [busyReply, setBusyReply] = useState<number | null>(null);
  const [busyLike, setBusyLike] = useState<number | "thread" | null>(null);
  const [busyThreadAction, setBusyThreadAction] = useState(false);

  // Inline editing state (thread or reply).
  const [editing, setEditing] = useState<{ kind: "thread" | "reply"; id: number; title?: string; content: string } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Sequence-guarded load: navigating between two threads keeps this page
  // mounted (only `id` changes), so a slow response for thread A must never
  // land after thread B's and overwrite it. Per-thread UI state (inline
  // edits, the reply draft) belongs to the old thread — reset it too, or an
  // open editor would save its contents to the WRONG thread id.
  const reqRef = useRef(0);
  const load = useCallback(async () => {
    const reqId = ++reqRef.current;
    setLoading(true);
    setNotFound(false); // a previous failed load must not stick
    setLoadError(false);
    setEditing(null);
    setReplyText("");
    setBusyReply(null);
    setBusyLike(null);
    try {
      const res = await fetch(`/api/forum/${id}`);
      if (res.status === 404) {
        if (reqId === reqRef.current) setNotFound(true);
        return;
      }
      if (!res.ok) throw new Error(`thread ${res.status}`);
      const data = (await res.json()) as {
        thread: ForumThread;
        replies: ForumReply[];
        poll: ForumPoll | null;
      };
      if (reqId !== reqRef.current) return; // a newer load won
      setThread(data.thread);
      setReplies(sortReplies(data.replies));
      setPoll(data.poll);
    } catch {
      if (reqId === reqRef.current) setLoadError(true); // transient — offer retry
    } finally {
      if (reqId === reqRef.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // ------------------------------------------------------------------
  // Replies
  // ------------------------------------------------------------------

  const submitReply = async () => {
    const text = replyText.trim();
    if (!text || replying) return;
    setReplying(true);
    try {
      const res = await fetch(`/api/forum/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      if (res.ok) {
        const created = (await res.json()) as ForumReply;
        setReplies((prev) => sortReplies([...prev, created]));
        setThread((t) => (t ? { ...t, replies: t.replies + 1 } : t));
        setReplyText("");
      } else if (res.status === 401) {
        show("Sign in to reply", "Log in with Discord to reply.", "error");
      } else if (res.status === 423) {
        show("Thread locked", "This thread no longer accepts replies.", "error");
        setThread((t) => (t ? { ...t, locked: true } : t));
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        show("Couldn't reply", data.error ?? "The server rejected the request.", "error");
      }
    } catch {
      show("Couldn't reply", "Check your connection and try again.");
    } finally {
      setReplying(false);
    }
  };

  const deleteReply = async (reply: ForumReply) => {
    if (busyReply !== null) return;
    const ok = window.confirm("Delete this reply? This can't be undone.");
    if (!ok) return;
    setBusyReply(reply.id ?? 0);
    try {
      const res = await fetch(`/api/forum/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replyId: reply.id }),
      });
      if (!res.ok) {
        show("Couldn't delete", "The server rejected the request.", "error");
        return;
      }
      setReplies((prev) => prev.filter((r) => r.id !== reply.id));
      setThread((t) => (t ? { ...t, replies: Math.max(0, t.replies - 1) } : t));
      show("Deleted", "Reply removed.");
    } catch {
      show("Couldn't delete", "Check your connection and try again.");
    } finally {
      setBusyReply(null);
    }
  };

  // ------------------------------------------------------------------
  // Likes — replies and the thread itself.
  // ------------------------------------------------------------------

  /** Toggle the signed-in user's like (optimistic). */
  const toggleLikeReply = async (reply: ForumReply) => {
    if (!user) {
      show("Sign in to like", "Log in with Discord to like comments.", "error");
      return;
    }
    if (busyLike !== null) return;
    setBusyLike(reply.id ?? 0);
    const liked = reply.liked === true;
    setReplies((prev) =>
      prev.map((r) =>
        r.id === reply.id
          ? { ...r, liked: !liked, likes: (r.likes ?? 0) + (liked ? -1 : 1) }
          : r
      )
    );
    try {
      const res = await fetch(`/api/forum/${id}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replyId: reply.id }),
      });
      if (!res.ok) throw new Error(`like failed (${res.status})`);
      const data = await res.json() as { reply: ForumReply; liked: boolean };
      setReplies((prev) => prev.map((r) => (r.id === reply.id ? { ...data.reply, liked: data.liked } : r)));
    } catch {
      setReplies((prev) =>
        prev.map((r) =>
          r.id === reply.id ? { ...r, liked: reply.liked ?? false, likes: reply.likes ?? 0 } : r
        )
      );
      show("Couldn't like", "The server rejected the request.", "error");
    } finally {
      setBusyLike(null);
    }
  };

  const toggleLikeThread = async () => {
    if (!user) {
      show("Sign in to like", "Log in with Discord to like posts.", "error");
      return;
    }
    if (!thread || busyLike !== null) return;
    setBusyLike("thread");
    const liked = thread.liked === true;
    setThread((t) =>
      t ? { ...t, liked: !liked, likes: (t.likes ?? 0) + (liked ? -1 : 1) } : t
    );
    try {
      const res = await fetch(`/api/forum/${id}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`like failed (${res.status})`);
      const data = await res.json() as { thread: ForumThread; liked: boolean };
      setThread((t) =>
        t
          ? {
              ...t,
              likes: data.thread.likes,
              liked: data.liked,
            }
          : t
      );
    } catch {
      setThread((t) => (t ? { ...t, liked: thread.liked ?? false, likes: thread.likes ?? 0 } : t));
      show("Couldn't like", "The server rejected the request.", "error");
    } finally {
      setBusyLike(null);
    }
  };

  // ------------------------------------------------------------------
  // Poll voting.
  // ------------------------------------------------------------------

  const castVote = async (optionId: string) => {
    const res = await fetch(`/api/forum/${id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optionId }),
    });
    const data = (await res.json().catch(() => ({}))) as { poll?: ForumPoll; error?: string };
    if (!res.ok || !data.poll) {
      throw new Error(data.error ?? "Couldn't vote — try again.");
    }
    setPoll(data.poll);
  };

  // ------------------------------------------------------------------
  // Moderation: pin/lock/delete thread, pin reply.
  // ------------------------------------------------------------------

  const threadAction = async (action: "pin" | "lock" | "delete") => {
    if (!thread || busyThreadAction) return;
    if (action === "delete") {
      const ok = window.confirm(`Delete "${thread.title}"? This can't be undone.`);
      if (!ok) return;
    }
    setBusyThreadAction(true);
    try {
      if (action === "delete") {
        const res = await fetch("/api/forum", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: thread.id }),
        });
        if (!res.ok) {
          show("Couldn't delete", "The server rejected the request.", "error");
          return;
        }
        show("Deleted", "Thread removed.");
        router.push("/forum");
        return;
      }
      const res = await fetch("/api/forum", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: thread.id,
          ...(action === "pin" ? { pinned: !thread.pinned } : { locked: !thread.locked }),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        show("Couldn't update", data.error ?? "The server rejected the request.", "error");
        return;
      }
      const updated = (await res.json()) as ForumThread;
      setThread((t) => (t ? { ...t, pinned: updated.pinned, locked: updated.locked } : t));
      show(
        action === "pin" ? (updated.pinned ? "Pinned" : "Unpinned") : updated.locked ? "Locked" : "Unlocked",
        action === "pin"
          ? `Thread ${updated.pinned ? "is now pinned" : "is no longer pinned"}.`
          : `Replies are ${updated.locked ? "closed" : "open"} again.`
      );
    } catch {
      show("Couldn't update", "Check your connection and try again.");
    } finally {
      setBusyThreadAction(false);
    }
  };

  const pinReply = async (reply: ForumReply) => {
    if (!isAdmin || busyReply !== null) return;
    setBusyReply(reply.id ?? 0);
    try {
      const res = await fetch(`/api/forum/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replyId: reply.id, pinned: !reply.pinned }),
      });
      if (!res.ok) {
        show("Couldn't update", "The server rejected the request.", "error");
        return;
      }
      const updated = (await res.json()) as ForumReply;
      setReplies((prev) => sortReplies(prev.map((r) => (r.id === updated.id ? updated : r))));
      show(updated.pinned ? "Pinned" : "Unpinned", `Comment ${updated.pinned ? "pinned" : "unpinned"}.`);
    } catch {
      show("Couldn't update", "Check your connection and try again.");
    } finally {
      setBusyReply(null);
    }
  };

  // ------------------------------------------------------------------
  // Editing (thread + replies).
  // ------------------------------------------------------------------

  const startEditThread = () => {
    if (!thread) return;
    setEditing({ kind: "thread", id: thread.id ?? 0, title: thread.title, content: thread.content ?? "" });
  };

  const startEditReply = (r: ForumReply) => {
    setEditing({ kind: "reply", id: r.id ?? 0, content: r.content });
  };

  const saveEdit = async () => {
    if (!editing || savingEdit) return;
    const content = editing.content.trim();
    if (!content) return;
    setSavingEdit(true);
    try {
      const url = editing.kind === "thread" ? "/api/forum" : `/api/forum/${id}`;
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editing.kind === "thread"
            ? { id: editing.id, title: editing.title?.trim() || undefined, content }
            : { replyId: editing.id, content }
        ),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        show("Couldn't save", data.error ?? "The server rejected the request.", "error");
        return;
      }
      const updated = (await res.json()) as ForumThread & ForumReply;
      if (editing.kind === "thread") {
        setThread((t) =>
          t
            ? {
                ...t,
                title: updated.title ?? t.title,
                content: updated.content ?? t.content,
                editedAt: updated.editedAt ?? new Date().toISOString(),
              }
            : t
        );
      } else {
        setReplies((prev) =>
          prev.map((r) =>
            r.id === editing.id
              ? { ...r, content: updated.content, editedAt: updated.editedAt ?? new Date().toISOString() }
              : r
          )
        );
      }
      setEditing(null);
      show("Saved", "Your edit is live.");
    } catch {
      show("Couldn't save", "Check your connection and try again.");
    } finally {
      setSavingEdit(false);
    }
  };

  const likedThread = thread?.liked === true && Boolean(user);
  const canEditThread =
    thread && user && (isAdmin || (thread.authorId === user.id && thread.authorId !== ""));
  const locked = Boolean(thread?.locked);

  return (
    <SubPage className="max-w-4xl">
      <div className="w-full">
        <Link
          href="/forum"
          className="inline-flex items-center gap-2 text-sm text-[var(--muted)] hover:text-[var(--accent)] transition mb-6"
        >
          <i className="fa-solid fa-arrow-left" />
          Back to Forum
        </Link>

        {loading ? (
          <p className="text-sm text-[var(--muted)] text-center py-16">Loading thread…</p>
        ) : notFound ? (
          <div className="text-sm text-[var(--muted)] py-16 text-center border border-dashed border-[var(--border)] rounded-xl">
            <i className="fa-solid fa-comment-slash text-3xl text-[var(--muted-2)] mb-4 block" />
            Thread not found or deleted.
          </div>
        ) : loadError || !thread ? (
          <ErrorState onRetry={() => void load()} what="thread" />
        ) : (
          <>
            {/* OP */}
            <article className="card p-6 sm:p-8">
              <div className="flex items-start gap-4">
                <Avatar name={thread.author} src={thread.avatarUrl} size="lg" color={thread.color} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {thread.pinned ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[var(--accent)] border border-[var(--accent)] rounded px-1.5 py-0.5">
                        <i className="fa-solid fa-thumbtack" /> Pinned
                      </span>
                    ) : null}
                    {thread.locked ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[var(--diamond)] border border-[var(--diamond)]/40 rounded px-1.5 py-0.5">
                        <i className="fa-solid fa-lock" /> Locked
                      </span>
                    ) : null}
                    <span
                      className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border ${categoryClass(thread.category)}`}
                    >
                      {thread.category}
                    </span>
                  </div>
                  {editing?.kind === "thread" && editing.id === (thread.id ?? 0) ? (
                    <input
                      className="input font-display text-xl font-bold"
                      value={editing.title ?? ""}
                      onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                      maxLength={120}
                      aria-label="Edit title"
                    />
                  ) : (
                    <h1 className="font-display text-2xl sm:text-3xl font-bold leading-tight">
                      {thread.title}
                    </h1>
                  )}
                  <div className="text-xs text-[var(--muted)] mt-2 flex items-center gap-2 flex-wrap">
                    <span>
                      by <span className="text-[var(--fg-2)]">{thread.author}</span> · {timeAgo(thread.last)}
                    </span>
                    {thread.editedAt ? (
                      <span className="text-[var(--muted-2)] italic">· edited {timeAgo(thread.editedAt)}</span>
                    ) : null}
                    <span className="inline-flex items-center gap-1" title="Views">
                      <i className="fa-regular fa-eye" /> {thread.views ?? 0}
                    </span>
                  </div>
                </div>
              </div>

              {editing?.kind === "thread" && editing.id === (thread.id ?? 0) ? (
                <div className="mt-6">
                  <RichEditor
                    idPrefix="edit-thread"
                    value={editing.content}
                    onChange={(v) => setEditing({ ...editing, content: v })}
                    rows={10}
                    onUploadError={(m) => show("Couldn't upload image", m, "error")}
                  />
                  <div className="flex gap-3 mt-4">
                    <button className="btn-primary" onClick={() => void saveEdit()} disabled={savingEdit || !editing.content.trim()}>
                      {savingEdit ? "Saving…" : "Save changes"}
                    </button>
                    <button className="btn-secondary" onClick={() => setEditing(null)} disabled={savingEdit}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {thread.content ? (
                    <div className="mt-6">
                      <Markdown text={thread.content} />
                    </div>
                  ) : null}

                  {/* Actions: like + moderation */}
                  <div className="mt-6 flex items-center gap-2 flex-wrap">
                    <button
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg border px-3 py-2 transition disabled:opacity-40 ${
                        likedThread
                          ? "border-[var(--redstone)] text-[var(--redstone)] bg-[var(--redstone)]/10 shadow-[0_0_14px_-6px_var(--redstone)]"
                          : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--redstone)] hover:text-[var(--redstone)]"
                      }`}
                      onClick={() => void toggleLikeThread()}
                      disabled={busyLike !== null}
                      aria-label={likedThread ? "Unlike post" : "Like post"}
                    >
                      <i className={`${likedThread ? "fa-solid" : "fa-regular"} fa-heart`} />
                      <span>{thread.likes ?? 0}</span>
                      <span className="hidden sm:inline normal-case tracking-normal">
                        {likedThread ? "Liked" : "Like"}
                      </span>
                    </button>
                    {canEditThread ? (
                      <button
                        className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg border border-[var(--border)] px-3 py-2 text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
                        onClick={startEditThread}
                      >
                        <i className="fa-solid fa-pen text-xs" /> Edit
                      </button>
                    ) : null}
                    {isAdmin ? (
                      <>
                        <button
                          className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg border border-[var(--border)] px-3 py-2 text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition disabled:opacity-40"
                          onClick={() => void threadAction("pin")}
                          disabled={busyThreadAction}
                        >
                          <i className="fa-solid fa-thumbtack text-xs" />
                          {thread.pinned ? "Unpin" : "Pin"}
                        </button>
                        <button
                          className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg border border-[var(--border)] px-3 py-2 text-[var(--muted)] hover:border-[var(--diamond)] hover:text-[var(--diamond)] transition disabled:opacity-40"
                          onClick={() => void threadAction("lock")}
                          disabled={busyThreadAction}
                        >
                          <i className="fa-solid text-xs fa-lock" />
                          {thread.locked ? "Unlock" : "Lock"}
                        </button>
                        <button
                          className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg border border-[var(--border)] px-3 py-2 text-[var(--muted)] hover:border-[var(--redstone)] hover:text-[var(--redstone)] transition disabled:opacity-40"
                          onClick={() => void threadAction("delete")}
                          disabled={busyThreadAction}
                        >
                          <i className="fa-solid fa-trash text-xs" /> Delete
                        </button>
                      </>
                    ) : canEditThread ? (
                      <button
                        className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg border border-[var(--border)] px-3 py-2 text-[var(--muted)] hover:border-[var(--redstone)] hover:text-[var(--redstone)] transition"
                        onClick={() => void threadAction("delete")}
                      >
                        <i className="fa-solid fa-trash text-xs" /> Delete
                      </button>
                    ) : null}
                  </div>
                </>
              )}
            </article>

            {/* Poll */}
            {poll ? (
              <PollViewer
                poll={poll}
                signedIn={Boolean(user)}
                canVote={Boolean(user) && !locked}
                onVote={castVote}
              />
            ) : null}

            {/* Replies — X-style feed: divider-separated posts */}
            <div className="mt-8">
              <h2 className="font-display text-lg font-bold mb-4 flex items-center gap-2">
                <i className="fa-solid fa-reply text-[var(--accent)] text-sm" />
                {replies.length} {replies.length === 1 ? "reply" : "replies"}
              </h2>

              {replies.length === 0 ? (
                <div className="text-sm text-[var(--muted)] py-12 text-center border border-dashed border-[var(--border)] rounded-xl">
                  <i className="fa-regular fa-comment text-3xl text-[var(--muted-2)] mb-3 block" />
                  {locked ? "Thread locked — replies are closed." : "No replies yet — be the first!"}
                </div>
              ) : (
                <div className="card overflow-hidden">
                  {replies.map((r, i) => {
                    const liked = r.liked === true && Boolean(user);
                    const canEdit =
                      user && (isAdmin || (r.authorId === user.id && r.authorId !== ""));
                    const isEditing = editing?.kind === "reply" && editing.id === r.id;
                    return (
                      <div
                        key={r.id}
                        className={`flex items-start gap-4 p-5 ${
                          i < replies.length - 1 ? "border-b border-[var(--border)]" : ""
                        } ${r.pinned ? "bg-[var(--accent-dim)]/40" : ""}`}
                      >
                        <Avatar name={r.author} src={r.avatarUrl} size="md" color={r.color} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-[var(--fg)]">{r.author}</span>
                              {thread.authorId && r.authorId === thread.authorId ? (
                                <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--accent-bright)] bg-[var(--accent)]/15 border border-[var(--accent)]/30 rounded px-1.5 py-0.5">
                                  OP
                                </span>
                              ) : null}
                              <span className="text-xs text-[var(--muted-2)]">{timeAgo(r.createdAt)}</span>
                              {r.editedAt ? (
                                <span className="text-xs text-[var(--muted-2)] italic">edited</span>
                              ) : null}
                              {r.pinned ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[var(--accent)] border border-[var(--accent)] rounded px-1.5 py-0.5">
                                  <i className="fa-solid fa-thumbtack" /> Pinned
                                </span>
                              ) : null}
                            </div>
                            {canEdit && !isEditing ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
                                  onClick={() => startEditReply(r)}
                                  aria-label="Edit reply"
                                  title="Edit"
                                >
                                  <i className="fa-solid fa-pen text-xs" />
                                </button>
                                {isAdmin ? (
                                  <button
                                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition disabled:opacity-40"
                                    onClick={() => void pinReply(r)}
                                    disabled={busyReply !== null}
                                    aria-label={r.pinned ? "Unpin comment" : "Pin comment"}
                                    title={r.pinned ? "Unpin" : "Pin"}
                                  >
                                    <i className={`fa-solid fa-thumbtack text-xs ${r.pinned ? "text-[var(--accent)]" : ""}`} />
                                  </button>
                                ) : null}
                                <button
                                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] hover:border-[var(--redstone)] hover:text-[var(--redstone)] transition disabled:opacity-40"
                                  onClick={() => void deleteReply(r)}
                                  disabled={busyReply !== null}
                                  aria-label="Delete reply"
                                  title="Delete"
                                >
                                  <i className="fa-solid fa-trash text-xs" />
                                </button>
                              </div>
                            ) : null}
                          </div>

                          {isEditing ? (
                            <div className="mt-2">
                              <RichEditor
                                idPrefix={`edit-reply-${r.id}`}
                                value={editing?.content ?? ""}
                                onChange={(v) => editing && setEditing({ ...editing, content: v })}
                                rows={5}
                                onUploadError={(m) => show("Couldn't upload image", m, "error")}
                              />
                              <div className="flex gap-3 mt-3">
                                <button
                                  className="btn-primary py-2.5! px-5! text-xs!"
                                  onClick={() => void saveEdit()}
                                  disabled={savingEdit || !(editing?.content.trim())}
                                >
                                  {savingEdit ? "Saving…" : "Save"}
                                </button>
                                <button className="btn-secondary" onClick={() => setEditing(null)} disabled={savingEdit}>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="mt-2 text-[var(--fg-2)] leading-relaxed">
                                <Markdown text={r.content} />
                              </div>
                              <div className="mt-3">
                                <button
                                  className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg border px-2.5 py-1.5 transition disabled:opacity-40 ${
                                    liked
                                      ? "border-[var(--redstone)] text-[var(--redstone)] bg-[var(--redstone)]/10 shadow-[0_0_14px_-6px_var(--redstone)]"
                                      : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--redstone)] hover:text-[var(--redstone)]"
                                  }`}
                                  onClick={() => void toggleLikeReply(r)}
                                  disabled={busyLike !== null}
                                  aria-label={liked ? "Unlike comment" : "Like comment"}
                                >
                                  <i className={`${liked ? "fa-solid" : "fa-regular"} fa-heart`} />
                                  <span>{r.likes ?? 0}</span>
                                  <span className="hidden sm:inline normal-case tracking-normal">
                                    {liked ? "Liked" : "Like"}
                                  </span>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Reply composer */}
            <div className="mt-8 card p-6">
              <h3 className="font-display text-base font-bold mb-4 flex items-center gap-2">
                <i className="fa-regular fa-comment-dots text-[var(--accent)]" />
                Reply
              </h3>
              {locked ? (
                <div className="text-center py-6 border border-dashed border-[var(--diamond)]/40 rounded-xl bg-[var(--diamond)]/5">
                  <i className="fa-solid fa-lock text-2xl text-[var(--diamond)] mb-3 block" />
                  <p className="text-sm text-[var(--muted)]">
                    This thread is locked — replies are closed.
                    {isAdmin ? " Unlock it from the controls above the post." : ""}
                  </p>
                </div>
              ) : user ? (
                <>
                  <RichEditor
                    idPrefix="reply"
                    value={replyText}
                    onChange={setReplyText}
                    rows={5}
                    maxLength={20000}
                    placeholder="Write a reply… paste or drag screenshots straight in."
                    onUploadError={(m) => show("Couldn't upload image", m, "error")}
                  />
                  <div className="flex items-center justify-between mt-3 gap-3 flex-wrap">
                    <span className="text-xs text-[var(--muted)]">
                      Replying as <span className="text-[var(--fg-2)]">{user.username}</span>
                    </span>
                    <button
                      className="btn-primary py-2.5! px-5! text-xs!"
                      onClick={() => void submitReply()}
                      disabled={replying || !replyText.trim()}
                    >
                      {replying ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-paper-plane" />}
                      {replying ? "Posting…" : "Post Reply"}
                    </button>
                  </div>
                </>
              ) : sessionLoading ? (
                <p className="text-sm text-[var(--muted)]">Checking session…</p>
              ) : (
                <div className="text-center py-4">
                  <i className="fa-brands fa-discord text-3xl text-[#5865F2] mb-4 block" />
                  <p className="text-sm text-[var(--muted)] mb-5">Sign in with Discord to reply.</p>
                  <Link href={`/login?next=/forum/${id}`} className="btn-primary w-full sm:w-auto justify-center">
                    <i className="fa-brands fa-discord" />
                    Log in with Discord
                  </Link>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </SubPage>
  );
}
