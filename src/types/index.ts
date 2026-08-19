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
  content?: string;
  author: string;
  avatar: string;
  color: string;
  category: string;
  tagClass: string;
  replies: number;
  last: string;
  pinned: boolean;
  /** Discord-style account id of the author (for avatar resolution). */
  authorId?: string;
  /** Minecraft skin head URL when the author has one set. */
  avatarUrl?: string | null;
}

export interface ForumReply {
  id?: number;
  threadId: number;
  content: string;
  author: string;
  avatar: string;
  color: string;
  createdAt?: string | null;
  /** Discord-style account id of the author (for avatar resolution). */
  authorId?: string;
  /** Minecraft skin head URL when the author has one set. */
  avatarUrl?: string | null;
  /** Number of likes. */
  likes?: number;
  /** Account ids that liked this reply. */
  likedBy?: string[];
  /** Admin-pinned comment — shows first with a pin badge. */
  pinned?: boolean;
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

/** A user account (created by Discord OAuth, extended by onboarding). */
export interface Account {
  id: string;
  username: string;
  email?: string;
  role: UserRole;
  permissions: Permission[];
  createdAt?: string;
  /** Minecraft username set during onboarding / profile settings. */
  minecraftUsername?: string;
  /** True once the user verified membership in the Discord server. */
  discordVerified?: boolean;
  /** True once the user finished onboarding. */
  onboarded?: boolean;
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
