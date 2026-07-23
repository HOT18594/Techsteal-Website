import { supabase } from "./supabase";
import type { Post, Comment, BlogPost, Season } from "./supabase";
import { sanitizeHtml, sanitizeSeasonHtml } from "./sanitize";
import { DISCORD_GUILD_ID } from "./discord";

export const SERVER_ADDRESS = "play.techsteal.space";
export const STATUS_API = `https://api.mcsrvstat.us/3/${SERVER_ADDRESS}`;
export const STATUS_API_FALLBACK = `https://api.mcsrvstat.us/2/${SERVER_ADDRESS}`;
export const DISCORD_INVITE_API = `https://discord.com/api/v9/invites/bEZ5M5jBvz?with_counts=true`;
export { DISCORD_GUILD_ID };
export const DISCORD_WIDGET_API = `https://discord.com/api/guilds/${DISCORD_GUILD_ID}/widget.json`;
export const POSTS_PER_PAGE = 6;
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as T;
}

export async function fetchServerStatus(): Promise<any | null> {
  try {
    const res = await fetch("/api/server/status", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (!data.error) return data;
    }
  } catch {}
  try {
    const res = await fetch(STATUS_API);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    try {
      const res2 = await fetch(STATUS_API_FALLBACK);
      if (!res2.ok) throw new Error(`HTTP ${res2.status}`);
      return await res2.json();
    } catch {
      return null;
    }
  }
}

export async function controlServer(action: "start" | "stop"): Promise<{ ok: boolean; error?: string }> {
  try {
    await apiJson<{ ok: true }>("/api/server/control", {
      method: "POST",
      body: JSON.stringify({ action }),
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Request failed" };
  }
}

export async function loadSeasons(): Promise<Season[]> {
  const { data, error } = await supabase.from("seasons").select("*").order("id", { ascending: false });
  if (error) throw error;
  return (data as Season[]) || [];
}

function safeSearchTerm(search: string) {
  return search.trim().replace(/[%_]/g, "");
}

export async function loadPosts(search?: string): Promise<Post[]> {
  const { posts } = await loadPostsPaged(1, 500, search);
  return posts;
}

export async function loadPostsPaged(
  page: number,
  perPage: number = POSTS_PER_PAGE,
  search?: string
): Promise<{ posts: Post[]; total: number }> {
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  let query = supabase.from("posts").select("*", { count: "exact" }).order("created_at", { ascending: false });

  if (search && search.trim()) {
    const q = safeSearchTerm(search);
    query = query.or(`body.ilike.%${q}%,author.ilike.%${q}%`);
  }

  const { data, error, count } = await query.range(from, to);
  if (error) throw error;
  return { posts: (data as Post[]) || [], total: count ?? 0 };
}

export async function loadComments(postId: number): Promise<Comment[]> {
  const { data, error } = await supabase.from("comments").select("*").eq("post_id", postId).order("created_at", { ascending: true });
  if (error) throw error;
  return (data as Comment[]) || [];
}

export async function loadBlogPosts(): Promise<BlogPost[]> {
  const { data, error } = await supabase.from("blog_posts").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data as BlogPost[]) || [];
}

export async function uploadImage(file: File): Promise<string> {
  if (file.size > MAX_IMAGE_SIZE) throw new Error(`File too large (max ${MAX_IMAGE_SIZE / 1024 / 1024}MB)`);
  const form = new FormData();
  form.append("file", file);
  const data = await apiJson<{ url: string }>("/api/uploads", { method: "POST", body: form });
  return data.url;
}

export function parseImages(imagesJson: string | null): string[] {
  if (!imagesJson) return [];
  try {
    const parsed = JSON.parse(imagesJson);
    if (Array.isArray(parsed)) return parsed.filter((u) => typeof u === "string" && /^https?:\/\//.test(u));
    return [];
  } catch {
    return [];
  }
}

export function timeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 0) return "just now";
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

export function stripHtml(html: string): string {
  if (typeof document !== "undefined") {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
  }
  return html.replace(/<[^>]*>/g, "").trim();
}

export function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      resolve();
    } catch (e) {
      reject(e);
    }
  });
}

export async function createPost(post: { body: string; images: string[]; author?: string; pfp?: string; discordId?: string }): Promise<Post> {
  const cleanBody = sanitizeHtml(post.body);
  if (!cleanBody.trim() && post.images.length === 0) throw new Error("Post is empty after sanitization");
  const data = await apiJson<{ post: Post }>("/api/community/posts", {
    method: "POST",
    body: JSON.stringify({ body: cleanBody, images: post.images }),
  });
  return data.post;
}

export async function updatePost(id: number, patch: { body?: string; images?: string[] }): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (patch.body !== undefined) payload.body = sanitizeHtml(patch.body);
  if (patch.images !== undefined) payload.images = patch.images;
  await apiJson<{ ok: true }>(`/api/community/posts/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function deletePost(id: number): Promise<void> {
  await apiJson<{ ok: true }>(`/api/community/posts/${id}`, { method: "DELETE" });
}

export async function getMyLikedPostIds(_discordId?: string): Promise<number[]> {
  try {
    const data = await apiJson<{ posts: number[]; comments: number[] }>("/api/community/likes", { method: "GET" });
    return data.posts;
  } catch {
    return [];
  }
}

export async function getMyLikedCommentIds(_discordId?: string): Promise<number[]> {
  try {
    const data = await apiJson<{ posts: number[]; comments: number[] }>("/api/community/likes", { method: "GET" });
    return data.comments;
  } catch {
    return [];
  }
}

export async function togglePostLike(postId: number, _discordId?: string): Promise<{ likes: number; liked: boolean }> {
  return apiJson<{ likes: number; liked: boolean }>("/api/community/likes", {
    method: "POST",
    body: JSON.stringify({ kind: "post", id: postId }),
  });
}

export async function toggleCommentLike(commentId: number, _discordId?: string): Promise<{ likes: number; liked: boolean }> {
  return apiJson<{ likes: number; liked: boolean }>("/api/community/likes", {
    method: "POST",
    body: JSON.stringify({ kind: "comment", id: commentId }),
  });
}

export async function createComment(comment: { post_id: number; body: string; images: string[]; author?: string; pfp?: string; discordId?: string }): Promise<Comment> {
  const cleanBody = sanitizeHtml(comment.body);
  if (!cleanBody.trim() && comment.images.length === 0) throw new Error("Comment is empty after sanitization");
  const data = await apiJson<{ comment: Comment }>("/api/community/comments", {
    method: "POST",
    body: JSON.stringify({ post_id: comment.post_id, body: cleanBody, images: comment.images }),
  });
  return data.comment;
}

export async function deleteComment(id: number): Promise<void> {
  await apiJson<{ ok: true }>(`/api/community/comments/${id}`, { method: "DELETE" });
}

export async function createBlogPost(post: { title: string; body: string; author?: string; images?: string[]; discordId?: string }): Promise<BlogPost> {
  const data = await apiJson<{ post: BlogPost }>("/api/blog/posts", {
    method: "POST",
    body: JSON.stringify({ title: post.title, body: sanitizeHtml(post.body), images: post.images || [] }),
  });
  return data.post;
}

export async function updateBlogPost(id: number, patch: { title?: string; body?: string; images?: string[] }): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (patch.title !== undefined) payload.title = patch.title;
  if (patch.body !== undefined) payload.body = sanitizeHtml(patch.body);
  if (patch.images !== undefined) payload.images = patch.images;
  await apiJson<{ ok: true }>(`/api/blog/posts/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function deleteBlogPost(id: number): Promise<void> {
  await apiJson<{ ok: true }>(`/api/blog/posts/${id}`, { method: "DELETE" });
}

export async function updateSeason(
  id: number,
  patch: Partial<{ title: string; is_current: boolean; prism: string; sklauncher: string; modrinth: string; curseforge: string }>
): Promise<void> {
  const cleaned: Record<string, unknown> = { ...patch };
  if (cleaned.title !== undefined) cleaned.title = String(cleaned.title).slice(0, 200);
  for (const key of ["prism", "sklauncher", "modrinth", "curseforge"] as const) {
    if (cleaned[key] !== undefined) cleaned[key] = sanitizeSeasonHtml(String(cleaned[key]));
  }
  await apiJson<{ ok: true }>(`/api/seasons/${id}`, { method: "PATCH", body: JSON.stringify(cleaned) });
}
