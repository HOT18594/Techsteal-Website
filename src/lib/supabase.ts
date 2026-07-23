import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  if (typeof window === "undefined") {
    console.warn(
      "[supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Check .env.local"
    );
  }
}

// Fallback to dummy values during build so `next build` doesn't crash when env is missing.
// At runtime, real env must be present.
export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-anon-key"
);

// Server-side admin client using the service role key (for privileged ops).
// Only use in API routes / server components — never expose to the browser.
export const supabaseAdmin = process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(
      supabaseUrl || "https://placeholder.supabase.co",
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  : null;

export type Post = {
  id: number;
  author: string;
  body: string;
  pfp: string;
  images: string; // JSON array of URLs
  likes: number;
  created_at: string;
};

export type Comment = {
  id: number;
  post_id: number;
  author: string;
  body: string;
  pfp: string;
  images: string;
  likes: number;
  created_at: string;
};

export type BlogPost = {
  id: number;
  title: string;
  body: string;
  author: string;
  images: string | null; // JSON array of URLs (added via migration)
  created_at: string;
};

export type Season = {
  id: number;
  title: string;
  is_current: boolean;
  prism: string;
  sklauncher: string;
  modrinth: string;
  curseforge: string;
};

export type UserRole = {
  id: number;
  discord_id: string;
  role: "admin" | "member";
  username: string;
  created_at: string;
};

export function getServiceRoleClient() {
  if (!supabaseAdmin) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for server-side auth lookups");
  }
  return supabaseAdmin;
}

// Look up a user's role by Discord ID. Defaults to "member".
export async function fetchUserRole(discordId: string): Promise<"admin" | "member"> {
  const { data, error } = await getServiceRoleClient()
    .from("user_roles")
    .select("role")
    .eq("discord_id", discordId)
    .limit(1);
  if (error) throw error;
  if (data && data.length > 0 && data[0].role === "admin") return "admin";
  return "member";
}

// Check whether a user exists in the user_roles table.
// Returns the row if found, or null if this is a brand-new user.
export async function findUser(discordId: string): Promise<UserRole | null> {
  const { data, error } = await getServiceRoleClient()
    .from("user_roles")
    .select("*")
    .eq("discord_id", discordId)
    .limit(1);
  if (error) throw error;
  if (data && data.length > 0) return data[0] as UserRole;
  return null;
}

// Create a new user row in user_roles. Called during account setup.
// Role defaults to "member" — admins are granted manually in the dashboard.
export async function createUser(discordId: string, username: string): Promise<UserRole | null> {
  try {
    const { data, error } = await getServiceRoleClient()
      .from("user_roles")
      .insert({ discord_id: discordId, role: "member", username })
      .select("*")
      .single();
    if (error) throw error;
    return data as UserRole;
  } catch (err) {
    console.error("createUser error:", err);
    return null;
  }
}

// Update a user's display username (used during account setup).
export async function updateUserUsername(discordId: string, username: string): Promise<boolean> {
  try {
    const { error } = await getServiceRoleClient()
      .from("user_roles")
      .update({ username })
      .eq("discord_id", discordId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("updateUserUsername error:", err);
    return false;
  }
}
