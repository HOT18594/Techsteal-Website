// Placeholder content used in two places:
//   1. As the fallback the API routes return until a database is configured.
//   2. As the sample data the `npm run db:seed` script writes to your DB.
//
// Replace everything here with your real server data. Descriptive/lore text
// has been intentionally left out — keep it that way.

import type {
  ForumThread,
  GalleryItem,
  Member,
  RuleSection,
  ServerStatus,
  TimelineEvent,
} from "../types";
import { siteConfig } from "./site";

export const fallbackMembers: Member[] = [
  { name: "Alex", role: "Owner", icon: "fa-crown", avatar: "A", color: "avatar-1", status: "online", joined: "Day 1", playtime: "512h" },
  { name: "Sam", role: "Admin", icon: "fa-shield-halved", avatar: "S", color: "avatar-2", status: "online", joined: "Day 1", playtime: "380h" },
  { name: "Riley", role: "Builder", icon: "fa-compass", avatar: "R", color: "avatar-3", status: "offline", joined: "Day 3", playtime: "240h" },
  { name: "Jordan", role: "Engineer", icon: "fa-bolt", avatar: "J", color: "avatar-4", status: "offline", joined: "Day 5", playtime: "190h" },
  { name: "Taylor", role: "Member", icon: "fa-user", avatar: "T", color: "avatar-5", status: "offline", joined: "Day 8", playtime: "120h" },
  { name: "Morgan", role: "Member", icon: "fa-user", avatar: "M", color: "avatar-6", status: "offline", joined: "Day 12", playtime: "90h" },
  { name: "Casey", role: "Member", icon: "fa-user", avatar: "C", color: "avatar-7", status: "offline", joined: "Day 15", playtime: "60h" },
  { name: "Quinn", role: "Member", icon: "fa-user", avatar: "Q", color: "avatar-8", status: "offline", joined: "Day 20", playtime: "40h" },
];

export const fallbackThreads: ForumThread[] = [
  { title: "Welcome to Techsteal", author: "Alex", avatar: "A", color: "avatar-1", category: "Announcements", tagClass: "tag-accent", replies: 12, last: "2h ago", pinned: true },
  { title: "Server launch date & how to join", author: "Sam", avatar: "S", color: "avatar-2", category: "Announcements", tagClass: "tag-accent", replies: 8, last: "6h ago", pinned: false },
  { title: "Suggest new features here", author: "Riley", avatar: "R", color: "avatar-3", category: "Ideas", tagClass: "tag-diamond", replies: 21, last: "1d ago", pinned: false },
  { title: "Help: iron farm not producing", author: "Jordan", avatar: "J", color: "avatar-4", category: "Technical", tagClass: "tag-redstone", replies: 6, last: "1d ago", pinned: false },
  { title: "Screenshot thread — share your builds", author: "Taylor", avatar: "T", color: "avatar-5", category: "Builds", tagClass: "tag-accent", replies: 34, last: "2d ago", pinned: false },
  { title: "Who's up for a dragon fight this weekend?", author: "Morgan", avatar: "M", color: "avatar-6", category: "Off-topic", tagClass: "tag-emerald", replies: 15, last: "3d ago", pinned: false },
];

export const fallbackGallery: GalleryItem[] = [
  { title: "Spawn Hall", builder: "Alex", category: "Landmark", likes: 45, image: "https://picsum.photos/seed/techsteal-spawnhall/800/1000.jpg", height: "tall" },
  { title: "Iron Farm v2", builder: "Jordan", category: "Technical", likes: 28, image: "https://picsum.photos/seed/techsteal-ironfarm/800/600.jpg", height: "short" },
  { title: "Nether Hub", builder: "Sam", category: "Landmark", likes: 61, image: "https://picsum.photos/seed/techsteal-netherhub/800/900.jpg", height: "tall" },
  { title: "Village Brewery", builder: "Riley", category: "Build", likes: 19, image: "https://picsum.photos/seed/techsteal-brewery/800/700.jpg", height: "medium" },
  { title: "Mob Farm Tower", builder: "Taylor", category: "Technical", likes: 33, image: "https://picsum.photos/seed/techsteal-mobfarm/800/950.jpg", height: "tall" },
  { title: "Floating Gardens", builder: "Morgan", category: "Build", likes: 27, image: "https://picsum.photos/seed/techsteal-gardens/800/650.jpg", height: "short" },
];

export const fallbackTimeline: TimelineEvent[] = [
  { date: "Aug 17, 2025", title: "Server Launched", era: "Era I", major: true },
  { date: "Sep 20, 2025", title: "First Build Contest", era: "Era I", major: false },
  { date: "Nov 05, 2025", title: "Nether Hub Completed", era: "Era I", major: false },
  { date: "Jan 12, 2026", title: "First Dragon Slain", era: "Era II", major: true },
  { date: "Mar 30, 2026", title: "Iron Farm v2 Online", era: "Era II", major: false },
];

export const fallbackRules: RuleSection[] = [
  {
    icon: "fa-handshake",
    title: "Community Conduct",
    rules: [
      "Treat every member with respect.",
      "No griefing, stealing, or unsanctioned killing.",
      "Let the team know if you will be away for more than a week.",
    ],
  },
  {
    icon: "fa-hammer",
    title: "Building",
    rules: [
      "No building within 128 blocks of another base without permission.",
      "Sign your builds so credit is clear.",
      "Restore the landscape after large mining operations.",
    ],
  },
  {
    icon: "fa-bolt",
    title: "PvP & Theft",
    rules: [
      "PvP is consent-based. Both parties must agree.",
      "No stealing from unclaimed chests.",
      "Pranks are allowed — within reason.",
    ],
  },
  {
    icon: "fa-microchip",
    title: "Technical",
    rules: [
      "No cheats, hacks, or X-ray. Vanilla only.",
      "No lag machines. Keep the server healthy.",
      "Report bugs instead of exploiting them.",
    ],
  },
];

export const fallbackStatus: ServerStatus = {
  online: true,
  players: 2,
  max: siteConfig.maxPlayers,
  playerList: ["Alex", "Sam"],
  version: siteConfig.version,
  hostname: siteConfig.address,
  source: "fallback",
};

export const seedData = {
  members: fallbackMembers,
  threads: fallbackThreads,
  gallery: fallbackGallery,
  timeline: fallbackTimeline,
  rules: fallbackRules,
};
