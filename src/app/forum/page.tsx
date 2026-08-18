"use client";

import { useState } from "react";
import { fallbackThreads } from "@/lib/fallback-data";
import type { ForumThread } from "@/types";

export default function ForumPage() {
  const threads = fallbackThreads;
  const [filter, setFilter] = useState<"all" | "pinned" | "hot">("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [category, setCategory] = useState("General");
  const [submitting, setSubmitting] = useState(false);

  const visible: ForumThread[] =
    filter === "all"
      ? threads
      : filter === "pinned"
        ? threads.filter((t) => t.pinned)
        : [...threads].sort((a, b) => b.replies - a.replies);

  const submit = async () => {
    const t = title.trim();
    const a = author.trim();
    if (!t || !a || submitting) return;
    setSubmitting(true);
    try {
      // Static export: new threads are demo-only and won't persist.
      setTitle("");
      setAuthor("");
      setModalOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    "w-full bg-[var(--bg-2)] border border-[var(--border)] px-4 py-3 text-sm text-[var(--fg)] outline-none focus:border-[var(--accent)] transition placeholder:text-[var(--muted-2)] rounded-lg";

  return (
    <section className="px-6 lg:px-10 pt-24 lg:pt-28">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <h1 className="font-display text-4xl md:text-5xl font-bold">Forum</h1>
          <button
            className="btn-secondary mt-4 md:mt-0 py-2.5! px-5! text-xs!"
            onClick={() => setModalOpen(true)}
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
                  // Display-only row: no detail pages exist in static export.
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
                className={inputClass}
                placeholder="Thread title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <input
                className={inputClass}
                placeholder="Your name"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
              />
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
                <button className="btn-primary w-full" onClick={() => void submit()} disabled={submitting}>
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
    </section>
  );
}