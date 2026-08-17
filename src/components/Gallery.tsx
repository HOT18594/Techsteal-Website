"use client";

import { useMemo, useState } from "react";
import { useApi } from "@/lib/use-api";
import type { GalleryItem } from "@/types";
import { Reveal } from "./Reveal";

export function Gallery() {
  const { data: items, loading } = useApi<GalleryItem[]>("/api/gallery", []);
  const [filter, setFilter] = useState("All");

  const categories = useMemo(() => {
    const set = new Set(items.map((i) => i.category));
    return ["All", ...Array.from(set)];
  }, [items]);

  const visible = filter === "All" ? items : items.filter((i) => i.category === filter);

  return (
    <section id="gallery" className="relative py-24 lg:py-32 z-10">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <Reveal>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-16">
            <div>
              <div className="section-label mb-4">06 / Gallery</div>
              <h2 className="font-display text-5xl md:text-6xl font-bold mb-3">Gallery</h2>
            </div>
            <div className="flex gap-2 mt-6 md:mt-0 flex-wrap">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setFilter(c)}
                  className={`px-3 py-1.5 text-xs uppercase tracking-wider border transition ${
                    filter === c
                      ? "border-[var(--accent)] text-[var(--accent)]"
                      : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </Reveal>

        {loading ? (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No builds posted yet.</p>
        ) : (
          <div className="gallery-grid">
            {visible.map((g) => (
              <div key={g.id ?? g.title} className="gallery-item">
                <img src={g.image} alt={g.title} loading="lazy" />
                <div className="overlay">
                  <span className="label-grad mb-2">{g.category}</span>
                  <h3 className="font-display text-xl font-bold text-[var(--fg)]">{g.title}</h3>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm text-[var(--muted)]">by {g.builder}</span>
                    <span className="flex items-center gap-1.5 text-sm text-[var(--accent)]">
                      <i className="fa-solid fa-heart text-xs" />
                      {g.likes}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
