"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fallbackGallery } from "@/lib/fallback-data";
import { GALLERY_CATEGORIES } from "@/lib/storage";
import { compressImage, MAX_UPLOAD_BYTES } from "@/lib/imaging";
import { categoryClass } from "@/lib/forum-categories";
import { Markdown } from "@/components/Markdown";
import { RichEditor } from "@/components/RichEditor";
import { Modal } from "@/components/Modal";
import type { GalleryComment, GalleryItem } from "@/types";
import { Avatar } from "@/components/Avatar";
import { EmptyState, ErrorState } from "@/components/EmptyState";
import { SubPage } from "@/components/SubPage";
import { useApi } from "@/lib/use-api";
import { useToast } from "@/components/Toast";
import { useSession } from "@/lib/use-session";
import { timeAgo } from "@/lib/time";

const MAX_IMAGES = 8;

/** One in-progress image in the composer. */
interface PendingImage {
  key: string;
  name: string;
  preview: string; // blob URL
  url?: string; // storage URL once uploaded
  progress: number; // 0–100
  error?: string;
}

/** Flatten a post list into per-image slides for the lightbox. */
function buildSlides(items: GalleryItem[]): Array<{ item: number; image: number; url: string }> {
  const slides: Array<{ item: number; image: number; url: string }> = [];
  items.forEach((g, gi) => {
    const imgs = g.images && g.images.length > 0 ? g.images : [g.image];
    imgs.forEach((url, ii) => slides.push({ item: gi, image: ii, url }));
  });
  return slides;
}

function imagesOf(g: GalleryItem): string[] {
  return g.images && g.images.length > 0 ? g.images : [g.image];
}

export default function GalleryPage() {
  const { show } = useToast();
  const { user, loading: sessionLoading } = useSession();
  const isAdmin = user?.role === "admin";

  const { data: items, loading, error, refetch } = useApi<GalleryItem[]>("/api/gallery", fallbackGallery);

  // Local override layer on top of useApi's data — likes/feature/delete
  // patch items instantly without refetching the whole grid.
  const [localItems, setLocalItems] = useState<GalleryItem[] | null>(null);
  useEffect(() => {
    setLocalItems(items);
  }, [items]);
  const displayItems = localItems ?? items;

  /** Patch one item in the local list without a full refetch. */
  const setItemsLocal = useCallback((id: number, patch: Partial<GalleryItem>) => {
    setLocalItems((prev) => (prev ?? items).map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }, [items]);

  const [filter, setFilter] = useState("All");
  const [sort, setSort] = useState<"new" | "liked" | "viewed">("new");
  const [search, setSearch] = useState("");

  // ------------------------------------------------------------------
  // Composer state.
  // ------------------------------------------------------------------
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>(GALLERY_CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState<PendingImage[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Lightbox — tracked by item id + image index (NOT a flat array index):
  // likes/feature actions re-sort the grid, so an index captured earlier
  // could silently point at a different post.
  const [viewing, setViewing] = useState<{ itemId: number; image: number } | null>(null);
  const [comments, setComments] = useState<GalleryComment[] | null>(null);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [busyItem, setBusyItem] = useState<number | null>(null);
  // In-flight marker for comment deletion — a double-clicked trash icon must
  // not fire a second DELETE that 404s and toasts an error over the success.
  const [busyCommentId, setBusyCommentId] = useState<number | null>(null);
  const [busyLike, setBusyLike] = useState<number | null>(null);

  const categories = useMemo(() => {
    const set = new Set(displayItems.map((i) => i.category));
    return ["All", ...Array.from(set)];
  }, [displayItems]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = filter === "All" ? displayItems : displayItems.filter((i) => i.category === filter);
    if (q) {
      list = list.filter(
        (i) => i.title.toLowerCase().includes(q) || i.builder.toLowerCase().includes(q)
      );
    }
    // Featured always floats first; then the chosen sort.
    return [...list].sort((a, b) => {
      if (Boolean(b.featured) !== Boolean(a.featured)) return Number(Boolean(b.featured)) - Number(a.featured);
      if (sort === "liked") return (b.likes ?? 0) - (a.likes ?? 0);
      if (sort === "viewed") return (b.views ?? 0) - (a.views ?? 0);
      return (b.id ?? 0) - (a.id ?? 0);
    });
  }, [displayItems, filter, sort, search]);

  const slides = useMemo(() => buildSlides(visible), [visible]);

  // Resolve the lightbox target from the current (possibly re-sorted) list.
  const currentItem = viewing ? visible.find((g) => g.id === viewing.itemId) ?? null : null;
  const currentImages = currentItem ? imagesOf(currentItem) : [];
  const slideIndex = (() => {
    if (!viewing || !currentItem) return -1;
    const itemPos = visible.findIndex((g) => g.id === viewing.itemId);
    if (itemPos < 0) return -1;
    return slides.findIndex((s) => s.item === itemPos && s.image === viewing.image);
  })();

  // Blob previews must not leak when the page unmounts mid-compose.
  const pendingRef = useRef<PendingImage[]>([]);
  pendingRef.current = pending;
  useEffect(() => {
    return () => {
      for (const p of pendingRef.current) URL.revokeObjectURL(p.preview);
    };
  }, []);

  // Lock body scroll while an overlay is up; arrow keys page through the
  // lightbox. Escape is handled by <Modal> (topmost-overlay rule) — a second
  // document-level listener here closed the composer AND the lightbox (and
  // anything stacked above them) with a single press.
  useEffect(() => {
    if (!modalOpen && !viewing) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      // Arrow keys in a text field move the caret — never page the lightbox.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (viewing && slides.length > 1 && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        const dir = e.key === "ArrowRight" ? 1 : -1;
        const idx = slideIndex >= 0 ? slideIndex : 0;
        const next = slides[(idx + dir + slides.length) % slides.length];
        setViewing({ itemId: visible[next.item].id ?? 0, image: next.image });
      }
    };
    if (modalOpen) titleRef.current?.focus();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
    // slides/visible must be deps: a filter/sort change that keeps the slide
    // count identical would otherwise leave arrow keys paging a stale list.
  }, [modalOpen, viewing, slideIndex, slides, visible]);

  // Load comments (and bump views) when the lightbox opens on a post.
  const viewingItemId = viewing?.itemId ?? null;
  useEffect(() => {
    if (viewingItemId === null) return;
    let cancelled = false;
    setComments(null);
    setCommentsLoading(true);
    fetch(`/api/gallery/${viewingItemId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("failed");
        const data = (await res.json()) as { item: GalleryItem; comments: GalleryComment[] };
        if (cancelled) return;
        setComments(data.comments);
        // Mirror the bumped view count and the poster's resolved avatar
        // into the local list state.
        setItemsLocal(viewingItemId, {
          views: data.item.views,
          builderAvatar: data.item.builderAvatar ?? null,
        });
      })
      .catch(() => !cancelled && setComments([]))
      .finally(() => !cancelled && setCommentsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [viewingItemId, setItemsLocal]);

  const openModal = () => {
    setTitle("");
    setCategory(GALLERY_CATEGORIES[0]);
    setDescription("");
    // Revoke leftover blob previews so they don't leak memory.
    setPending((prev) => {
      for (const p of prev) URL.revokeObjectURL(p.preview);
      return [];
    });
    setModalOpen(true);
  };

  // ------------------------------------------------------------------
  // Composer: pick → compress → upload each image separately.
  // ------------------------------------------------------------------

  const onPick = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const room = MAX_IMAGES - pending.length;
    if (room <= 0) {
      show("Too many images", `Posts can have at most ${MAX_IMAGES} images.`, "error");
      return;
    }
    const picked = Array.from(files).slice(0, room);
    for (const f of picked) {
      if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(f.type)) {
        show("Unsupported image", `${f.name}: use JPG, PNG, WebP or GIF.`, "error");
        continue;
      }
      if (f.size > MAX_UPLOAD_BYTES) {
        show(
          "Image too large",
          f.type === "image/gif"
            ? `${f.name}: GIFs must be under 4 MB (animations can't be compressed).`
            : `${f.name}: keep uploads under 4 MB.`,
          "error"
        );
        continue;
      }
      const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const preview = URL.createObjectURL(f);
      setPending((prev) => [...prev, { key, name: f.name, preview, progress: 0 }]);
      // Compress in the browser, then upload — each file is its own request
      // so we stay well below the serverless body limit and get progress.
      void (async () => {
        try {
          const compressed = await compressImage(f, 1920, 0.85);
          const url = await xhrUpload("/api/upload", compressed, (pct) =>
            setPending((prev) => prev.map((p) => (p.key === key ? { ...p, progress: pct } : p)))
          );
          setPending((prev) => prev.map((p) => (p.key === key ? { ...p, url, progress: 100 } : p)));
        } catch (err) {
          setPending((prev) =>
            prev.map((p) =>
              p.key === key
                ? { ...p, error: err instanceof Error ? err.message : "Upload failed" }
                : p
            )
          );
        }
      })();
    }
  };

  const removePending = (key: string) => {
    setPending((prev) => {
      const p = prev.find((x) => x.key === key);
      if (p) URL.revokeObjectURL(p.preview);
      return prev.filter((x) => x.key !== key);
    });
  };

  const makeCover = (key: string) => {
    setPending((prev) => {
      const idx = prev.findIndex((x) => x.key === key);
      if (idx <= 0) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.unshift(item);
      return next;
    });
  };

  const submit = async () => {
    const t = title.trim();
    const urls = pending.map((p) => p.url).filter((u): u is string => Boolean(u));
    if (!t || submitting || urls.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/gallery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t, category, description: description.trim(), images: urls }),
      });
      if (res.ok) {
        show("Posted", "Your build is now in the gallery.");
        // Reset the composer and release the blob previews immediately —
        // leaving them pending leaked object URLs until the next open.
        setPending((prev) => {
          for (const p of prev) URL.revokeObjectURL(p.preview);
          return [];
        });
        setTitle("");
        setDescription("");
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

  // ------------------------------------------------------------------
  // Likes / moderation.
  // ------------------------------------------------------------------

  const toggleLike = async (g: GalleryItem) => {
    if (!user) {
      show("Sign in to like", "Log in with Discord to like builds.", "error");
      return;
    }
    if (busyLike !== null) return;
    setBusyLike(g.id ?? 0);
    const liked = g.liked === true;
    setItemsLocal(g.id ?? 0, {
      liked: !liked,
      likes: (g.likes ?? 0) + (liked ? -1 : 1),
    });
    try {
      const res = await fetch(`/api/gallery/${g.id}/like`, { method: "POST" });
      if (!res.ok) throw new Error("like failed");
      const data = (await res.json()) as { item: GalleryItem; liked: boolean };
      setItemsLocal(g.id ?? 0, { likes: data.item.likes, liked: data.liked });
    } catch {
      setItemsLocal(g.id ?? 0, { liked: g.liked ?? false, likes: g.likes ?? 0 });
      show("Couldn't like", "The server rejected the request.", "error");
    } finally {
      setBusyLike(null);
    }
  };

  const feature = async (g: GalleryItem) => {
    if (!isAdmin || busyItem !== null) return;
    setBusyItem(g.id ?? 0);
    try {
      const res = await fetch(`/api/gallery/${g.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featured: !g.featured }),
      });
      if (!res.ok) {
        show("Couldn't update", "The server rejected the request.", "error");
        return;
      }
      setItemsLocal(g.id ?? 0, { featured: !g.featured });
      show(g.featured ? "Unfeatured" : "Featured", `"${g.title}" ${g.featured ? "returned to the grid" : "now floats to the top"}.`);
    } catch {
      show("Couldn't update", "Check your connection and try again.");
    } finally {
      setBusyItem(null);
    }
  };

  const deleteItem = async (g: GalleryItem) => {
    if (busyItem !== null) return;
    const ok = window.confirm(`Delete "${g.title}"? This can't be undone.`);
    if (!ok) return;
    setBusyItem(g.id ?? 0);
    try {
      const res = await fetch(`/api/gallery/${g.id}`, { method: "DELETE" });
      if (!res.ok) {
        show("Couldn't delete", "The server rejected the request.", "error");
        return;
      }
      setViewing(null);
      show("Deleted", `"${g.title}" was removed.`);
      void refetch();
    } catch {
      show("Couldn't delete", "Check your connection and try again.");
    } finally {
      setBusyItem(null);
    }
  };

  const postComment = async () => {
    if (!currentItem) return;
    const text = commentText.trim();
    if (!text || postingComment) return;
    setPostingComment(true);
    try {
      const res = await fetch(`/api/gallery/${currentItem.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      if (res.ok) {
        const created = (await res.json()) as GalleryComment;
        setComments((prev) => [...(prev ?? []), created]);
        setLocalItems((prev) =>
          (prev ?? items).map((g) =>
            g.id === currentItem.id ? { ...g, commentCount: (g.commentCount ?? 0) + 1 } : g
          )
        );
        setCommentText("");
      } else if (res.status === 401) {
        show("Sign in to comment", "Log in with Discord to comment.", "error");
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        show("Couldn't comment", data.error ?? "The server rejected the request.", "error");
      }
    } catch {
      show("Couldn't comment", "Check your connection and try again.", "error");
    } finally {
      setPostingComment(false);
    }
  };

  const deleteComment = async (c: GalleryComment) => {
    if (!currentItem || busyCommentId !== null) return;
    const ok = window.confirm("Delete this comment?");
    if (!ok) return;
    setBusyCommentId(c.id ?? 0);
    try {
      const res = await fetch(`/api/gallery/${currentItem.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId: c.id }),
      });
      if (!res.ok) {
        show("Couldn't delete", "The server rejected the request.", "error");
        return;
      }
      setComments((prev) => (prev ?? []).filter((x) => x.id !== c.id));
      setLocalItems((prev) =>
        (prev ?? items).map((g) =>
          g.id === currentItem.id ? { ...g, commentCount: Math.max(0, (g.commentCount ?? 1) - 1) } : g
        )
      );
    } catch {
      show("Couldn't delete", "Check your connection and try again.", "error");
    } finally {
      setBusyCommentId(null);
    }
  };

  const openLightbox = (visibleIndex: number, imageIndex = 0) => {
    const item = visible[visibleIndex];
    if (!item?.id) return;
    setViewing({ itemId: item.id, image: imageIndex });
  };

  /** Step the lightbox across every image of every visible post. */
  const stepSlide = (dir: 1 | -1) => {
    if (!viewing || slides.length === 0) return;
    const idx = slideIndex >= 0 ? slideIndex : 0;
    const next = slides[(idx + dir + slides.length) % slides.length];
    setViewing({ itemId: visible[next.item].id ?? 0, image: next.image });
  };

  const listError = error && displayItems.length === 0;
  const okCount = pending.filter((p) => p.url).length;
  const stillUploading = pending.some((p) => !p.url && !p.error);
  // A failed upload must not be silently dropped from the post — make the
  // user remove it or re-pick it first.
  const hasFailedUpload = pending.some((p) => Boolean(p.error));

  return (
    <SubPage>
      <div className="w-full">
        {/* Header */}
        <div className="page-header rowed mb-6 gap-4">
          <div>
            <h1 className="page-title">Gallery</h1>
          </div>
          <div className="flex items-center gap-3 flex-1 justify-end min-w-0">
            <div className="relative flex-1 max-w-xs min-w-[9rem]">
              <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-2)]" />
              <input
                className="w-full bg-[var(--bg-2)] border border-[var(--border)] pl-9 pr-8 py-2.5 text-sm text-[var(--fg)] outline-none focus:border-[var(--accent)] transition placeholder:text-[var(--muted-2)] rounded-lg"
                placeholder="Search builds…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search builds"
              />
            </div>
            <button className="btn-primary btn-sm flex-shrink-0" onClick={openModal}>
              <i className="fa-solid fa-upload" />
              Post a build
            </button>
          </div>
        </div>

        {/* Toolbar: category chips with counts + sort */}
        <div className="flex items-center justify-between gap-3 flex-wrap mb-8">
          <div className="flex gap-2 flex-wrap">
            {categories.map((c) => {
              const count = c === "All" ? displayItems.length : displayItems.filter((i) => i.category === c).length;
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
            {(["new", "liked", "viewed"] as const).map((s) => (
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
                {s === "new" ? "Newest" : s === "liked" ? "Most liked" : "Most viewed"}
              </button>
            ))}
          </div>
        </div>

        {listError ? (
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
            {visible.map((g, i) => {
              const liked = g.liked === true && Boolean(user);
              const imgs = imagesOf(g);
              return (
                <div key={g.id ?? `${i}-${g.title}`} className="relative group/gallery">
                  <button
                    className="gallery-item aspect-[4/3] text-left w-full"
                    onClick={() => openLightbox(i)}
                    aria-label={`View ${g.title} by ${g.builder}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imgs[0]} alt={g.title} loading="lazy" decoding="async" className="aspect-[4/3] object-cover" />
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
                  {/* Floating badges & actions */}
                  <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 pointer-events-none">
                    {g.featured ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#ffd166] border border-[#ffd166]/50 bg-black/50 rounded px-1.5 py-0.5">
                        <i className="fa-solid fa-star" /> Featured
                      </span>
                    ) : null}
                    {imgs.length > 1 ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[var(--fg-2)] border border-[var(--border-strong)] bg-black/50 rounded px-1.5 py-0.5">
                        <i className="fa-solid fa-images" /> {imgs.length}
                      </span>
                    ) : null}
                  </div>
                  {/* Like without opening the lightbox */}
                  <button
                    className={`absolute bottom-2.5 right-2.5 inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg border px-2.5 py-1.5 backdrop-blur transition ${
                      liked
                        ? "border-[var(--redstone)] text-[var(--redstone)] bg-[var(--redstone)]/20"
                        : "border-white/20 text-white/90 bg-black/50 hover:border-[var(--redstone)] hover:text-[var(--redstone)]"
                    }`}
                    onClick={() => void toggleLike(g)}
                    disabled={busyLike !== null}
                    aria-label={liked ? `Unlike ${g.title}` : `Like ${g.title}`}
                  >
                    <i className={`${liked ? "fa-solid" : "fa-regular"} fa-heart`} />
                    {g.likes}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Post modal — portal to body so it covers the viewport (see Modal.tsx) */}
      {modalOpen ? (
        <Modal
          label="Post to Gallery"
          onClose={() => setModalOpen(false)}
          cardClassName="p-6 w-full max-w-lg flex flex-col max-h-[calc(100dvh-3rem)]"
        >
            <h3 id="post-gallery-title" className="font-display text-xl font-bold mb-4 flex-shrink-0">Post to Gallery</h3>
            {user ? (
              <form
                className="modal-scroll space-y-4 pr-1 -mr-1"
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
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      void onPick(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    className="w-full bg-[var(--bg-2)] border border-dashed border-[var(--border-strong)] px-4 py-6 text-sm text-[var(--fg-2)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition rounded-2xl"
                    onClick={() => fileRef.current?.click()}
                  >
                    <span className="flex items-center justify-center gap-2 text-center">
                      <i className="fa-solid fa-cloud-arrow-up" />
                      Add images — up to {MAX_IMAGES} (JPG/PNG/WebP/GIF under 4 MB each)
                    </span>
                  </button>
                </label>

                {pending.length > 0 ? (
                  <div className="grid grid-cols-4 gap-2">
                    {pending.map((p, idx) => (
                      <div key={p.key} className="relative group/pending rounded-lg overflow-hidden border border-[var(--border)]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.preview} alt={p.name} className="aspect-square w-full object-cover" />
                        {p.error ? (
                          <div
                            className="absolute inset-0 bg-black/75 flex items-center justify-center text-[var(--redstone)] text-xs p-1 text-center"
                            title={p.error}
                          >
                            <i className="fa-solid fa-triangle-exclamation" />
                          </div>
                        ) : p.url ? null : (
                          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/60">
                            <div className="h-full bg-[var(--accent)] transition-all" style={{ width: `${p.progress}%` }} />
                          </div>
                        )}
                        {idx === 0 && !p.error ? (
                          <span className="absolute top-1 left-1 text-[9px] font-bold uppercase tracking-wider text-[#ffd166] bg-black/60 border border-[#ffd166]/40 rounded px-1 py-0.5">
                            Cover
                          </span>
                        ) : null}
                        <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover/pending:opacity-100 transition-opacity">
                          {idx > 0 && !p.error ? (
                            <button
                              type="button"
                              className="w-6 h-6 flex items-center justify-center rounded bg-black/70 text-[#ffd166] hover:bg-black"
                              onClick={() => makeCover(p.key)}
                              title="Make cover"
                              aria-label="Make cover image"
                            >
                              <i className="fa-solid fa-star text-[10px]" />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="w-6 h-6 flex items-center justify-center rounded bg-black/70 text-white hover:text-[var(--redstone)] hover:bg-black"
                            onClick={() => removePending(p.key)}
                            title="Remove"
                            aria-label="Remove image"
                          >
                            <i className="fa-solid fa-xmark text-[10px]" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div>
                  <p className="text-xs text-[var(--muted)] mb-2 font-semibold uppercase tracking-wider">
                    Description <span className="normal-case font-normal">(optional, markdown)</span>
                  </p>
                  <RichEditor
                    idPrefix="gallery-description"
                    value={description}
                    onChange={setDescription}
                    rows={4}
                    maxLength={4000}
                    placeholder="Coordinates, farm rates, a story…"
                    onUploadError={(m) => show("Couldn't upload image", m, "error")}
                  />
                </div>

                <div className="flex gap-3 pt-1">
                  <button
                    type="submit"
                    className="btn-primary w-full"
                    disabled={submitting || !title.trim() || okCount === 0 || stillUploading || hasFailedUpload}
                  >
                    {submitting ? "Posting…" : stillUploading ? "Uploading…" : hasFailedUpload ? "Remove failed images" : "Post Build"}
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
        </Modal>
      ) : null}

      {/* Lightbox — full image + meta + comments, Esc/arrows navigate */}
      {currentItem && viewing && slideIndex >= 0 ? (
        <Modal
          label={currentItem.title}
          onClose={() => setViewing(null)}
          cardClassName="overflow-hidden w-full max-w-5xl max-h-[calc(100dvh-3rem)] flex flex-col lg:flex-row"
        >
            {/* Image pane */}
            <div className="relative flex-1 min-w-0 bg-[var(--bg)] flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentImages[viewing.image] ?? currentImages[0]}
                alt={currentItem.title}
                className="max-h-[55vh] lg:max-h-[92vh] w-full object-contain"
              />
              {currentImages.length > 1 ? (
                <span className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-[var(--fg-2)] bg-black/60 border border-[var(--border-strong)] rounded-full px-3 py-1">
                  {viewing.image + 1} / {currentImages.length}
                </span>
              ) : null}
              {slides.length > 1 ? (
                <>
                  <button
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 border border-white/15 text-white hover:bg-black/80 transition"
                    onClick={() => stepSlide(-1)}
                    aria-label="Previous image"
                  >
                    <i className="fa-solid fa-chevron-left" />
                  </button>
                  <button
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 border border-white/15 text-white hover:bg-black/80 transition"
                    onClick={() => stepSlide(1)}
                    aria-label="Next image"
                  >
                    <i className="fa-solid fa-chevron-right" />
                  </button>
                </>
              ) : null}
            </div>

            {/* Meta + comments pane */}
            <div className="w-full lg:w-96 flex flex-col min-h-0 border-t lg:border-t-0 lg:border-l border-[var(--border)]">
              <div className="p-5 border-b border-[var(--border)]">
                <div className="flex items-start gap-3">
                  <Avatar name={currentItem.builder} src={currentItem.builderAvatar} size="sm" />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-display text-lg font-bold truncate">{currentItem.title}</h3>
                    <p className="text-xs text-[var(--muted)]">
                      by {currentItem.builder}
                      {currentItem.createdAt ? ` · ${timeAgo(currentItem.createdAt)}` : ""} ·{" "}
                      <i className="fa-regular fa-eye" /> {currentItem.views ?? 0}
                    </p>
                  </div>
                  <span
                    className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border flex-shrink-0 ${categoryClass(currentItem.category)}`}
                  >
                    {currentItem.category}
                  </span>
                </div>

                {currentItem.description ? (
                  <div className="mt-3 text-sm text-[var(--fg-2)]">
                    <Markdown text={currentItem.description} />
                  </div>
                ) : null}

                <div className="flex items-center gap-2 mt-4 flex-wrap">
                  <button
                    className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg border px-3 py-2 transition disabled:opacity-40 ${
                      currentItem.liked === true && user
                        ? "border-[var(--redstone)] text-[var(--redstone)] bg-[var(--redstone)]/10"
                        : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--redstone)] hover:text-[var(--redstone)]"
                    }`}
                    onClick={() => void toggleLike(currentItem)}
                    disabled={busyLike !== null}
                  >
                    <i className={`${currentItem.liked === true && user ? "fa-solid" : "fa-regular"} fa-heart`} />
                    {currentItem.likes} {currentItem.likes === 1 ? "like" : "likes"}
                  </button>
                  {isAdmin ? (
                    <button
                      className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg border border-[var(--border)] px-3 py-2 text-[var(--muted)] hover:border-[#ffd166] hover:text-[#ffd166] transition disabled:opacity-40"
                      onClick={() => void feature(currentItem)}
                      disabled={busyItem !== null}
                    >
                      <i className={`fa-${currentItem.featured ? "solid" : "regular"} fa-star`} />
                      {currentItem.featured ? "Unfeature" : "Feature"}
                    </button>
                  ) : null}
                  {user && (isAdmin || (currentItem.authorId === user.id && currentItem.authorId !== "")) ? (
                    <button
                      className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg border border-[var(--border)] px-3 py-2 text-[var(--muted)] hover:border-[var(--redstone)] hover:text-[var(--redstone)] transition disabled:opacity-40"
                      onClick={() => void deleteItem(currentItem)}
                      disabled={busyItem !== null}
                    >
                      <i className="fa-solid fa-trash" /> Delete
                    </button>
                  ) : null}
                  <button className="btn-secondary btn-sm ml-auto" onClick={() => setViewing(null)} aria-label="Close">
                    <i className="fa-solid fa-xmark" />
                  </button>
                </div>
              </div>

              {/* Comments — scroll inside the pane instead of stretching
                  the dialog (thin-scroll gives a slim dark scrollbar) */}
              <div className="flex-1 overflow-y-auto p-5 min-h-0 thin-scroll">
                <h4 className="font-display text-sm font-bold mb-3 flex items-center gap-2">
                  <i className="fa-regular fa-comments text-[var(--accent)]" />
                  {currentItem.commentCount ?? 0} {currentItem.commentCount === 1 ? "comment" : "comments"}
                </h4>
                {commentsLoading ? (
                  <p className="text-sm text-[var(--muted)]">Loading comments…</p>
                ) : (comments ?? []).length === 0 ? (
                  <p className="text-sm text-[var(--muted-2)]">No comments yet.</p>
                ) : (
                  <div className="space-y-4">
                    {(comments ?? []).map((c) => (
                      <div key={c.id} className="flex items-start gap-2.5">
                        <Avatar name={c.author} src={c.avatarUrl} size="sm" className="w-7! h-7!" color={c.color} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-[var(--fg)]">{c.author}</span>
                            <span className="text-[11px] text-[var(--muted-2)]">{timeAgo(c.createdAt)}</span>
                            {user && (isAdmin || (c.authorId === user.id && c.authorId !== "")) ? (
                              <button
                                className="text-[11px] text-[var(--muted-2)] hover:text-[var(--redstone)] transition"
                                onClick={() => void deleteComment(c)}
                                disabled={busyCommentId !== null}
                                aria-label="Delete comment"
                              >
                                <i className={`fa-solid fa-trash ${busyCommentId === c.id ? "fa-spin" : ""}`} />
                              </button>
                            ) : null}
                          </div>
                          <div className="text-sm text-[var(--fg-2)] mt-0.5">
                            <Markdown text={c.content} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Comment composer */}
              <div className="p-4 border-t border-[var(--border)]">
                {user ? (
                  <div className="flex gap-2">
                    <input
                      className="input flex-1"
                      placeholder="Add a comment…"
                      value={commentText}
                      maxLength={2000}
                      onChange={(e) => setCommentText(e.target.value)}
                      onKeyDown={(e) => {
                        // Don't send while an IME composition is being confirmed.
                        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          void postComment();
                        }
                      }}
                      aria-label="Add a comment"
                    />
                    <button
                      className="btn-primary btn-sm"
                      onClick={() => void postComment()}
                      disabled={postingComment || !commentText.trim()}
                    >
                      {postingComment ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-paper-plane" />}
                    </button>
                  </div>
                ) : (
                  <a href="/login?next=/gallery" className="btn-secondary btn-sm w-full justify-center">
                    <i className="fa-brands fa-discord" />
                    Sign in to comment
                  </a>
                )}
              </div>
            </div>
        </Modal>
      ) : null}
    </SubPage>
  );
}

/** Upload with real progress events (fetch has none for request bodies).
 *  A hard timeout keeps a hung connection from spinning "Uploading…" forever. */
function xhrUpload(url: string, file: File, onProgress: (pct: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = new FormData();
    body.set("image", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.timeout = 60_000;
    xhr.ontimeout = () => reject(new Error("Upload timed out — try again."));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText) as { url?: string; error?: string };
        if (xhr.status >= 200 && xhr.status < 300 && data.url) resolve(data.url);
        else reject(new Error(data.error ?? `Upload failed (${xhr.status})`));
      } catch {
        reject(new Error("Upload failed"));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed — check your connection."));
    xhr.send(body);
  });
}
