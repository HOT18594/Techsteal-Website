// One-off: insert the Season 1–4 "past seasons" timeline events into the
// connected database. Safe to re-run — it clears the past-seasons era first.
import { config } from "dotenv";
config({ path: ".env.local" });
import { eq } from "drizzle-orm";
import { createDb } from "../src/lib/db";
import { timelineEvents } from "../src/lib/schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
// createDb routes through the TRANSACTION pooler (port 6543, prepare:false)
// itself — a naive `url.replace(":5432", ":6543")` here would corrupt any
// URL whose password happened to contain ":5432".
const db = createDb(url);

const seasons = [
  { date: "Concluded", title: "Season 1", era: "Past Seasons", major: true, description: "Season 1 has passed — it ran before this website existed. The world is closed, but it started everything." },
  { date: "Concluded", title: "Season 2", era: "Past Seasons", major: true, description: "Season 2 has passed — another world from before the site launched. Its story lives on in the community." },
  { date: "Concluded", title: "Season 3", era: "Past Seasons", major: true, description: "Season 3 has passed — the server kept growing through it, still before anyone could track it here." },
  { date: "Concluded", title: "Season 4", era: "Past Seasons", major: true, description: "Season 4 has passed — the final season before the website launched. The site started during Season 5, the current one." },
];

async function main() {
  // Idempotent: drop any previously inserted past-season rows first.
  await db.delete(timelineEvents).where(eq(timelineEvents.era, "Past Seasons"));
  await db.insert(timelineEvents).values(seasons);
  const rows = await db.select().from(timelineEvents);
  console.log(`timeline now has ${rows.length} event(s):`);
  for (const r of rows) console.log(` - [${r.era}] ${r.date} · ${r.title}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
