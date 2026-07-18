"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  loadPosts,
  loadComments,
  createPost,
  updatePost,
  deletePost,
  likePost,
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
import RichTextEditor from "@/components/RichTextEditor";
import Lightbox from "@/components/Lightbox";

export default function Community() {
  const { user } = useAuth();
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

  // Liked posts (client-side tracking)
  const [liked, setLiked] = useState<number[]>([]);
  const [likedHydrated, setLikedHydrated] = useState(false);
  const [likingPostIds, setLikingPostIds] = useState<number[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const commentFileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    loadData();
  }, [page, search]);

  useEffect(() => {
    setLikedHydrated(false);
    if (!user?.discordId) {
      setLiked([]);
      return;
    }
    try {
      const stored = JSON.parse(localStorage.getItem(`techsteal-liked-${user.discordId}`) || "[]");
      setLiked(Array.isArray(stored) ? stored.filter(Number.isInteger) : []);
    } catch {
      setLiked([]);
    }
    setLikedHydrated(true);
  }, [user?.discordId]);

  useEffect(() => {
    if (likedHydrated && user?.discordId) {
      localStorage.setItem(`techsteal-liked-${user.discordId}`, JSON.stringify(liked));
    }
  }, [liked, likedHydrated, user?.discordId]);

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
    }
    setLoading(false);
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

  const toggleLike = async (post: Post) => {
    if (likingPostIds.includes(post.id)) return;
    const isLiked = liked.includes(post.id);
    const delta = isLiked ? -1 : 1;
    const optimisticLikes = Math.max(0, (post.likes || 0) + delta);
    const optimisticPost = { ...post, likes: optimisticLikes };

    // Optimistic update both list cards and the currently opened detail post.
    setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, likes: optimisticLikes } : p)));
    setSelectedPost((prev) => (prev?.id === post.id ? optimisticPost : prev));
    setLiked((prev) => (isLiked ? prev.filter((id) => id !== post.id) : [...prev, post.id]));
    setLikingPostIds((prev) => [...prev, post.id]);

    try {
      const updated = await likePost(post.id, delta);
      setPosts((prev) => prev.map((p) => (p.id === post.id ? updated : p)));
      setSelectedPost((prev) => (prev?.id === post.id ? updated : prev));
    } catch {
      // Revert every UI copy if the backend rejects the update.
      setPosts((prev) => prev.map((p) => (p.id === post.id ? post : p)));
      setSelectedPost((prev) => (prev?.id === post.id ? post : prev));
      setLiked((prev) => (isLiked ? [...prev, post.id] : prev.filter((id) => id !== post.id)));
      alert("Could not update like. Please try again.");
    } finally {
      setLikingPostIds((prev) => prev.filter((id) => id !== post.id));
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
    if (!confirm("Delete this post?")) return;
    try {
      await deletePost(id);
      setSelectedPost(null);
      loadData();
    } catch {
      alert("Failed to delete post.");
    }
  };

  const handleDeleteComment = async (id: number) => {
    if (!confirm("Delete this comment?")) return;
    try {
      await deleteComment(id);
      if (selectedPost) {
        const c = await loadComments(selectedPost.id);
        setComments(c);
      }
    } catch {
      alert("Failed to delete comment.");
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
          {isAdmin && (
            <div className="post-detail__admin">
              <button className="admin-btn danger" onClick={() => handleDeletePost(selectedPost.id)}>
                Delete
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
            className={`post-detail__stat ${liked.includes(selectedPost.id) ? "liked" : ""}`}
            onClick={() => toggleLike(selectedPost)}
            disabled={likingPostIds.includes(selectedPost.id)}
            aria-pressed={liked.includes(selectedPost.id)}
            aria-label={liked.includes(selectedPost.id) ? "Unlike post" : "Like post"}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            {selectedPost.likes || 0} Likes
          </button>
          <span className="post-detail__stat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {comments.length} Comments
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
                    {isAdmin && (
                      <div className="comment__admin" style={{ marginLeft: "auto" }}>
                        <button className="admin-btn danger" onClick={() => handleDeleteComment(c.id)}>
                          Delete
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
                </div>
              );
            })
          )}
        </div>

        <Lightbox images={lightboxImages} index={lightboxIndex} onClose={() => setLightboxImages([])} />
      </div>
    );
  }

  // ---------- LIST VIEW ----------
  return (
    <div>
      <div className="page-header">
        <h1 className="page-header__title">Community</h1>
        <p className="page-header__sub">Share builds, ask questions, and show off your creations.</p>
      </div>

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
          {isAdmin && <span className="composer-header__badge">Admin</span>}
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
            What's on your mind?
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
              {isAdmin && (
                <div className="post-card__admin" onClick={(e) => e.stopPropagation()}>
                  <button className="admin-btn danger" onClick={() => handleDeletePost(post.id)}>
                    Delete
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
                <span
                  className={`post-card__stat ${liked.includes(post.id) ? "liked" : ""}`}
                  onClick={() => toggleLike(post)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                  {post.likes || 0}
                </span>
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
    </div>
  );
}
