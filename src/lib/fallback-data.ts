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

export const fallbackMembers: Member[] = [];

export const fallbackThreads: ForumThread[] = [];

export const fallbackGallery: GalleryItem[] = [];

export const fallbackTimeline: TimelineEvent[] = [];

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
  players: 0,
  max: siteConfig.maxPlayers,
  playerList: [],
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
