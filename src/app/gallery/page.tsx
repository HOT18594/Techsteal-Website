"use client";

import { useMemo, useState } from "react";
import { fallbackGallery } from "@/lib/fallback-data";
import type { GalleryItem } from "@/types";
import { SubPage } from "@/components/SubPage";
import { useApi } from "@/lib/use-api";
import { Carousel } from "@/components/Carousel";

export default function GalleryPage() {
  const { data: items } = useApi<GalleryItem[]>("/api/gallery", fallbackGallery);
  const [filter, setFilter] = useState("All");

  const categories = useMemo(() => {
    const set = new Set(items.map((i) => i.category));
    return ["All", ...Array.from(set)];
  }, [items]);

  const visible = filter === "All" ? items : items.filter((i) => i.category === filter);

  const slides = visible.map((g) => (
    <div key={g.id ?? g.title} className="card gallery-slide">
      <div className="relative w-full aspect-[16/10] overflow-hidden rounded-t-[14px]">
        <img
          src={g.image}
          alt={g.title}
          loading="lazy"
          className="w-full h-full object-cover"
        />
        <div className="gallery-slide-shade" aria-hidden="true" />
        <div className="absolute bottom-0 inset-x-0 p-6 sm:p-8 flex flex-col items-start">
          <span className="label-grad mb-3">{g.category}</span>
          <h3 className="font-display text-2xl sm:text-3xl font-bold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
            {g.title}
          </h3>
          <div className="flex items-center gap-4 mt-2 text-sm text-[var(--fg-2)]">
            <span className="flex items-center gap-1.5">
              <i className="fa-solid fa-user text-xs text-[var(--accent-bright)]" />
              {g.builder}
            </span>
            <span className="flex items-center gap-1.5">
              <i className="fa-solid fa-heart text-xs text-[var(--redstone)]" />
              {g.likes}
            </span>
          </div>
        </div>
      </div>
    </div>
  ));

  return (
    <SubPage className="mx-auto max-w-7xl pt-6 pb-16">
      <div className="max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="page-header rowed mb-8">
          <h1 className="page-title">Gallery</h1>
          {categories.length > 1 ? (
            <div className="flex gap-2 flex-wrap">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setFilter(c)}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition ${
                    filter === c
                      ? "bg-[var(--accent-dim)] border-[var(--accent)] text-[var(--accent)] shadow-[0_0_16px_-8px_var(--accent-glow)]"
                      : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)] hover:border-[var(--border-strong)]"
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
          <Carousel slides={slides} label="Gallery builds" interval={6500} />
        )}
      </div>
    </SubPage>
  );
}
