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

// This script CLEARS every content table before inserting placeholder rows, so
// it refuses to touch a database that already has content unless the operator
// opts in explicitly. Wiping a live forum/gallery/timeline is not recoverable.
const FORCE = process.argv.includes("--force") || process.env.SEED_FORCE === "1";

async function main() {
  // Load local env (same precedence as the app: .env.local then .env)
  config({ path: [".env.local", ".env"] });

  const db = createDb();

  // Count first — never delete anything until the operator has opted in.
  const contentRows: Array<[string, number]> = [
    ["forum threads", await db.$count(forumThreads)],
    ["forum replies", await db.$count(forumReplies)],
    ["forum polls", await db.$count(forumPolls)],
    ["poll votes", await db.$count(forumPollVotes)],
    ["gallery items", await db.$count(galleryItems)],
    ["gallery comments", await db.$count(galleryComments)],
    ["timeline events", await db.$count(timelineEvents)],
    ["rule sections", await db.$count(ruleSections)],
  ];
  const total = contentRows.reduce((sum, [, n]) => sum + n, 0);

  if (total > 0 && !FORCE) {
    console.error("✗ Refusing to seed: this database already has content.");
    for (const [label, n] of contentRows) {
      if (n > 0) console.error(`    ${label}: ${n} row(s)`);
    }
    console.error("");
    console.error("`npm run db:seed` deletes ALL of the rows above before inserting");
    console.error("placeholder content. If that is really what you want, re-run with:");
    console.error("    npm run db:seed -- --force     (or: SEED_FORCE=1 npm run db:seed)");
    process.exit(1);
  }

  if (total > 0) {
    console.log(`--force set — clearing ${total} existing content row(s)…`);
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
  } else {
    console.log("Database is empty — nothing to clear.");
  }

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
