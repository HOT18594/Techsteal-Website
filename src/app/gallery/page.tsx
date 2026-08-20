"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fallbackGallery } from "@/lib/fallback-data";
import { GALLERY_CATEGORIES } from "@/lib/storage";
import type { GalleryItem } from "@/types";
import { SubPage } from "@/components/SubPage";
import { useApi } from "@/lib/use-api";
import { useToast } from "@/components/Toast";
import { useSession } from "@/lib/use-session";

const MAX_BYTES = 8 * 1024 * 1024;

export default function GalleryPage() {
  const { show } = useToast();
  const { user, loading: sessionLoading } = useSession();
  const { data: items, refetch } = useApi<GalleryItem[]>("/api/gallery", fallbackGallery);
  const [filter, setFilter] = useState("All");

  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>(GALLERY_CATEGORIES[0]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const categories = useMemo(() => {
    const set = new Set(items.map((i) => i.category));
    return ["All", ...Array.from(set)];
  }, [items]);

  const visible = filter === "All" ? items : items.filter((i) => i.category === filter);

  // Escape closes the modal; autofocus the title field; lock body scroll.
  useEffect(() => {
    if (!modalOpen) return;
    titleRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModalOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [modalOpen]);

  const openModal = () => {
    setTitle("");
    setCategory(GALLERY_CATEGORIES[0]);
    setFile(null);
    setPreview(null);
    setModalOpen(true);
  };

  const onPick = (f: File | undefined) => {
    if (!f) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(f.type)) {
      show("Unsupported image", "Use JPG, PNG, WebP or GIF.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (f.size > MAX_BYTES) {
      show("Image too large", "Keep uploads under 8 MB.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
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
        show("Sign in to post", "Log in with Discord to share builds.");
        setModalOpen(false);
      } else if (res.status === 403) {
        show("Not allowed to post", "Only verified Discord members can share to the gallery.");
        setModalOpen(false);
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        show("Couldn't post", data.error ?? "The server rejected the request.");
      }
    } catch {
      show("Couldn't post", "Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    "w-full bg-[var(--bg-2)] border border-[var(--border)] px-4 py-3 text-sm text-[var(--fg)] outline-none focus:border-[var(--accent)] transition placeholder:text-[var(--muted-2)] rounded-lg";

  return (
    <SubPage>
      <div className="w-full">
        {/* Header */}
        <div className="page-header rowed mb-8">
          <h1 className="page-title">Gallery</h1>
          <button
            className="btn-secondary py-2.5! px-5! text-xs!"
            onClick={openModal}
            disabled={!user}
            title={user ? "Post a build" : "Sign in to post"}
          >
            <i className="fa-solid fa-upload" />
            Post
          </button>
        </div>

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

        {visible.length === 0 ? (
          <div className="text-sm text-[var(--muted)] py-16 text-center border border-dashed border-[var(--border)] rounded-xl">
            <i className="fa-solid fa-images text-3xl text-[var(--muted-2)] mb-4 block" />
            No builds posted yet.
          </div>
        ) : (
          /* Console-style thumbnail grid */
          <div className="gallery-grid stagger">
            {visible.map((g) => (
              <div key={g.id ?? g.title} className="gallery-item aspect-[4/3]">
                <img src={g.image} alt={g.title} loading="lazy" className="aspect-[4/3] object-cover" />
                <div className="overlay">
                  <span className="label-grad mb-2">{g.category}</span>
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
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Post modal */}
      {modalOpen ? (
        <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className="card p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-xl font-bold mb-5">Post to Gallery</h3>

            {user ? (
              <div className="space-y-3">
                <input
                  ref={titleRef}
                  className={inputClass}
                  placeholder="Build title (required)"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={60}
                />
                <select
                  className={inputClass}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
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
                    className="btn-primary w-full"
                    onClick={() => void submit()}
                    disabled={submitting || !title.trim() || !file}
                  >
                    {submitting ? "Uploading…" : "Post Build"}
                  </button>
                  <button className="btn-secondary w-full" onClick={() => setModalOpen(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : sessionLoading ? (
              <p className="text-sm text-[var(--muted)] text-center py-6">Checking session…</p>
            ) : (
              <div className="text-center py-4">
                <i className="fa-brands fa-discord text-3xl text-[#5865F2] mb-4 block" />
                <p className="text-sm text-[var(--muted)] mb-5">
                  Sign in with Discord to post to the gallery.
                </p>
                <button className="btn-ghost w-full mt-2" onClick={() => setModalOpen(false)}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </SubPage>
  );
}