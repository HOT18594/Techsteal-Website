"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useToast } from "@/components/Toast";
import { SubPage } from "@/components/SubPage";
import { useSession } from "@/lib/use-session";
import type { ForumReply, ForumThread } from "@/types";

export default function ThreadPage() {
  const { id } = useParams<{ id: string }>();
  const { show } = useToast();
  const { user, loading: sessionLoading } = useSession();

  const [thread, setThread] = useState<ForumThread | null>(null);
  const [replies, setReplies] = useState<ForumReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [busyReply, setBusyReply] = useState<number | null>(null);

  const isAdmin = user?.role === "admin";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/forum/${id}`);
      if (!res.ok) {
        setNotFound(true);
        return;
      }
      const data = (await res.json()) as { thread: ForumThread; replies: ForumReply[] };
      setThread(data.thread);
      setReplies(data.replies);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

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
        setReplies((prev) => [...prev, created]);
        setThread((t) => (t ? { ...t, replies: t.replies + 1 } : t));
        setReplyText("");
      } else if (res.status === 401) {
        show("Sign in to reply", "Log in with Discord to reply.");
      } else {
        show("Couldn't reply", "The server rejected the request.");
      }
    } catch {
      show("Couldn't reply", "Check your connection and try again.");
    } finally {
      setReplying(false);
    }
  };

  const deleteReply = async (reply: ForumReply) => {
    if (busyReply !== null) return;
    setBusyReply(reply.id ?? 0);
    try {
      const res = await fetch(`/api/forum/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replyId: reply.id }),
      });
      if (!res.ok) {
        show("Couldn't delete", "The server rejected the request.");
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

  const inputClass =
    "w-full bg-[var(--bg-2)] border border-[var(--border)] px-4 py-3 text-sm text-[var(--fg)] outline-none focus:border-[var(--accent)] transition placeholder:text-[var(--muted-2)] rounded-lg";

  return (
    <SubPage className="mx-auto max-w-4xl pt-6 pb-16">
      <div className="max-w-4xl mx-auto w-full">
        <Link
          href="/forum"
          className="inline-flex items-center gap-2 text-sm text-[var(--muted)] hover:text-[var(--accent)] transition mb-6"
        >
          <i className="fa-solid fa-arrow-left" />
          Back to Forum
        </Link>

        {loading ? (
          <p className="text-sm text-[var(--muted)] text-center py-16">Loading thread…</p>
        ) : notFound || !thread ? (
          <div className="text-sm text-[var(--muted)] py-16 text-center border border-dashed border-[var(--border)] rounded-xl">
            <i className="fa-solid fa-comment-slash text-3xl text-[var(--muted-2)] mb-4 block" />
            Thread not found or deleted.
          </div>
        ) : (
          <>
            {/* OP */}
            <article className="card p-6 sm:p-8">
              <div className="flex items-start gap-4">
                <div className={`avatar avatar-lg ${thread.color}`}>{thread.avatar}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {thread.pinned ? (
                      <i className="fa-solid fa-thumbtack text-[var(--accent)] text-xs" />
                    ) : null}
                    <span className={`tag ${thread.tagClass}`}>{thread.category}</span>
                  </div>
                  <h1 className="font-display text-2xl sm:text-3xl font-bold leading-tight">
                    {thread.title}
                  </h1>
                  <div className="text-xs text-[var(--muted)] mt-2">
                    by <span className="text-[var(--fg-2)]">{thread.author}</span> · {thread.last}
                  </div>
                </div>
              </div>
              {thread.content ? (
                <p className="mt-6 text-[var(--fg-2)] leading-relaxed whitespace-pre-wrap">
                  {thread.content}
                </p>
              ) : null}
            </article>

            {/* Replies */}
            <div className="mt-8">
              <h2 className="font-display text-lg font-bold mb-4 flex items-center gap-2">
                <i className="fa-solid fa-reply text-[var(--accent)] text-sm" />
                {replies.length} {replies.length === 1 ? "reply" : "replies"}
              </h2>

              {replies.length === 0 ? (
                <p className="text-sm text-[var(--muted)] py-8 text-center border border-dashed border-[var(--border)] rounded-xl">
                  No replies yet — be the first!
                </p>
              ) : (
                <div className="space-y-4">
                  {replies.map((r) => (
                    <div key={r.id} className="card p-5 flex items-start gap-4">
                      <div className={`avatar avatar-md ${r.color}`}>{r.avatar}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-medium">{r.author}</div>
                          {isAdmin ? (
                            <button
                              className="w-8 h-8 flex items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] hover:border-[var(--redstone)] hover:text-[var(--redstone)] transition disabled:opacity-40"
                              onClick={() => void deleteReply(r)}
                              disabled={busyReply !== null}
                              aria-label="Delete reply"
                              title="Delete reply"
                            >
                              <i className="fa-solid fa-trash text-xs" />
                            </button>
                          ) : null}
                        </div>
                        <p className="mt-2 text-[var(--fg-2)] leading-relaxed whitespace-pre-wrap">
                          {r.content}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Reply composer */}
            <div className="mt-8 card p-6">
              <h3 className="font-display text-base font-bold mb-4">Reply</h3>
              {user ? (
                <>
                  <textarea
                    className={`${inputClass} min-h-[100px] resize-y`}
                    placeholder="Write a reply…"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    maxLength={4000}
                  />
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-xs text-[var(--muted)]">
                      Replying as <span className="text-[var(--fg-2)]">{user.username}</span>
                    </span>
                    <button
                      className="btn-primary py-2.5! px-5! text-xs!"
                      onClick={() => void submitReply()}
                      disabled={replying || !replyText.trim()}
                    >
                      {replying ? (
                        <i className="fa-solid fa-spinner fa-spin" />
                      ) : (
                        <i className="fa-solid fa-paper-plane" />
                      )}
                      {replying ? "Posting…" : "Post Reply"}
                    </button>
                  </div>
                </>
              ) : sessionLoading ? (
                <p className="text-sm text-[var(--muted)]">Checking session…</p>
              ) : (
                <div className="text-center py-4">
                  <i className="fa-brands fa-discord text-3xl text-[#5865F2] mb-4 block" />
                  <p className="text-sm text-[var(--muted)] mb-5">
                    Sign in with Discord to reply.
                  </p>
                  <Link href="/login" className="btn-primary w-full sm:w-auto justify-center">
                    <i className="fa-brands fa-discord" />
                    Log in
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
