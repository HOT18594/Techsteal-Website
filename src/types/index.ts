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
}

export interface RuleSection {
  id?: number;
  icon: string;
  title: string;
  rules: string[];
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
