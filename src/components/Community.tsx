"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  loadPosts,
  loadComments,
  createPost,
  updatePost,
  deletePost,
  getMyLikedPostIds,
  getMyLikedCommentIds,
  togglePostLike,
  toggleCommentLike,
  createComment,
  deleteComment,
  uploadImage,
  parseImages,
  timeAgo,
  stripHtml,
  POSTS_PER_PAGE,
  MAX_IMAGE_SIZE,
} from "@/lib/api";
import type { Post, Comment } from "@/lib/supabase";
import { supabase } from "@/lib/supabase";
import RichTextEditor from "@/components/RichTextEditor";
import Lightbox from "@/components/Lightbox";
import ConfirmModal from "@/components/ConfirmModal";

export default function Community() {
  const { user, canAdmin } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Composer state
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerHtml, setComposerHtml] = useState("");
  const [composerImages, setComposerImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  // Detail view
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentHtml, setCommentHtml] = useState("");
  const [commentImages, setCommentImages] = useState<string[]>([]);
  const [commentUploading, setCommentUploading] = useState(false);

  // Lightbox
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // In-app delete confirmation (replaces native confirm())
  const [pendingDelete, setPendingDelete] = useState<null | { kind: "post" | "comment"; id: number }>(null);

  // Which posts/comments THIS user has liked. Restored from the DB on load so
  // a refresh (or a different browser) cannot re-like. Source of truth stays
  // server-side in post_likes / comment_likes.
  const [likedPosts, setLikedPosts] = useState<Set<number>>(new Set());
  const [likedComments, setLikedComments] = useState<Set<number>>(new Set());
  const [likesHydrated, setLikesHydrated] = useState(false);
  const [likingPostIds, setLikingPostIds] = useState<number[]>([]);
  const [likingCommentIds, setLikingCommentIds] = useState<number[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const commentFileInputRef = useRef<HTMLInputElement>(null);

  // True only while we are restoring the user's like state from the DB.
  // Used to suppress the like buttons until we know their real state.
  const restoringLikes = !likesHydrated && !!user?.discordId;

  useEffect(() => {
    loadData();
  }, [page, search]);

  // Restore which posts/comments the current user has already liked.
  useEffect(() => {
    if (!user?.discordId) {
      setLikedPosts(new Set());
      setLikedComments(new Set());
      setLikesHydrated(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const [postIds, commentIds] = await Promise.all([
        getMyLikedPostIds(user.discordId),
        getMyLikedCommentIds(user.discordId),
      ]);
      if (cancelled) return;
      setLikedPosts(new Set(postIds));
      setLikedComments(new Set(commentIds));
      setLikesHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.discordId]);

  // Live sync: subscribe to Supabase Realtime so posts/comments created or
  // deleted by anyone (other user, another tab, mobile) show up without a
  // manual refresh. We only react to INSERT/DELETE here — like toggles are
  // already handled optimistically + via RPC, so refetching on every UPDATE
  // would just cause flicker. Requires the REALTIME migration (tables added
  // to the supabase_realtime publication) to be run once in Supabase.
  useEffect(() => {
    const channel = supabase
      .channel("community-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "posts" },
        () => loadData()
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "posts" },
        () => loadData()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "comments" },
        (payload: any) => {
          if (selectedPost && payload?.new?.post_id === selectedPost.id) {
            loadComments(selectedPost.id).then(setComments).catch(() => {});
          }
          loadData();
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "comments" },
        (payload: any) => {
          if (selectedPost && payload?.old?.post_id === selectedPost.id) {
            loadComments(selectedPost.id).then(setComments).catch(() => {});
          }
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedPost?.id]);

  // Periodic refresh so posts/comments stay in sync across users, tabs, and
  // devices even if Supabase Realtime isn't enabled. Gentle 15s poll. The
  // realtime subscription above enhances this when the REALTIME migration has
  // been run; the poller is the baseline that always works.
  useEffect(() => {
    const tick = () => {
      loadData();
      if (selectedPost) {
        loadComments(selectedPost.id).then(setComments).catch(() => {});
      }
    };
    const id = setInterval(tick, 15000);
    return () => clearInterval(id);
  }, [selectedPost?.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const all = await loadPosts();
      const filtered = search
        ? all.filter((p) => stripHtml(p.body).toLowerCase().includes(search.toLowerCase()))
        : all;
      setTotal(filtered.length);
      const start = (page - 1) * POSTS_PER_PAGE;
      setPosts(filtered.slice(start, start + POSTS_PER_PAGE));
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
    }
  };

  const openLightbox = (images: string[], index: number) => {
    setLightboxImages(images);
    setLightboxIndex(index);
  };

  const handleImageUpload = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        if (file.size > MAX_IMAGE_SIZE) {
          alert(`"${file.name}" is too large (max 25MB).`);
          continue;
        }
        const url = await uploadImage(file);
        urls.push(url);
      }
      setComposerImages((prev) => [...prev, ...urls]);
    } catch (err) {
      alert("Image upload failed.");
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCommentImageUpload = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setCommentUploading(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        if (file.size > MAX_IMAGE_SIZE) continue;
        const url = await uploadImage(file);
        urls.push(url);
      }
      setCommentImages((prev) => [...prev, ...urls]);
    } catch {
      alert("Image upload failed.");
    }
    setCommentUploading(false);
    if (commentFileInputRef.current) commentFileInputRef.current.value = "";
  };

  const submitPost = async () => {
    const text = stripHtml(composerHtml).trim();
    if (!text && composerImages.length === 0) {
      alert("Write something or add an image.");
      return;
    }
    try {
      await createPost({
        author: user?.username || "Anonymous",
        body: composerHtml,
        pfp: user?.avatar || "",
        images: composerImages,
      });
      setComposerHtml("");
      setComposerImages([]);
      setComposerOpen(false);
      setPage(1);
      setSearch("");
      loadData();
    } catch {
      alert("Failed to create post.");
    }
  };

  // Toggle the current user's like on a post. The DB is the source of truth,
  // so even after a refresh the liked state is restored and cannot be re-liked.
  const togglePostLikeFn = async (post: Post) => {
    if (!user?.discordId || likingPostIds.includes(post.id)) return;
    const wasLiked = likedPosts.has(post.id);
    const optimisticLikes = Math.max(0, (post.likes || 0) + (wasLiked ? -1 : 1));

    // Optimistic UI for both the list card and the open detail view.
    setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, likes: optimisticLikes } : p)));
    setSelectedPost((prev) => (prev?.id === post.id ? { ...prev, likes: optimisticLikes } : prev));
    setLikedPosts((prev) => {
      const next = new Set(prev);
      if (wasLiked) next.delete(post.id);
      else next.add(post.id);
      return next;
    });
    setLikingPostIds((prev) => [...prev, post.id]);

    try {
      const res = await togglePostLike(post.id, user.discordId);
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, likes: res.likes } : p)));
      setSelectedPost((prev) => (prev?.id === post.id ? { ...prev, likes: res.likes } : prev));
      setLikedPosts((prev) => {
        const next = new Set(prev);
        if (res.liked) next.add(post.id);
        else next.delete(post.id);
        return next;
      });
    } catch {
      // Revert on failure.
      setPosts((prev) => prev.map((p) => (p.id === post.id ? post : p)));
      setSelectedPost((prev) => (prev?.id === post.id ? post : prev));
      setLikedPosts((prev) => {
        const next = new Set(prev);
        if (wasLiked) next.add(post.id);
        else next.delete(post.id);
        return next;
      });
      alert("Could not update like. Please try again.");
    } finally {
      setLikingPostIds((prev) => prev.filter((id) => id !== post.id));
    }
  };

  // Toggle the current user's like on a comment (persisted, refresh-safe).
  const toggleCommentLikeFn = async (comment: Comment) => {
    if (!user?.discordId || likingCommentIds.includes(comment.id)) return;
    const wasLiked = likedComments.has(comment.id);
    const optimisticLikes = Math.max(0, (comment.likes || 0) + (wasLiked ? -1 : 1));

    setComments((prev) => prev.map((c) => (c.id === comment.id ? { ...c, likes: optimisticLikes } : c)));
    setLikedComments((prev) => {
      const next = new Set(prev);
      if (wasLiked) next.delete(comment.id);
      else next.add(comment.id);
      return next;
    });
    setLikingCommentIds((prev) => [...prev, comment.id]);

    try {
      const res = await toggleCommentLike(comment.id, user.discordId);
      setComments((prev) => prev.map((c) => (c.id === comment.id ? { ...c, likes: res.likes } : c)));
      setLikedComments((prev) => {
        const next = new Set(prev);
        if (res.liked) next.add(comment.id);
        else next.delete(comment.id);
        return next;
      });
    } catch {
      setComments((prev) => prev.map((c) => (c.id === comment.id ? comment : c)));
      setLikedComments((prev) => {
        const next = new Set(prev);
        if (wasLiked) next.add(comment.id);
        else next.delete(comment.id);
        return next;
      });
      alert("Could not update like. Please try again.");
    } finally {
      setLikingCommentIds((prev) => prev.filter((id) => id !== comment.id));
    }
  };

  const openPost = async (post: Post) => {
    setSelectedPost(post);
    try {
      const c = await loadComments(post.id);
      setComments(c);
    } catch {
      setComments([]);
    }
    setCommentHtml("");
    setCommentImages([]);
  };

  const submitComment = async () => {
    if (!selectedPost) return;
    const text = stripHtml(commentHtml).trim();
    if (!text && commentImages.length === 0) {
      alert("Write a comment or add an image.");
      return;
    }
    try {
      await createComment({
        post_id: selectedPost.id,
        author: user?.username || "Anonymous",
        body: commentHtml,
        pfp: user?.avatar || "",
        images: commentImages,
      });
      setCommentHtml("");
      setCommentImages([]);
      const c = await loadComments(selectedPost.id);
      setComments(c);
    } catch {
      alert("Failed to post comment.");
    }
  };

  const handleDeletePost = async (id: number) => {
    setPendingDelete({ kind: "post", id });
  };

  const handleDeleteComment = (id: number) => {
    setPendingDelete({ kind: "comment", id });
  };

  const confirmDelete = async () => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    try {
      if (target.kind === "post") {
        await deletePost(target.id);
        setSelectedPost(null);
        loadData();
      } else {
        await deleteComment(target.id);
        if (selectedPost) {
          const c = await loadComments(selectedPost.id);
          setComments(c);
        }
      }
    } catch {
      alert(`Failed to delete ${target.kind}.`);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / POSTS_PER_PAGE));

  // ---------- DETAIL VIEW ----------
  if (selectedPost) {
    const images = parseImages(selectedPost.images);
    return (
      <div className="post-detail">
        <div className="post-detail__back" onClick={() => setSelectedPost(null)}>
          ← Back to Community
        </div>
        <div className="post-detail__head">
          <div className="post-detail__avatar">
            {selectedPost.pfp ? (
              <img src={selectedPost.pfp} alt="" />
            ) : (
              selectedPost.author.charAt(0).toUpperCase()
            )}
          </div>
          <div>
            <div className="post-detail__author">{selectedPost.author}</div>
            <div className="post-detail__time">{timeAgo(selectedPost.created_at)}</div>
          </div>
          {canAdmin && (
            <div className="post-detail__admin">
              <button
                type="button"
                className="icon-btn icon-btn--danger"
                aria-label="Delete post"
                title="Delete post"
                onClick={() => handleDeletePost(selectedPost.id)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  <path d="M10 11v6M14 11v6" />
                </svg>
              </button>
            </div>
          )}
        </div>
        <div className="post-detail__body" dangerouslySetInnerHTML={{ __html: selectedPost.body }} />
        {images.length > 0 && (
          <div className={`post-detail__images post-detail__images--${Math.min(images.length, 4)}`}>
            {images.map((img, i) => (
              <div
                key={i}
                className="post-detail__image"
                onClick={() => openLightbox(images, i)}
              >
                <img src={img} alt="" loading="lazy" />
              </div>
            ))}
          </div>
        )}
        <div className="post-detail__footer">
          <button
            type="button"
            className={`post-detail__stat ${likedPosts.has(selectedPost.id) ? "liked" : ""} ${restoringLikes ? "is-loading" : ""}`}
            onClick={() => togglePostLikeFn(selectedPost)}
            disabled={restoringLikes || likingPostIds.includes(selectedPost.id)}
            aria-pressed={likedPosts.has(selectedPost.id)}
            aria-label={likedPosts.has(selectedPost.id) ? "Unlike post" : "Like post"}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            {selectedPost.likes || 0} {selectedPost.likes === 1 ? "Like" : "Likes"}
          </button>
          <span className="post-detail__stat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {comments.length} {comments.length === 1 ? "Comment" : "Comments"}
          </span>
        </div>

        {/* Comments */}
        <div className="comments-section">
          <div className="comments-section__title">
            Comments <span className="comments-section__count">({comments.length})</span>
          </div>
          <div className="comment-form">
            <RichTextEditor value={commentHtml} onChange={setCommentHtml} placeholder="Write a comment..." />
            <div className="add-media-row">
              <button className="add-media-btn" onClick={() => commentFileInputRef.current?.click()}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add Image
              </button>
              <span className="add-media-hint">Images are uploaded to Supabase Storage.</span>
              <input
                ref={commentFileInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: "none" }}
                onChange={(e) => handleCommentImageUpload(e.target.files)}
              />
            </div>
            {commentImages.length > 0 && (
              <div className="image-previews">
                {commentImages.map((img, i) => (
                  <div key={i} className="image-thumb">
                    <img src={img} alt="" />
                    <button
                      className="image-thumb__remove"
                      onClick={() => setCommentImages((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: "10px" }}>
              <button className="btn btn--start" onClick={submitComment} disabled={commentUploading}>
                {commentUploading ? "Uploading..." : "Post Comment"}
              </button>
            </div>
          </div>

          {comments.length === 0 ? (
            <div className="empty-state">No comments yet. Be the first!</div>
          ) : (
            comments.map((c) => {
              const cImages = parseImages(c.images);
              return (
                <div key={c.id} className="comment">
                  <div className="comment__head">
                    <div className="comment__avatar">
                      {c.pfp ? <img src={c.pfp} alt="" /> : c.author.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="comment__author">{c.author}</div>
                      <div className="comment__time">{timeAgo(c.created_at)}</div>
                    </div>
                    {canAdmin && (
                      <div className="comment__admin" style={{ marginLeft: "auto" }}>
                        <button
                          type="button"
                          className="icon-btn icon-btn--danger"
                          aria-label="Delete comment"
                          title="Delete comment"
                          onClick={() => handleDeleteComment(c.id)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                            <path d="M10 11v6M14 11v6" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="comment__body" dangerouslySetInnerHTML={{ __html: c.body }} />
                  {cImages.length > 0 && (
                    <div className="comment__images">
                      {cImages.map((img, i) => (
                        <div
                          key={i}
                          className="comment__image"
                          onClick={() => openLightbox(cImages, i)}
                        >
                          <img src={img} alt="" loading="lazy" />
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="comment__footer">
                    <button
                      type="button"
                      className={`post-detail__stat comment__like ${likedComments.has(c.id) ? "liked" : ""} ${restoringLikes ? "is-loading" : ""}`}
                      onClick={() => toggleCommentLikeFn(c)}
                      disabled={restoringLikes || likingCommentIds.includes(c.id)}
                      aria-pressed={likedComments.has(c.id)}
                      aria-label={likedComments.has(c.id) ? "Unlike comment" : "Like comment"}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                      </svg>
                      {c.likes || 0}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <Lightbox images={lightboxImages} index={lightboxIndex} onClose={() => setLightboxImages([])} />

        <ConfirmModal
          open={pendingDelete !== null}
          title="Delete post?"
          message="This post and all of its comments will be permanently removed. This can't be undone."
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      </div>
    );
  }

  // ---------- LIST VIEW ----------
  return (
    <div>
      <div className="community-toolbar">
        <div className="search-bar">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            className="search-bar__input"
            placeholder="Search posts..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          {search && (
            <button className="search-bar__clear show" onClick={() => { setSearch(""); setPage(1); }}>
              ×
            </button>
          )}
        </div>
        <div className="community-stats">{total} posts</div>
      </div>

      {/* Composer */}
      <div className="card composer-card">
        <div className="composer-header">
          <span className="composer-header__title">Share something</span>
          {canAdmin && <span className="composer-header__badge">Admin</span>}
        </div>
        {composerOpen ? (
          <>
            <RichTextEditor value={composerHtml} onChange={setComposerHtml} placeholder="What's on your mind?" />
            <div className="add-media-row">
              <button className="add-media-btn" onClick={() => fileInputRef.current?.click()}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add Image
              </button>
              <span className="add-media-hint">Images are uploaded to Supabase Storage.</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: "none" }}
                onChange={(e) => handleImageUpload(e.target.files)}
              />
            </div>
            {composerImages.length > 0 && (
              <div className="image-previews">
                {composerImages.map((img, i) => (
                  <div key={i} className="image-thumb">
                    <img src={img} alt="" />
                    <button
                      className="image-thumb__remove"
                      onClick={() => setComposerImages((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: "12px", display: "flex", gap: "8px" }}>
              <button className="btn btn--start" onClick={submitPost} disabled={uploading}>
                {uploading ? "Uploading..." : "Post"}
              </button>
              <button className="btn btn--ghost" onClick={() => { setComposerOpen(false); setComposerHtml(""); setComposerImages([]); }}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <div
            className="editor__content"
            style={{ minHeight: "60px", cursor: "text", color: "var(--text-dim)" }}
            onClick={() => setComposerOpen(true)}
          >
            What&apos;s on your mind?
          </div>
        )}
      </div>

      {/* Posts */}
      {loading ? (
        <div className="status-spinner-wrapper">
          <div className="status-spinner" />
          <span>Loading posts...</span>
        </div>
      ) : posts.length === 0 ? (
        <div className="empty-state">No posts yet. Be the first to share!</div>
      ) : (
        posts.map((post) => {
          const images = parseImages(post.images);
          return (
            <div key={post.id} className="post-card" onClick={() => openPost(post)}>
              {canAdmin && (
                <div className="post-card__admin" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="icon-btn icon-btn--danger"
                    aria-label="Delete post"
                    title="Delete post"
                    onClick={() => handleDeletePost(post.id)}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                      <path d="M10 11v6M14 11v6" />
                    </svg>
                  </button>
                </div>
              )}
              <div className="post-card__head">
                <div className="post-card__avatar">
                  {post.pfp ? <img src={post.pfp} alt="" /> : post.author.charAt(0).toUpperCase()}
                </div>
                <div className="post-card__meta">
                  <div className="post-card__author">{post.author}</div>
                  <div className="post-card__time">{timeAgo(post.created_at)}</div>
                </div>
              </div>
              <div className="post-card__body" dangerouslySetInnerHTML={{ __html: post.body }} />
              {images.length > 0 && (
                <div className={`post-card__images post-card__images--${Math.min(images.length, 4)}`}>
                  {images.slice(0, 4).map((img, i) => (
                    <div
                      key={i}
                      className="post-card__image"
                      onClick={(e) => { e.stopPropagation(); openLightbox(images, i); }}
                    >
                      <img src={img} alt="" loading="lazy" />
                      {i === 3 && images.length > 4 && (
                        <div className="post-card__image-more">+{images.length - 4}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="post-card__footer" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className={`post-card__stat ${likedPosts.has(post.id) ? "liked" : ""} ${restoringLikes ? "is-loading" : ""}`}
                  onClick={() => togglePostLikeFn(post)}
                  disabled={restoringLikes || likingPostIds.includes(post.id)}
                  aria-pressed={likedPosts.has(post.id)}
                  aria-label={likedPosts.has(post.id) ? "Unlike post" : "Like post"}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                  {post.likes || 0}
                </button>
                <span className="post-card__stat" onClick={() => openPost(post)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  Comments
                </span>
              </div>
            </div>
          );
        })
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          <button disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            ‹
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              className={p === page ? "active" : ""}
              onClick={() => setPage(p)}
            >
              {p}
            </button>
          ))}
          <button disabled={page === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            ›
          </button>
        </div>
      )}

      <Lightbox images={lightboxImages} index={lightboxIndex} onClose={() => setLightboxImages([])} />

      <ConfirmModal
        open={pendingDelete !== null}
        title={pendingDelete?.kind === "comment" ? "Delete comment?" : "Delete post?"}
        message={pendingDelete?.kind === "comment"
          ? "This comment will be permanently removed. This can't be undone."
          : "This post and all of its comments will be permanently removed. This can't be undone."}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
