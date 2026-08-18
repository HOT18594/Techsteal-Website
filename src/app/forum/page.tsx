"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/use-api";
import type { ForumThread } from "@/types";
import { Reveal } from "@/components/Reveal";

const CATEGORIES = ["Announcements", "Ideas", "Builds", "Redstone", "Technical", "Off-topic"];

type Filter = "all" | "pinned" | "hot";

export default function ForumPage() {
  const { data: threads, loading, refetch } = useApi<ForumThread[]>("/api/forum", []);
  const [filter, setFilter] = useState<Filter>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [category, setCategory] = useState("General");
  const [submitting, setSubmitting] = useState(false);

  const categories = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of threads) counts[t.category] = (counts[t.category] ?? 0) + 1;
    return CATEGORIES.map((c) => ({ name: c, count: counts[c] ?? 0 }));
  }, [threads]);

  const visible = useMemo(() => {
    if (filter === "pinned") return threads.filter((t) => t.pinned);
    if (filter === "hot") return [...threads].sort((a, b) => b.replies - a.replies);
    return threads;
  }, [threads, filter]);

  const submit = async () => {
    const t = title.trim();
    const a = author.trim();
    if (!t || !a || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/forum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t, author: a, category }),
      });
      if (res.ok) {
        setTitle("");
        setAuthor("");
        setModalOpen(false);
        await refetch();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    "w-full bg-[var(--bg-2)] border border-[var(--border)] px-4 py-3 text-sm text-[var(--fg)] outline-none focus:border-[var(--accent)] transition placeholder:text-[var(--muted-2)] rounded-lg";

  return (
    <section className="py-24 lg:py-32 px-6 lg:px-10">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-16">
            <div>
              <div className="section-label mb-4">03 / Forum</div>
              <h1 className="font-display text-5xl md:text-6xl font-bold mb-3">Forum</h1>
              <p className="text-[var(--muted)] max-w-lg">Where the team discusses, plans, and shares. Slow conversation, no noise.</p>
            </div>
            <button className="btn-secondary mt-6 md:mt-0" onClick={() => setModalOpen(true)}>
              <i className="fa-solid fa-pen-to-square" />
              New Thread
            </button>
          </div>
        </Reveal>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Threads list */}
          <Reveal delay={1}>
            <div className="lg:col-span-2 card p-6 lg:p-8">
              <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                <h2 className="font-display text-xl font-bold">Recent discussions</h2>
                <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
                  {(["all", "pinned", "hot"] as Filter[]).map((f) => (
                    <button
                      key={f}
                      className={`hover:text-[var(--accent)] transition px-3 py-1.5 rounded-lg capitalize ${
                        filter === f
                          ? "bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--accent)]"
                          : "border-transparent"
                      }`}
                      onClick={() => setFilter(f)}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div id="forum-threads">
                {loading ? (
                  <p className="text-sm text-[var(--muted)] py-8 text-center">Loading…</p>
                ) : visible.length === 0 ? (
                  <p className="text-sm text-[var(--muted)] py-8 text-center">No threads yet. Start one above.</p>
                ) : (
                  visible.map((t) => (
                    <Link
                      key={t.id ?? t.title}
                      href={`/forum/${t.id}`}
                      className="thread-row py-4 px-2 flex items-center gap-4 block"
                    >
                      <div className={`avatar avatar-2 size-sm ${t.color}`}>{t.avatar}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {t.pinned ? <i className="fa-solid fa-thumbtack text-[var(--accent)] text-xs" /> : null}
                          <span className={`tag ${t.tagClass}`}>{t.category}</span>
                        </div>
                        <div className="thread-title text-[var(--fg)] font-medium truncate transition-colors group-hover:text-[var(--accent)]">
                          {t.title}
                        </div>
                        <div className="text-xs text-[var(--muted)] mt-1">by {t.author} · {t.last}</div>
                      </div>
                      <div className="text-right hidden sm:block">
                        <div className="font-display text-lg text-[var(--accent)]">{t.replies}</div>
                        <div className="text-xs text-[var(--muted)] uppercase tracking-wider">replies</div>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          </Reveal>

          {/* Categories sidebar */}
          <Reveal delay={2}>
            <div className="space-y-6">
              <div className="card p-6">
                <h3 className="font-display text-lg font-bold mb-4">Categories</h3>
                <div className="space-y-2">
                  {categories.map((c) => (
                    <Link
                      key={c.name}
                      href={`/forum?category=${encodeURIComponent(c.name)}`}
                      className="flex items-center justify-between py-2 px-3 hover:bg-[var(--bg-2)] rounded-lg transition block"
                    >
                      <span className="text-sm">{c.name}</span>
                      <span className="text-xs text-[var(--muted)]">{c.count}</span>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Asset placeholder */}
              <div className="asset-placeholder aspect-[4/3] rounded-lg">
                <div className="asset-placeholder-content">
                  <i className="fa-solid fa-comments asset-placeholder-icon" />
                  <span className="asset-placeholder-text">Forum Banner</span>
                  <span className="asset-placeholder-hint">Add community screenshot</span>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>

      {/* New thread modal */}
      {modalOpen ? (
        <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className="card p-8 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-2xl font-bold mb-6">New Thread</h3>
            <div className="space-y-4">
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
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <div className="flex gap-3 pt-2">
                <button
                  className="btn-primary w-full"
                  onClick={() => void submit()}
                  disabled={submitting}
                >
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