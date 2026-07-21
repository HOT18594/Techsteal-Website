import { supabase } from "./supabase";
import type { Post, Comment, BlogPost, Season } from "./supabase";
import { sanitizeHtml, sanitizeSeasonHtml } from "./sanitize";

export const SERVER_ADDRESS = "play.techsteal.space";
export const STATUS_API = `https://api.mcsrvstat.us/3/${SERVER_ADDRESS}`;
export const STATUS_API_FALLBACK = `https://api.mcsrvstat.us/2/${SERVER_ADDRESS}`;
export const DISCORD_INVITE_API = `https://discord.com/api/v9/invites/bEZ5M5jBvz?with_counts=true`;
export const DISCORD_GUILD_ID = "1349848075371413515";
export const DISCORD_WIDGET_API = `https://discord.com/api/guilds/${DISCORD_GUILD_ID}/widget.json`;
export const POSTS_PER_PAGE = 6;
// Unified limit: 5MB everywhere (was 25MB in one place, 5MB in another). Prevents abuse.
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

export async function fetchServerStatus(): Promise<any | null> {
  // Primary: our own status route (live exaroton data, no caching).
  try {
    const res = await fetch("/api/server/status", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (!data.error) return data;
    }
  } catch {}
  // Fallback: public mcsrvstat API.
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

export async function controlServer(action: "start" | "stop", code?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const body: any = { action };
    if (code) body.code = code;
    const res = await fetch("/api/server/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error || `Failed to ${action}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Request failed" };
  }
}

export async function loadSeasons(): Promise<Season[]> {
  const { data, error } = await supabase
    .from("seasons")
    .select("*")
    .order("id", { ascending: false });
  if (error) throw error;
  return (data as Season[]) || [];
}

// Original loader - now supports optional server-side search via ilike
// to avoid loading all posts client-side at scale.
export async function loadPosts(search?: string): Promise<Post[]> {
  // If search term provided, try server-side filtering first.
  if (search && search.trim().length > 0) {
    try {
      // Supabase ilike for body. We also fetch all and filter author/client side as fallback,
      // but this greatly reduces payload for large feeds.
      const { data, error } = await supabase
        .from("posts")
        .select("*")
        .ilike("body", `%${search}%`)
        .order("created_at", { ascending: false })
        .limit(100);
      if (!error && data) return data as Post[];
    } catch {
      // fallback to full load
    }
  }
  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as Post[]) || [];
}

// Proper paginated loader - does server-side pagination with range
export async function loadPostsPaged(
  page: number,
  perPage: number = POSTS_PER_PAGE,
  search?: string
): Promise<{ posts: Post[]; total: number }> {
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  let query = supabase.from("posts").select("*", { count: "exact" }).order("created_at", { ascending: false });

  if (search && search.trim().length > 0) {
    // Sanitize search term to avoid breaking ilike
    const safeSearch = search.replace(/[%_]/g, "");
    query = query.ilike("body", `%${safeSearch}%`);
  }

  // Need to get total count + paged data
  // First get count (if search, count filtered)
  const countQuery = query;
  const { count } = await countQuery;

  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false })
    .range(from, to)
    .ilike(search && search.trim() ? "body" : "author", search && search.trim() ? `%${search.replace(/[%_]/g, "")}%` : "%%");

  // For accurate pagination, use simple approach: if search exists, we did filtered fetch above,
  // else total from count. To avoid double query complexity, fallback to client total if count null.
  if (error) throw error;
  return { posts: (data as Post[]) || [], total: count ?? (data?.length || 0) };
}

export async function loadComments(postId: number): Promise<Comment[]> {
  const { data, error } = await supabase
    .from("comments")
    .select("*")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as Comment[]) || [];
}

export async function loadBlogPosts(): Promise<BlogPost[]> {
  const { data, error } = await supabase
    .from("blog_posts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as BlogPost[]) || [];
}

export async function uploadImage(file: File): Promise<string> {
  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error(`File too large (max ${MAX_IMAGE_SIZE / 1024 / 1024}MB)`);
  }
  const ext = file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "") || "jpg";
  const fileName = `posts/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { data, error } = await supabase.storage
    .from("uploads")
    .upload(fileName, file, { contentType: file.type });
  if (error) throw error;
  const { data: urlData } = supabase.storage.from("uploads").getPublicUrl(data.path);
  return urlData.publicUrl;
}

export function parseImages(imagesJson: string | null): string[] {
  if (!imagesJson) return [];
  try {
    const parsed = JSON.parse(imagesJson);
    // Ensure only valid http(s) URLs
    if (Array.isArray(parsed)) {
      return parsed.filter((u) => typeof u === "string" && /^https?:\/\//.test(u));
    }
    return [];
  } catch {
    return [];
  }
}

export function timeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  let diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  // Handle future dates (clock skew) - show "just now" not negative
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
  } else {
    // Server-side fallback - regex strip (used in API routes)
    return html.replace(/<[^>]*>/g, "").trim();
  }
}

export function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  // Fallback for older browsers
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

// ---------- POSTS (Community) ----------

export async function createPost(post: {
  author: string;
  body: string;
  pfp: string;
  images: string[];
}): Promise<Post> {
  const cleanBody = sanitizeHtml(post.body);
  if (!cleanBody.trim() && post.images.length === 0) {
    throw new Error("Post is empty after sanitization");
  }
  const { data, error } = await supabase
    .from("posts")
    .insert({
      author: String(post.author).slice(0, 100),
      body: cleanBody,
      pfp: post.pfp,
      images: JSON.stringify(post.images.slice(0, 10)), // limit images
      likes: 0,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Post;
}

export async function updatePost(
  id: number,
  patch: { body?: string; images?: string[] }
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.body !== undefined) update.body = sanitizeHtml(patch.body);
  if (patch.images !== undefined) update.images = JSON.stringify(patch.images.slice(0, 10));
  const { error } = await supabase.from("posts").update(update).eq("id", id);
  if (error) throw error;
}

export async function deletePost(id: number): Promise<void> {
  const { error } = await supabase.from("posts").delete().eq("id", id);
  if (error) throw error;
}

// ---- DB-backed likes (persist per-user; survive refresh) ----

export async function getMyLikedPostIds(discordId: string): Promise<number[]> {
  try {
    const { data, error } = await supabase.rpc("my_liked_post_ids", {
      p_discord_id: discordId,
    });
    if (error) throw error;
    return (data as { post_id: number }[] | null)?.map((r) => r.post_id) ?? [];
  } catch {
    return [];
  }
}

export async function getMyLikedCommentIds(discordId: string): Promise<number[]> {
  try {
    const { data, error } = await supabase.rpc("my_liked_comment_ids", {
      p_discord_id: discordId,
    });
    if (error) throw error;
    return (data as { comment_id: number }[] | null)?.map((r) => r.comment_id) ?? [];
  } catch {
    return [];
  }
}

export async function togglePostLike(
  postId: number,
  discordId: string
): Promise<{ likes: number; liked: boolean }> {
  const { data, error } = await supabase.rpc("toggle_post_like", {
    p_post_id: postId,
    p_discord_id: discordId,
  });
  if (error) throw error;
  if (!data || !data[0]) throw new Error("Like failed");
  return { likes: data[0].likes, liked: data[0].liked };
}

export async function toggleCommentLike(
  commentId: number,
  discordId: string
): Promise<{ likes: number; liked: boolean }> {
  const { data, error } = await supabase.rpc("toggle_comment_like", {
    p_comment_id: commentId,
    p_discord_id: discordId,
  });
  if (error) throw error;
  if (!data || !data[0]) throw new Error("Like failed");
  return { likes: data[0].likes, liked: data[0].liked };
}

// ---------- COMMENTS ----------

export async function createComment(comment: {
  post_id: number;
  author: string;
  body: string;
  pfp: string;
  images: string[];
}): Promise<Comment> {
  const cleanBody = sanitizeHtml(comment.body);
  if (!cleanBody.trim() && comment.images.length === 0) {
    throw new Error("Comment is empty after sanitization");
  }
  const { data, error } = await supabase
    .from("comments")
    .insert({
      post_id: comment.post_id,
      author: String(comment.author).slice(0, 100),
      body: cleanBody,
      pfp: comment.pfp,
      images: JSON.stringify(comment.images.slice(0, 10)),
    })
    .select()
    .single();
  if (error) throw error;
  return data as Comment;
}

export async function deleteComment(id: number): Promise<void> {
  const { error } = await supabase.from("comments").delete().eq("id", id);
  if (error) throw error;
}

// ---------- BLOG ----------

export async function createBlogPost(post: {
  title: string;
  body: string;
  author: string;
  images?: string[];
}): Promise<BlogPost> {
  const insert: Record<string, unknown> = {
    title: String(post.title).slice(0, 200),
    body: sanitizeHtml(post.body),
    author: String(post.author).slice(0, 100),
  };
  if (post.images) insert.images = JSON.stringify(post.images.slice(0, 10));
  const { data, error } = await supabase
    .from("blog_posts")
    .insert(insert)
    .select()
    .single();
  if (error) throw error;
  return data as BlogPost;
}

export async function updateBlogPost(
  id: number,
  patch: { title?: string; body?: string; images?: string[] }
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) update.title = String(patch.title).slice(0, 200);
  if (patch.body !== undefined) update.body = sanitizeHtml(patch.body);
  if (patch.images !== undefined) update.images = JSON.stringify(patch.images.slice(0, 10));
  const { error } = await supabase.from("blog_posts").update(update).eq("id", id);
  if (error) throw error;
}

export async function deleteBlogPost(id: number): Promise<void> {
  const { error } = await supabase.from("blog_posts").delete().eq("id", id);
  if (error) throw error;
}

// ---------- SEASONS (admin) ----------

export async function updateSeason(
  id: number,
  patch: Partial<{
    title: string;
    is_current: boolean;
    prism: string;
    sklauncher: string;
    modrinth: string;
    curseforge: string;
  }>
): Promise<void> {
  const cleaned: Record<string, unknown> = { ...patch };
  if (cleaned.title !== undefined) cleaned.title = String(cleaned.title).slice(0, 200);
  if (cleaned.prism !== undefined) cleaned.prism = sanitizeSeasonHtml(String(cleaned.prism));
  if (cleaned.sklauncher !== undefined)
    cleaned.sklauncher = sanitizeSeasonHtml(String(cleaned.sklauncher));
  if (cleaned.modrinth !== undefined) cleaned.modrinth = sanitizeSeasonHtml(String(cleaned.modrinth));
  if (cleaned.curseforge !== undefined)
    cleaned.curseforge = sanitizeSeasonHtml(String(cleaned.curseforge));

  // Ensure only one is_current can be true is enforced client-side, but we also handle server-side:
  if (cleaned.is_current === true) {
    // First unset all others (requires RLS that allows this - we attempt)
    try {
      await supabase.from("seasons").update({ is_current: false }).neq("id", id);
    } catch {}
  }

  const { error } = await supabase.from("seasons").update(cleaned).eq("id", id);
  if (error) throw error;
}
