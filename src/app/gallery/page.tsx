"use client";

import { useMemo, useState } from "react";
import { fallbackGallery } from "@/lib/fallback-data";
import type { GalleryItem } from "@/types";

export default function GalleryPage() {
  const items: GalleryItem[] = fallbackGallery;
  const [filter, setFilter] = useState("All");

  const categories = useMemo(() => {
    const set = new Set(items.map((i) => i.category));
    return ["All", ...Array.from(set)];
  }, [items]);

  const visible = filter === "All" ? items : items.filter((i) => i.category === filter);

  return (
    <section className="px-6 lg:px-10 pt-24 lg:pt-28">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <h1 className="font-display text-4xl md:text-5xl font-bold">Gallery</h1>
          {categories.length > 1 ? (
            <div className="flex gap-2 mt-4 md:mt-0 flex-wrap">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setFilter(c)}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition ${
                    filter === c
                      ? "bg-[var(--accent-dim)] border-[var(--accent)] text-[var(--accent)]"
                      : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)]"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {visible.length === 0 ? (
          <div className="text-sm text-[var(--muted)] py-16 text-center border border-dashed border-[var(--border)] rounded-xl">
            <i className="fa-solid fa-images text-3xl text-[var(--muted-2)] mb-4 block" />
            No builds posted yet.
          </div>
        ) : (
          <div className="gallery-grid">
            {visible.map((g) => (
              <div key={g.id ?? g.title} className="gallery-item">
                <div className="aspect-[4/5] relative overflow-hidden">
                  <img src={g.image} alt={g.title} loading="lazy" className="w-full h-full object-cover" />
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
      </div>
    </section>
  );
}