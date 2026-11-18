// Central site configuration.
// Change the name, server address, links, and assistant here — everything
// else on the page reads from this object, so you don't have to hunt
// through components to rebrand.

export const siteConfig = {
  name: "TECHSTEAL",
  address: "techstealseason6.exaroton.me:19457",
  version: "1.21.11",
  software: "Fabric",
  difficulty: "Hard",
  whitelist: "Enabled",
  location: "FRA · EU",
  maxPlayers: 10,
  stats: {
    tps: "20.0",
    uptimeDays: "0",
    worldSize: "0.0",
    mapSize: "60k×60k",
  },
  season: "Season 6",
  previousSeason: "Season 5",
  // Whether the current season has publicly launched. While false the site
  // says "coming soon", the server start/stop panel is hidden, and the
  // control API refuses actions. Flip to true on launch day.
  seasonLive: false,
  // Launch date of the current season — the home stats tile counts "days
  // live" from here once seasonLive is true. Adjust if the world opens on a
  // different day.
  seasonStart: "2026-11-13",
  assistant: {
    name: "Chatty Jr.",
    initial: "C",
  },
  socials: {
    discord: "#",
    github: "#",
    wiki: "#",
    map: "#",
  },
} as const;

const FALLBACK_SITE_URL = "https://www.techsteal.space";

/**
 * Canonical public origin with no trailing slash. Guards against empty or
 * malformed `NEXT_PUBLIC_SITE_URL` values so `new URL(...)` in metadata or
 * RSS generation can never throw at module load.
 */
export function getSiteUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  if (!raw) return FALLBACK_SITE_URL;
  try {
    const parsed = new URL(raw);
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "");
  } catch {
    return FALLBACK_SITE_URL;
  }
}
