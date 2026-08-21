"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fallbackGallery } from "@/lib/fallback-data";
import { GALLERY_CATEGORIES } from "@/lib/storage";
import { categoryClass } from "@/lib/forum-categories";
import type { GalleryItem } from "@/types";
import { Avatar } from "@/components/Avatar";
import { EmptyState, ErrorState } from "@/components/EmptyState";
import { SubPage } from "@/components/SubPage";
import { useApi } from "@/lib/use-api";
import { useToast } from "@/components/Toast";
import { useSession } from "@/lib/use-session";

const MAX_BYTES = 8 * 1024 * 1024;

export default function GalleryPage() {
  const { show } = useToast();
  const { user, loading: sessionLoading } = useSession();
  const { data: items, loading, error, refetch } = useApi<GalleryItem[]>(
    "/api/gallery",
    fallbackGallery
  );
  const [filter, setFilter] = useState("All");
  const [sort, setSort] = useState<"new" | "liked">("new");

  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>(GALLERY_CATEGORIES[0]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Lightbox
  const [lightbox, setLightbox] = useState<number | null>(null);

  const categories = useMemo(() => {
    const set = new Set(items.map((i) => i.category));
    return ["All", ...Array.from(set)];
  }, [items]);

  const visible = useMemo(() => {
    const list = filter === "All" ? items : items.filter((i) => i.category === filter);
    // Newest first by id (ids are assigned in insertion order); "liked"
    // surfaces the community favourites.
    return sort === "liked"
      ? [...list].sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0))
      : [...list].sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
  }, [items, filter, sort]);

  // Escape closes whichever overlay is open; lock body scroll; restore
  // focus to the opener on close.
  useEffect(() => {
    if (!modalOpen && lightbox === null) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModalOpen(false);
        setLightbox(null);
      }
      // Arrow keys page through the lightbox.
      if (lightbox !== null && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        setLightbox((i) =>
          i === null ? i : (i + (e.key === "ArrowRight" ? 1 : visible.length - 1)) % visible.length
        );
      }
    };
    if (modalOpen) titleRef.current?.focus();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [modalOpen, lightbox, visible.length]);

  const openModal = () => {
    setTitle("");
    setCategory(GALLERY_CATEGORIES[0]);
    setFile(null);
    // Revoke any leftover preview blob URL so it doesn't leak memory.
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    setModalOpen(true);
  };

  const onPick = (f: File | undefined) => {
    if (!f) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(f.type)) {
      show("Unsupported image", "Use JPG, PNG, WebP or GIF.", "error");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (f.size > MAX_BYTES) {
      show("Image too large", "Keep uploads under 8 MB.", "error");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setFile(f);
    // Revoke the previous blob URL when replacing the preview.
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(f);
    });
  };

  const submit = async () => {
    const t = title.trim();
    if (!t || !file || submitting) return;
    setSubmitting(true);
    try {
      const body = new FormData();
      body.set("title", t);
      body.set("category", category);
      body.set("image", file);
      const res = await fetch("/api/gallery", { method: "POST", body });
      if (res.ok) {
        show("Posted", "Your build is now in the gallery.");
        setModalOpen(false);
        void refetch();
      } else if (res.status === 401) {
        show("Sign in to post", "Log in with Discord to share builds.", "error");
        setModalOpen(false);
      } else if (res.status === 403) {
        show("Not allowed to post", "Only verified Discord members can share to the gallery.", "error");
        setModalOpen(false);
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        show("Couldn't post", data.error ?? "The server rejected the request.", "error");
      }
    } catch {
      show("Couldn't post", "Check your connection and try again.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const current = lightbox !== null ? visible[lightbox] : null;

  return (
    <SubPage>
      <div className="w-full">
        {/* Header */}
        <div className="page-header rowed mb-6 gap-4">
          <div>
            <p className="page-kicker">
              <i className="fa-solid fa-images" aria-hidden="true" />
              Community builds
            </p>
            <h1 className="page-title">Gallery</h1>
          </div>
          {/* Always enabled — signed-out visitors get the modal, which
              explains the Discord login instead of a dead button. */}
          <button className="btn-primary btn-sm" onClick={openModal}>
            <i className="fa-solid fa-upload" />
            Post a build
          </button>
        </div>

        {/* Toolbar: category chips with counts + sort */}
        <div className="flex items-center justify-between gap-3 flex-wrap mb-8">
          <div className="flex gap-2 flex-wrap">
            {categories.map((c) => {
              const count = c === "All" ? items.length : items.filter((i) => i.category === c).length;
              return (
                <button
                  key={c}
                  onClick={() => setFilter(c)}
                  aria-pressed={filter === c}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border transition ${
                    filter === c
                      ? "bg-[var(--accent-dim)] border-[var(--accent)] text-[var(--accent)] shadow-[0_0_16px_-8px_var(--accent-glow)]"
                      : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  {c}
                  <span className="text-xs opacity-70">{count}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1 text-sm text-[var(--muted)]">
            {(["new", "liked"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSort(s)}
                aria-pressed={sort === s}
                className={`px-3 py-1.5 rounded-lg transition ${
                  sort === s
                    ? "bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--accent)]"
                    : "border-transparent hover:text-[var(--accent)]"
                }`}
              >
                {s === "new" ? "Newest" : "Most liked"}
              </button>
            ))}
          </div>
        </div>

        {error && items.length === 0 ? (
          <ErrorState onRetry={() => void refetch()} what="gallery" />
        ) : loading ? (
          <div className="gallery-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="gallery-item aspect-[4/3] animate-pulse"
                style={{ cursor: "default" }}
                aria-hidden="true"
              />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon="fa-images"
            title={filter === "All" ? "No builds posted yet" : `No ${filter} builds yet`}
            hint="Screenshots of bases, farms and contraptions live here."
            action={
              <>
                {filter !== "All" ? (
                  <button className="btn-secondary btn-sm" onClick={() => setFilter("All")}>
                    Show all
                  </button>
                ) : null}
                <button className="btn-primary btn-sm" onClick={openModal}>
                  <i className="fa-solid fa-upload" />
                  Post the first build
                </button>
              </>
            }
          />
        ) : (
          /* Console-style thumbnail grid */
          <div className="gallery-grid stagger">
            {visible.map((g, i) => (
              <button
                key={g.id ?? `${i}-${g.title}`}
                className="gallery-item aspect-[4/3] text-left"
                onClick={() => setLightbox(i)}
                aria-label={`View ${g.title} by ${g.builder}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.image} alt={g.title} loading="lazy" className="aspect-[4/3] object-cover" />
                <div className="overlay">
                  <span
                    className={`inline-block px-2 py-0.5 mb-2 text-[10px] font-bold uppercase tracking-wider rounded border ${categoryClass(g.category)}`}
                  >
                    {g.category}
                  </span>
                  <h3 className="font-display text-xl font-bold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                    {g.title}
                  </h3>
                  <div className="flex items-center gap-4 mt-1 text-sm text-[var(--fg-2)]">
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
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Post modal */}
      {modalOpen ? (
        <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
          <div
            className="card p-6 w-full max-w-md"
            role="dialog"
            aria-modal="true"
            aria-labelledby="post-gallery-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="post-gallery-title" className="font-display text-xl font-bold mb-5">Post to Gallery</h3>

            {user ? (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
              >
                <input
                  ref={titleRef}
                  className="input"
                  placeholder="Build title (required)"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={60}
                />
                <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {GALLERY_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                <label>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => onPick(e.target.files?.[0])}
                  />
                  <button
                    type="button"
                    className="w-full bg-[var(--bg-2)] border border-dashed border-[var(--border-strong)] px-4 py-6 text-sm text-[var(--fg-2)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition rounded-2xl"
                    onClick={() => fileRef.current?.click()}
                  >
                    {preview ? (
                      <span className="flex items-center gap-2 overflow-hidden">
                        <i className="fa-solid fa-image text-[var(--accent)]" />
                        <span className="truncate">{file?.name}</span>
                        <span className="text-[var(--muted-2)]">— click to change</span>
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <i className="fa-solid fa-cloud-arrow-up" />
                        Choose an image (JPG/PNG/WebP/GIF, under 8 MB)
                      </span>
                    )}
                  </button>
                </label>

                {preview ? (
                  <div className="rounded-xl overflow-hidden border border-[var(--border)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preview} alt="Preview" className="max-h-56 w-full object-cover" />
                  </div>
                ) : null}

                <div className="flex gap-3 pt-1">
                  <button
                    type="submit"
                    className="btn-primary w-full"
                    disabled={submitting || !title.trim() || !file}
                  >
                    {submitting ? "Uploading…" : "Post Build"}
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
                  Sign in with Discord to post to the gallery.
                </p>
                <a href="/login?next=/gallery" className="btn-primary w-full justify-center">
                  <i className="fa-brands fa-discord" />
                  Log in with Discord
                </a>
                <button className="btn-ghost w-full mt-2" onClick={() => setModalOpen(false)}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Lightbox — full image + meta, Esc/arrows navigate */}
      {current ? (
        <div
          className="modal-backdrop"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
          aria-label={current.title}
        >
          <div
            className="card overflow-hidden w-full max-w-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={current.image} alt={current.title} className="w-full max-h-[65vh] object-contain bg-[var(--bg)]" />
            <div className="p-5 flex items-center gap-4 flex-wrap">
              <Avatar name={current.builder} size="sm" />
              <div className="flex-1 min-w-0">
                <h3 className="font-display text-lg font-bold truncate">{current.title}</h3>
                <p className="text-xs text-[var(--muted)]">
                  by {current.builder} · {current.likes} likes
                </p>
              </div>
              <span
                className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border ${categoryClass(current.category)}`}
              >
                {current.category}
              </span>
              <div className="flex items-center gap-2">
                {visible.length > 1 ? (
                  <>
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => setLightbox((i) => (i === null ? i : (i + visible.length - 1) % visible.length))}
                      aria-label="Previous build"
                    >
                      <i className="fa-solid fa-chevron-left" />
                    </button>
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => setLightbox((i) => (i === null ? i : (i + 1) % visible.length))}
                      aria-label="Next build"
                    >
                      <i className="fa-solid fa-chevron-right" />
                    </button>
                  </>
                ) : null}
                <button className="btn-secondary btn-sm" onClick={() => setLightbox(null)} aria-label="Close">
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </SubPage>
  );
}
