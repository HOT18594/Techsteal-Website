// One-off: sync the Season 6 timeline event to the configured launch state
// (siteConfig.seasonLive). Idempotent — safe to re-run. Touches only Season 6.
// Flip seasonLive in src/lib/site.ts at launch, then re-run to mark it Live.
import { config } from "dotenv";
config({ path: ".env.local" });
import { eq } from "drizzle-orm";
import { createDb } from "../src/lib/db";
import { timelineEvents } from "../src/lib/schema";
import { siteConfig } from "../src/lib/site";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const db = createDb(url);

const live = siteConfig.seasonLive;
const date = live ? "Live" : "Coming soon";
const description = live
  ? "Season 6 is live — a fresh world on Fabric 1.21.11 with 10 player slots. New season, new story."
  : "Season 6 is coming soon — a fresh world on Fabric 1.21.11 with 10 player slots. New season, new story.";

async function main() {
  const updated = await db
    .update(timelineEvents)
    .set({ date, era: "Current Season", description })
    .where(eq(timelineEvents.title, "Season 6"))
    .returning({ id: timelineEvents.id });
  if (updated.length === 0) {
    // No Season 6 row yet (fresh DB) — insert it instead.
    await db.insert(timelineEvents).values({
      date,
      title: "Season 6",
      era: "Current Season",
      major: true,
      description,
    });
    console.log(`Season 6 event inserted → ${date}.`);
  } else {
    console.log(`Season 6 event updated (${updated.length} row) → ${date}.`);
  }
  const rows = await db.select().from(timelineEvents);
  for (const r of rows) console.log(` - [${r.era}] ${r.date} · ${r.title}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });