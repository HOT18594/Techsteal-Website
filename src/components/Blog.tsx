"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  loadBlogPosts,
  createBlogPost,
  updateBlogPost,
  deleteBlogPost,
  uploadImage,
  parseImages,
  timeAgo,
  stripHtml,
  MAX_IMAGE_SIZE,
} from "@/lib/api";
import type { BlogPost } from "@/lib/supabase";
import RichTextEditor from "@/components/RichTextEditor";
import ConfirmModal from "@/components/ConfirmModal";
import Lightbox from "@/components/Lightbox";
import { sanitizeHtml } from "@/lib/sanitize";
import { useToast } from "@/components/Toast";

export default function Blog() {
  const { user, canAdmin } = useAuth();
  const { showToast } = useToast();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  // Editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  // Viewer + lightbox
  const [viewing, setViewing] = useState<BlogPost | null>(null);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const isAdmin = canAdmin;
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await loadBlogPosts();
      setPosts(data);
    } catch {
      setPosts([]);
    }
    setLoading(false);
  };

  const openEditor = (post?: BlogPost) => {
    if (post) {
      setEditingId(post.id);
      setTitle(post.title);
      setBody(post.body);
      setImages(parseImages(post.images));
    } else {
      setEditingId(null);
      setTitle("");
      setBody("");
      setImages([]);
    }
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingId(null);
    setTitle("");
    setBody("");
    setImages([]);
  };

  const handleImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        if (file.size > MAX_IMAGE_SIZE) {
          showToast(`"${file.name}" is larger than ${MAX_IMAGE_SIZE / 1024 / 1024}MB and was skipped.`, "error");
          continue;
        }
        try {
          const url = await uploadImage(file);
          urls.push(url);
        } catch (e: any) {
          showToast(e?.message || "Failed to upload image", "error");
        }
      }
      if (urls.length) setImages((prev) => [...prev, ...urls]);
    } catch {
      showToast("Failed to upload image.", "error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const savePost = async () => {
      if (!title.trim()) {
        showToast("Please enter a title.", "error");
        return;
      }
      const text = stripHtml(body).trim();
      if (!text) {
        showToast("Please enter some content.", "error");
        return;
      }
      try {
        if (editingId) {
          await updateBlogPost(editingId, { title, body, images });
        } else {
          await createBlogPost({ title, body, author: user?.username || "Anonymous", images, discordId: user?.discordId || "" });
        }
        showToast(editingId ? "Post updated!" : "Post created!", "success");
        closeEditor();
        loadData();
      } catch {
        showToast("Failed to save blog post.", "error");
      }
    };

  const handleDelete = (id: number) => {
    setPendingDeleteId(id);
  };

  const confirmDelete = async () => {
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    if (id == null) return;
    try {
      await deleteBlogPost(id);
      if (viewing?.id === id) setViewing(null);
      showToast("Post deleted", "success");
      loadData();
    } catch {
      showToast("Failed to delete blog post.", "error");
    }
  };

  const openLightbox = (imgs: string[], idx: number) => {
    setLightboxImages(imgs);
    setLightboxIndex(idx);
  };

  // ---------- VIEWER ----------
  if (viewing) {
    const viewerImages = parseImages(viewing.images);
    return (
      <div>
        <div
          className="post-detail__back"
          onClick={() => setViewing(null)}
          style={{ marginBottom: "20px", cursor: "pointer", color: "var(--text-dim)", fontWeight: 600 }}
        >
          ← Back to Blog
        </div>
        <div className="card">
          {viewerImages.length > 0 && (
            <div className="viewer__banner" onClick={() => openLightbox(viewerImages, 0)} style={{ cursor: "pointer" }}>
              <img src={viewerImages[0]} alt="" />
            </div>
          )}
          <div className="viewer__title">{viewing.title}</div>
          <div className="viewer__meta">By {viewing.author} • {timeAgo(viewing.created_at)}</div>
          <div className="viewer__body" dangerouslySetInnerHTML={{ __html: sanitizeHtml(viewing.body) }} />
          {viewerImages.length > 1 && (
            <div className="viewer__gallery">
              {viewerImages.slice(1).map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt=""
                  className="viewer__gallery-img"
                  loading="lazy"
                  style={{ cursor: "pointer" }}
                  onClick={() => openLightbox(viewerImages, i + 1)}
                />
              ))}
            </div>
          )}
        </div>
        <Lightbox images={lightboxImages} index={lightboxIndex} onClose={() => setLightboxImages([])} />
      </div>
    );
  }

  // ---------- LIST ----------
  return (
    <div>
      {isAdmin && (
        <div style={{ marginBottom: "20px" }}>
          <button className="btn btn--start" onClick={() => openEditor()}>
            + New Post
          </button>
        </div>
      )}

      {loading ? (
        <div className="status-spinner-wrapper">
          <div className="status-spinner" />
          <span>Loading posts...</span>
        </div>
      ) : posts.length === 0 ? (
        <div className="empty-state">No blog posts yet.</div>
      ) : (
        <div className="blog-grid">
          {posts.map((post) => {
            const cardImages = parseImages(post.images);
            return (
              <div key={post.id} className="blog-card" onClick={() => setViewing(post)}>
                <div className="blog-card__banner">
                  {cardImages.length > 0 ? (
                    <img className="blog-card__banner-img" src={cardImages[0]} alt="" loading="lazy" />
                  ) : null}
                </div>
                <div className="blog-card__body">
                  <div className="blog-card__tag">Blog</div>
                  <div className="blog-card__title">{post.title}</div>
                  <div className="blog-card__excerpt">
                    {stripHtml(post.body).slice(0, 120)}
                    {stripHtml(post.body).length > 120 ? "..." : ""}
                  </div>
                  <div className="blog-card__meta">By {post.author} • {timeAgo(post.created_at)}</div>
                </div>
                {isAdmin && (
                  <div className="card-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Edit post"
                      title="Edit post"
                      onClick={() => openEditor(post)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="icon-btn icon-btn--danger"
                      aria-label="Delete post"
                      title="Delete post"
                      onClick={() => handleDelete(post.id)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                        <path d="M10 11v6M14 11v6" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editorOpen && (
        <div className="modal-overlay open" onClick={closeEditor}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "min(100%, 680px)" }}>
            <h3 className="modal-card__title">{editingId ? "Edit Post" : "New Post"}</h3>
            <div className="settings-form">
              <label className="settings-label">Title</label>
              <input
                className="blog-title-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Post title..."
                maxLength={200}
              />
              <label className="settings-label">Content</label>
              <RichTextEditor value={body} onChange={setBody} placeholder="Write your post..." />

              <label className="settings-label">Images (max {MAX_IMAGE_SIZE / 1024 / 1024}MB each)</label>
              <div className="add-media-row">
                <button type="button" className="add-media-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  {uploading ? "Uploading…" : "Add Image"}
                </button>
                <span className="add-media-hint">Uploaded to Supabase Storage.</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => handleImageUpload(e.target.files)}
                />
              </div>
              {images.length > 0 && (
                <div className="image-previews">
                  {images.map((img, i) => (
                    <div key={i} className="image-thumb">
                      <img src={img} alt="" />
                      <button type="button" className="image-thumb__remove" onClick={() => removeImage(i)} aria-label="Remove image">
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="modal-actions">
                <button className="btn btn--start" onClick={savePost} disabled={uploading}>
                  {uploading ? "Uploading…" : "Save"}
                </button>
                <button className="btn btn--ghost" onClick={closeEditor} disabled={uploading}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={pendingDeleteId !== null}
        title="Delete blog post?"
        message="This blog post will be permanently removed. This can't be undone."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}
