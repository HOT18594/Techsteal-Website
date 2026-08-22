// Shared domain types used across API routes, components, and seed data.

export interface Member {
  id?: number;
  name: string;
  role: string;
  icon: string;
  avatar: string;
  /** Discord PFP (preferred) or Minecraft skin head, or null for a letter tile. */
  avatarUrl?: string | null;
  color: string;
  status: "online" | "offline";
  joined: string;
  /** Whether the member verified membership in the official Discord server. */
  verified?: boolean;
  /** In-game Minecraft username, if the member linked one. */
  minecraftUsername?: string | null;
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
  /** View counter (thread detail page loads). */
  views?: number;
  /** Locked threads accept no new replies (admin toggle). */
  locked?: boolean;
  /** Thread-level likes. */
  likes?: number;
  likedBy?: string[];
  /** Set when the post was edited; shown as an "edited" marker. */
  editedAt?: string | null;
  createdAt?: string | null;
  /** Present on list rows when the thread carries a poll. */
  hasPoll?: boolean;
}

/** Poll attached to a thread (admins create them, with an end date). */
export interface ForumPoll {
  id: number;
  threadId: number;
  question: string;
  options: Array<{ id: string; text: string }>;
  endsAt: string;
  createdAt?: string | null;
  /** Vote counts per option id — only included when results are visible. */
  counts?: Record<string, number>;
  /** Total votes cast. */
  totalVotes?: number;
  /** The signed-in user's chosen option id, if any. */
  myVote?: string | null;
  /** Derived: the end date has passed. */
  ended?: boolean;
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
  /** Set when the reply was edited; shown as an "edited" marker. */
  editedAt?: string | null;
}

export interface GalleryItem {
  id?: number;
  title: string;
  builder: string;
  category: string;
  likes: number;
  image: string;
  height: "tall" | "medium" | "short";
  /** Discord-style account id of the poster. */
  authorId?: string;
  /** Poster's resolved avatar (Discord PFP or MC head) for detail views. */
  builderAvatar?: string | null;
  /** Markdown description shown in the lightbox. */
  description?: string;
  /** All images of the post (cover first). `image` mirrors the cover. */
  images?: string[];
  /** Account ids that liked this post. */
  likedBy?: string[];
  /** Admin-pinned posts float to the top with a badge. */
  featured?: boolean;
  views?: number;
  createdAt?: string | null;
  /** Comment count (list responses). */
  commentCount?: number;
}

export interface GalleryComment {
  id?: number;
  itemId: number;
  content: string;
  author: string;
  authorId?: string;
  avatarUrl?: string | null;
  color?: string;
  createdAt?: string | null;
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
export type Permission = "server_control" | "ai_access" | "gallery_post";

/** A user account (created by Discord OAuth, extended by onboarding). */
export interface Account {
  id: string;
  username: string;
  email?: string;
  /** Discord CDN profile picture URL, if the user has one. */
  avatarUrl?: string;
  role: UserRole;
  permissions: Permission[];
  createdAt?: string;
  /** Minecraft username set during onboarding / profile settings. */
  minecraftUsername?: string;
  /** True once the user verified membership in the Discord server. */
  discordVerified?: boolean;
  /** True once the user finished onboarding. */
  onboarded?: boolean;
  /** True when an admin removed the user — login is refused while set. */
  banned?: boolean;
}

/** The authenticated user, as carried in the session cookie / JWT. */
export interface SessionUser {
  id: string;
  username: string;
  role: UserRole;
  permissions: Permission[];
  /** Discord CDN profile picture URL, if the user has one. */
  avatarUrl?: string;
  /** True once the user finished onboarding. Re-read from the DB by /api/auth/me. */
  onboarded?: boolean;
  /** True once the user verified membership in the Discord server. Re-read from the DB by /api/auth/me. */
  discordVerified?: boolean;
  /** Linked Minecraft username, re-read from the DB by /api/auth/me. */
  minecraftUsername?: string | null;
}

export interface ServerStatus {
  online: boolean;
  players?: number;
  max?: number;
  playerList?: string[];
  version?: string;
  hostname?: string;
  source?: "live" | "fallback";
  /** Fine-grained exaroton state behind the online/offline boolean. */
  state?:
    | "online"
    | "starting"
    | "loading"
    | "stopping"
    | "restarting"
    | "crashed"
    | "offline"
    | "pending"
    | "unknown";
  /** Human label for the state, e.g. "Starting…". */
  stateLabel?: string;
  /** Server name and raw MOTD from exaroton (format codes stripped). */
  serverName?: string | null;
  motd?: string | null;
  /** Server software, e.g. "NeoForge". */
  software?: string | null;
}
