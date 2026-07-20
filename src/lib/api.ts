import { supabase } from "./supabase";
import type { Post, Comment, BlogPost, Season } from "./supabase";

export const SERVER_ADDRESS = "play.techsteal.space";
export const STATUS_API = `https://api.mcsrvstat.us/3/${SERVER_ADDRESS}`;
export const STATUS_API_FALLBACK = `https://api.mcsrvstat.us/2/${SERVER_ADDRESS}`;
export const DISCORD_INVITE_API = `https://discord.com/api/v9/invites/bEZ5M5jBvz?with_counts=true`;
export const DISCORD_GUILD_ID = "1349848075371413515";
export const DISCORD_WIDGET_API = `https://discord.com/api/guilds/${DISCORD_GUILD_ID}/widget.json`;
export const POSTS_PER_PAGE = 6;
export const MAX_IMAGE_SIZE = 25 * 1024 * 1024; // 25MB

export async function fetchServerStatus(): Promise<any | null> {  // Primary: our own status route (live exaroton data, no caching).
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

export async function loadSeasons(): Promise<Season[]> {
  const { data, error } = await supabase
    .from("seasons")
    .select("*")
    .order("id", { ascending: false });
  if (error) throw error;
  return (data as Season[]) || [];
}

export async function loadPosts(): Promise<Post[]> {
  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as Post[]) || [];
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
  const ext = file.name.split(".").pop() || "jpg";
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
    return JSON.parse(imagesJson);
  } catch {
    return [];
  }
}

export function timeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

export function stripHtml(html: string): string {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}

// ---------- POSTS (Community) ----------

export async function createPost(post: {
  author: string;
  body: string;
  pfp: string;
  images: string[];
}): Promise<Post> {
  const { data, error } = await supabase
    .from("posts")
    .insert({
      author: post.author,
      body: post.body,
      pfp: post.pfp,
      images: JSON.stringify(post.images),
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
  if (patch.body !== undefined) update.body = patch.body;
  if (patch.images !== undefined) update.images = JSON.stringify(patch.images);
  const { error } = await supabase.from("posts").update(update).eq("id", id);
  if (error) throw error;
}

export async function deletePost(id: number): Promise<void> {
  const { error } = await supabase.from("posts").delete().eq("id", id);
  if (error) throw error;
}

// ---- DB-backed likes (persist per-user; survive refresh) ----

// Fetch the set of post IDs the current user has liked (so likes survive a
// refresh and stay consistent across devices). Returns an empty array if the
// likes migration has not been run yet.
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

// Fetch the set of comment IDs the current user has liked.
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

// Toggle the current user's like on a post. Returns the authoritative new
// count + whether the user now likes it. Idempotent — clicking again unlike.
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

// Toggle the current user's like on a comment.
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
  const { data, error } = await supabase
    .from("comments")
    .insert({
      post_id: comment.post_id,
      author: comment.author,
      body: comment.body,
      pfp: comment.pfp,
      images: JSON.stringify(comment.images),
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
}): Promise<BlogPost> {
  const { data, error } = await supabase
    .from("blog_posts")
    .insert({ title: post.title, body: post.body, author: post.author })
    .select()
    .single();
  if (error) throw error;
  return data as BlogPost;
}

export async function updateBlogPost(
  id: number,
  patch: { title?: string; body?: string }
): Promise<void> {
  const { error } = await supabase.from("blog_posts").update(patch).eq("id", id);
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
  const { error } = await supabase.from("seasons").update(patch).eq("id", id);
  if (error) throw error;
}
