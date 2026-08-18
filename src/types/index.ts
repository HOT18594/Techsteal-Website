// Shared domain types used across API routes, components, and seed data.

export interface Member {
  id?: number;
  name: string;
  role: string;
  icon: string;
  avatar: string;
  color: string;
  status: "online" | "offline";
  joined: string;
  playtime: string;
}

export interface ForumThread {
  id?: number;
  title: string;
  author: string;
  avatar: string;
  color: string;
  category: string;
  tagClass: string;
  replies: number;
  last: string;
  pinned: boolean;
}

export interface GalleryItem {
  id?: number;
  title: string;
  builder: string;
  category: string;
  likes: number;
  image: string;
  height: "tall" | "medium" | "short";
}

export interface TimelineEvent {
  id?: number;
  date: string;
  title: string;
  era: string;
  major: boolean;
  description?: string;
}

export interface RuleSection {
  id?: number;
  icon: string;
  title: string;
  rules: string[];
}

// ------------------------------------------------------------------
// Auth / accounts
// ------------------------------------------------------------------

/** Roles a signed-in user can hold. */
export type UserRole = "admin" | "member";

/** Fine-grained capabilities that admins can grant per-member. */
export type Permission = "server_control" | "ai_access";

/** A user account (demo store until Discord OAuth is wired up). */
export interface Account {
  id: string;
  username: string;
  email?: string;
  role: UserRole;
  permissions: Permission[];
  /** Demo accounts are seeded; admins can add more later. */
  createdAt?: string;
}

/** The authenticated user, as carried in the session cookie / JWT. */
export interface SessionUser {
  id: string;
  username: string;
  role: UserRole;
  permissions: Permission[];
}

export interface ServerStatus {
  online: boolean;
  players?: number;
  max?: number;
  playerList?: string[];
  version?: string;
  hostname?: string;
  source?: "live" | "fallback";
}
