"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  loadBlogPosts,
  createBlogPost,
  updateBlogPost,
  deleteBlogPost,
  timeAgo,
  stripHtml,
} from "@/lib/api";
import type { BlogPost } from "@/lib/supabase";
import RichTextEditor from "@/components/RichTextEditor";
import ConfirmModal from "@/components/ConfirmModal";

export default function Blog() {
  const { user, canAdmin } = useAuth();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  // Editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  // In-app delete confirmation (replaces native confirm())
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  // Viewer state
  const [viewing, setViewing] = useState<BlogPost | null>(null);

  const isAdmin = canAdmin;

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
    } else {
      setEditingId(null);
      setTitle("");
      setBody("");
    }
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingId(null);
    setTitle("");
    setBody("");
  };

  const savePost = async () => {
    if (!title.trim()) {
      alert("Please enter a title.");
      return;
    }
    try {
      if (editingId) {
        await updateBlogPost(editingId, { title, body });
      } else {
        await createBlogPost({ title, body, author: user?.username || "Anonymous" });
      }
      closeEditor();
      loadData();
    } catch {
      alert("Failed to save blog post.");
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
      loadData();
    } catch {
      alert("Failed to delete blog post.");
    }
  };

  // ---------- VIEWER ----------
  if (viewing) {
    return (
      <div>
        <div className="post-detail__back" onClick={() => setViewing(null)} style={{ marginBottom: "20px", cursor: "pointer", color: "var(--text-dim)", fontWeight: 600 }}>
          ← Back to Blog
        </div>
        <div className="card">
          <div className="viewer__title">{viewing.title}</div>
          <div className="viewer__meta">By {viewing.author} • {timeAgo(viewing.created_at)}</div>
          <div className="viewer__body" dangerouslySetInnerHTML={{ __html: viewing.body }} />
        </div>
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
          {posts.map((post) => (
            <div key={post.id} className="blog-card" onClick={() => setViewing(post)}>
              <div className="blog-card__banner">📰</div>
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
          ))}
        </div>
      )}

      {/* Editor Modal */}
      {editorOpen && (
        <div className="modal-overlay open" onClick={closeEditor}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "min(100%, 640px)" }}>
            <h3 className="modal-card__title">{editingId ? "Edit Post" : "New Post"}</h3>
            <div className="settings-form">
              <label className="settings-label">Title</label>
              <input
                className="blog-title-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Post title..."
              />
              <label className="settings-label">Content</label>
              <RichTextEditor value={body} onChange={setBody} placeholder="Write your post..." />
              <div className="modal-actions">
                <button className="btn btn--start" onClick={savePost}>Save</button>
                <button className="btn btn--ghost" onClick={closeEditor}>Cancel</button>
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
