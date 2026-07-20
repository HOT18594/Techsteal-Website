import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side admin client using the service role key (for privileged ops).
// Only use in API routes / server components — never expose to the browser.
export const supabaseAdmin = process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY)
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

// Look up a user's role by Discord ID. Defaults to "member".
export async function fetchUserRole(discordId: string): Promise<"admin" | "member"> {
  try {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("discord_id", discordId)
      .limit(1);
    if (error) throw error;
    if (data && data.length > 0 && data[0].role === "admin") return "admin";
    return "member";
  } catch (err) {
    console.error("fetchUserRole error:", err);
    return "member";
  }
}

// Check whether a user exists in the user_roles table.
// Returns the row if found, or null if this is a brand-new user.
export async function findUser(discordId: string): Promise<UserRole | null> {
  try {
    const { data, error } = await supabase
      .from("user_roles")
      .select("*")
      .eq("discord_id", discordId)
      .limit(1);
    if (error) throw error;
    if (data && data.length > 0) return data[0] as UserRole;
    return null;
  } catch (err) {
    console.error("findUser error:", err);
    return null;
  }
}

// Create a new user row in user_roles. Called during account setup.
// Role defaults to "member" — admins are granted manually in the dashboard.
export async function createUser(discordId: string, username: string): Promise<UserRole | null> {
  try {
    const { data, error } = await supabase
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
    const { error } = await supabase
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
