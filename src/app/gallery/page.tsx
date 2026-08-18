"use client";

import { useMemo, useState } from "react";
import { useApi } from "@/lib/use-api";
import type { GalleryItem } from "@/types";
import { Reveal } from "@/components/Reveal";

export default function GalleryPage() {
  const { data: items, loading } = useApi<GalleryItem[]>("/api/gallery", []);
  const [filter, setFilter] = useState("All");

  const categories = useMemo(() => {
    const set = new Set(items.map((i) => i.category));
    return ["All", ...Array.from(set)];
  }, [items]);

  const visible = filter === "All" ? items : items.filter((i) => i.category === filter);

  return (
    <section className="py-24 lg:py-32 px-6 lg:px-10">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-16">
            <div>
              <div className="section-label mb-4">06 / Gallery</div>
              <h1 className="font-display text-5xl md:text-6xl font-bold mb-3">Gallery</h1>
            </div>
            <div className="flex gap-2 mt-6 md:mt-0 flex-wrap">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setFilter(c)}
                  className={`px-4 py-2 text-sm uppercase tracking-wider rounded-lg border transition ${
                    filter === c
                      ? "bg-[var(--accent-dim)] border-[var(--accent)] text-[var(--accent)]"
                      : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal delay={1}>
          {loading ? (
            <p className="text-sm text-[var(--muted)] py-8 text-center">Loading…</p>
          ) : visible.length === 0 ? (
            <p className="text-sm text-[var(--muted)] py-8 text-center">No builds posted yet.</p>
          ) : (
            <div className="gallery-grid">
              {visible.map((g, index) => (
                <div key={g.id ?? g.title} className="gallery-item reveal" style={{ transitionDelay: `${Math.min(index, 8) * 60}ms` }}>
                  <div className="aspect-[4/5] relative overflow-hidden">
                    <img
                      src={g.image}
                      alt={g.title}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                    <div className="overlay">
                      <span className="label-grad mb-2">{g.category}</span>
                      <h3 className="font-display text-xl font-bold text-white">{g.title}</h3>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-sm text-[var(--fg-2)]">by {g.builder}</span>
                        <span className="flex items-center gap-1.5 text-sm text-[var(--accent-bright)]">
                          <i className="fa-solid fa-heart text-xs" />
                          {g.likes}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Reveal>

        <Reveal delay={2}>
          <div className="text-center mt-12">
            <button className="btn-secondary">
              Load more builds
              <i className="fa-solid fa-arrow-down ml-2" />
            </button>
          </div>
        </Reveal>

        {/* Asset placeholder for gallery page hero */}
        <Reveal delay={3}>
          <div className="mt-12 asset-placeholder aspect-[16/9] rounded-xl">
            <div className="asset-placeholder-content">
              <i className="fa-solid fa-images asset-placeholder-icon" />
              <span className="asset-placeholder-text">Gallery Hero Banner</span>
              <span className="asset-placeholder-hint">Add collage or featured build</span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}