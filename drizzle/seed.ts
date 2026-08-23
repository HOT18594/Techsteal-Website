import { config } from "dotenv";
import { createDb } from "../src/lib/db";
import { seedData } from "../src/lib/fallback-data";
import {
  forumPolls,
  forumPollVotes,
  forumReplies,
  forumThreads,
  galleryComments,
  galleryItems,
  ruleSections,
  timelineEvents,
} from "../src/lib/schema";

async function main() {
  // Load local env (same precedence as the app: .env.local then .env)
  config({ path: [".env.local", ".env"] });

  const db = createDb();

  console.log("Clearing existing rows…");
  await db.delete(ruleSections);
  await db.delete(timelineEvents);
  // Comments reference gallery items, so they go first.
  await db.delete(galleryComments);
  await db.delete(galleryItems);
  // Poll votes → polls → replies → threads: children before parents, or
  // re-seeding would orphan polls/votes pointing at deleted thread ids.
  await db.delete(forumPollVotes);
  await db.delete(forumPolls);
  await db.delete(forumReplies);
  await db.delete(forumThreads);

  console.log("Seeding placeholder content…");

  // Only insert collections that actually have rows — Drizzle's
  // .values() rejects empty arrays.
  const inserts = [
    ["forum threads", forumThreads, seedData.threads],
    ["gallery items", galleryItems, seedData.gallery],
    ["timeline events", timelineEvents, seedData.timeline],
    ["rule sections", ruleSections, seedData.rules],
  ] as const;

  for (const [label, table, rows] of inserts) {
    if (rows.length === 0) {
      console.log(`  - ${label}: 0 rows (skipped — nothing to seed)`);
      continue;
    }
    await db.insert(table).values(rows);
    console.log(`  - ${label}: ${rows.length} rows`);
  }

  console.log("Done. Seed complete.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
