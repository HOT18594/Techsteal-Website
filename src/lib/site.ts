// Central site configuration.
// Change the name, server address, links, and assistant here — everything
// else on the page reads from this object, so you don't have to hunt
// through components to rebrand.

export const siteConfig = {
  name: "TECHSTEAL",
  address: "play.techsteal.space",
  version: "1.21.4",
  software: "Paper",
  difficulty: "Hard",
  whitelist: "Enabled",
  location: "FRA · EU",
  maxPlayers: 8,
  stats: {
    tps: "20.0",
    uptimeDays: "120",
    worldSize: "4.2",
    mapSize: "60k×60k",
  },
  season: "Season 5",
  assistant: {
    name: "Nova",
    initial: "N",
    tagline: "Online · responds instantly",
  },
  socials: {
    discord: "#",
    github: "#",
    wiki: "#",
    map: "#",
  },
} as const;