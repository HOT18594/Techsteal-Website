"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { EmptyState, ErrorState } from "@/components/EmptyState";
import { SubPage } from "@/components/SubPage";
import { useApi } from "@/lib/use-api";
import { timeAgo } from "@/lib/time";
import { markdownExcerpt } from "@/lib/excerpt";
import { categoryClass } from "@/lib/forum-categories";
import type { SearchResults } from "@/types";

const EMPTY: SearchResults = { threads: [], gallery: [], members: [] };

export function SearchClient() {
  const router = useRouter();
  const params = useSearchParams();
  const urlQ = (params.get("q") ?? "").slice(0, 80);
  const [input, setInput] = useState(urlQ);
  const [q, setQ] = useState(urlQ.trim());
  const inputRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);
  const prevUrlQ = useRef(urlQ);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Sync input and active query when URL ?q= changes via browser Back/Forward.
  useEffect(() => {
    if (prevUrlQ.current === urlQ) return;
    prevUrlQ.current = urlQ;
    setInput(urlQ);
    setQ(urlQ.trim());
  }, [urlQ]);

  // Debounce typing into a query and mirror it to a shareable URL. The first
  // run is skipped so a deep-linked ?q= isn't immediately re-written.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const next = input.trim();
    if (next === q && prevUrlQ.current === next) return;
    const t = setTimeout(() => {
      prevUrlQ.current = next;
      setQ(next);
      router.replace(next ? `/search?q=${encodeURIComponent(next)}` : "/search", { scroll: false });
    }, 350);
    return () => clearTimeout(t);
  }, [input, q, router]);

  const clearSearch = () => {
    prevUrlQ.current = "";
    setInput("");
    setQ("");
    router.replace("/search", { scroll: false });
    inputRef.current?.focus();
  };

  const enabled = q.length >= 2;
  const { data, loading, error, refetch } = useApi<SearchResults>(
    `/api/search?q=${encodeURIComponent(q)}`,
    EMPTY,
    enabled
  );
  const total = data.threads.length + data.gallery.length + data.members.length;

  return (
    <SubPage>
      <div className="w-full">
        <div className="page-header mb-6">
          <h1 className="page-title">Search</h1>
        </div>

        <div className="relative mb-8 max-w-2xl">
          <i
            className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[var(--muted-2)]"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            className="input pl-11! pr-10! py-3.5! text-base!"
            placeholder="Search discussions, builds and members…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-label="Search the community"
            maxLength={80}
          />
          {input ? (
            <button
              type="button"
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-[var(--muted-2)] hover:text-[var(--fg)] transition"
              onClick={clearSearch}
              aria-label="Clear search"
            >
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        {!enabled ? (
          <EmptyState
            icon="fa-magnifying-glass"
            title={q.length === 1 ? "Keep typing…" : "Search across TECHSTEAL"}
            hint="Find forum discussions, gallery builds and members. Type at least 2 characters."
          />
        ) : loading && total === 0 ? (
          <div className="space-y-3" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card p-5 flex items-start gap-4 animate-pulse">
                <div className="w-12 h-12 rounded-[10px] bg-white/5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="h-4 w-2/3 bg-white/5 rounded mb-2" />
                  <div className="h-3 w-1/3 bg-white/5 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : error && total === 0 ? (
          <ErrorState onRetry={() => void refetch()} what="search results" />
        ) : total === 0 ? (
          <EmptyState
            icon="fa-magnifying-glass"
            title={`No results for “${q}”`}
            hint="Try a different word, or check the spelling."
          />
        ) : (
          <div className="space-y-10">
            {data.threads.length > 0 ? (
              <section aria-label="Discussions">
                <SectionHead icon="fa-comments" title="Discussions" count={data.threads.length} />
                <div className="space-y-3 stagger">
                  {data.threads.map((t) => (
                    <div key={t.id ?? t.title} className="relative thread-row group rounded-[14px]">
                      {t.id ? (
                        <Link
                          href={`/forum/${t.id}`}
                          className="absolute inset-0 z-0 rounded-[14px]"
                          aria-label={`Open thread: ${t.title}`}
                        />
                      ) : null}
                      <div className="relative z-10 flex items-start gap-4 p-4 sm:p-5 pointer-events-none">
                        <Avatar name={t.author} src={t.avatarUrl} size="md" color={t.color} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-[var(--fg)]">{t.author}</span>
                            <span className="text-xs text-[var(--muted-2)]">· {timeAgo(t.last)}</span>
                            <span
                              className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border ${categoryClass(t.category)}`}
                            >
                              {t.category}
                            </span>
                          </div>
                          <h3 className="mt-1.5 text-base font-bold text-[var(--fg)] leading-snug line-clamp-2 group-hover:text-[var(--accent)] transition">
                            {t.title}
                          </h3>
                          {t.content ? (
                            <p className="mt-1 text-sm text-[var(--muted)] line-clamp-2">
                              {markdownExcerpt(t.content)}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--muted)] flex-shrink-0">
                          <span
                            className="inline-flex items-center gap-1.5 border border-[var(--border)] rounded-full px-2.5 py-1"
                            title="Replies"
                          >
                            <i className="fa-regular fa-comment" aria-hidden="true" /> {t.replies}
                          </span>
                          <span
                            className="inline-flex items-center gap-1.5 border border-[var(--border)] rounded-full px-2.5 py-1"
                            title="Likes"
                          >
                            <i className="fa-solid fa-heart" aria-hidden="true" /> {t.likes ?? 0}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {data.gallery.length > 0 ? (
              <section aria-label="Builds">
                <SectionHead icon="fa-cubes" title="Builds" count={data.gallery.length} />
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 stagger">
                  {data.gallery.map((g) => (
                    <Link
                      key={g.id ?? g.title}
                      href={`/gallery?item=${g.id}`}
                      className="card group overflow-hidden block"
                      aria-label={`Open build: ${g.title}`}
                    >
                      <div className="relative aspect-[4/3] bg-[var(--bg-2)] overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={g.image}
                          alt=""
                          loading="lazy"
                          className="absolute inset-0 w-full h-full object-cover transition duration-300 group-hover:scale-[1.03]"
                        />
                      </div>
                      <div className="p-4">
                        <h3 className="font-bold text-[var(--fg)] leading-snug line-clamp-1 group-hover:text-[var(--accent)] transition">
                          {g.title}
                        </h3>
                        <p className="mt-1 text-xs text-[var(--muted)] flex items-center gap-2">
                          <span className="text-[var(--fg-2)]">{g.builder}</span>
                          <span
                            className={`inline-block px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded border ${categoryClass(g.category)}`}
                          >
                            {g.category}
                          </span>
                        </p>
                        <p className="mt-2 text-xs text-[var(--muted-2)] inline-flex items-center gap-1.5">
                          <i className="fa-solid fa-heart" aria-hidden="true" /> {g.likes}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}

            {data.members.length > 0 ? (
              <section aria-label="Members">
                <SectionHead icon="fa-users" title="Members" count={data.members.length} />
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 stagger">
                  {data.members.map((m) => (
                    <div key={m.id ?? m.name} className="member-card group">
                      {m.id ? (
                        <Link
                          href={`/members/${encodeURIComponent(m.id)}`}
                          className="absolute inset-0 z-0 rounded-[14px] focus-visible:outline-offset-[-3px]"
                          aria-label={`View profile: ${m.name}`}
                        />
                      ) : null}
                      <div className="relative z-10 flex items-start gap-4 pointer-events-none">
                        <Avatar
                          name={m.name}
                          src={m.avatarUrl}
                          size="md"
                          color={m.color}
                          online={m.status === "online"}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-display text-lg font-bold break-words">{m.name}</h3>
                            <span className={`tag ${m.status === "online" ? "tag-emerald" : ""}`}>{m.role}</span>
                          </div>
                          <p className="mt-1 text-xs text-[var(--muted)]">
                            {m.minecraftUsername ? (
                              <>
                                MC · <span className="text-[var(--fg-2)]">{m.minecraftUsername}</span>
                              </>
                            ) : null}
                            {m.joined ? (
                              <>
                                {m.minecraftUsername ? " · " : ""}Joined{" "}
                                <span className="text-[var(--fg-2)]">{m.joined}</span>
                              </>
                            ) : null}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </SubPage>
  );
}

function SectionHead({ icon, title, count }: { icon: string; title: string; count: number }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <i className={`fa-solid ${icon} text-[var(--muted-2)]`} aria-hidden="true" />
      <h2 className="font-display text-lg font-bold">{title}</h2>
      <span className="text-xs text-[var(--muted-2)]">{count}</span>
    </div>
  );
}
