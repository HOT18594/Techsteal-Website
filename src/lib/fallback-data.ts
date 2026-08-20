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

export const fallbackTimeline: TimelineEvent[] = [
  { date: "Ended", title: "Season 1", era: "Season 1", major: true, description: "This season has now passed." },
  { date: "Ended", title: "Season 2", era: "Season 2", major: true, description: "This season has now passed." },
  { date: "Ended", title: "Season 3", era: "Season 3", major: true, description: "This season has now passed." },
  { date: "Ended", title: "Season 4", era: "Season 4", major: true, description: "This season has now passed." },
];

export const fallbackRules: RuleSection[] = [
  {
    icon: "fa-shield-halved",
    title: "Techsteal Server Rules",
    rules: [
      "No unfair client modifications.",
      "Hack clients or mods that give unfair advantages (e.g. minimaps) are not allowed. Mods that aid building or improve visuals (e.g. full-bright) are fine.",
      "Raiding and griefing are part of the game, but don't go overboard. Structures near world spawn are protected and must not be damaged.",
      "Lag machines, chunk bans, and any other intentional server disruption are strictly prohibited.",
      "Combat logging is not allowed. While there's no plugin to prevent it, offenders can be reported.",
      "Crystal PvP is only allowed if both parties agree beforehand.",
      "No bullying or harassment. Keep interactions fun and respectful for everyone.",
      "Spawn killing is not permitted. Give players a fair chance after respawn.",
      "Severe enough offences will lead to immediate ban.",
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
