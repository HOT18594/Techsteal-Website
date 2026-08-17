import { config } from "dotenv";

// Load local env (same precedence as the app: .env.local then .env)
config({ path: [".env.local", ".env"] });

import { createDb } from "../src/lib/db";
import { seedData } from "../src/lib/fallback-data";
import {
  forumThreads,
  galleryItems,
  members,
  ruleSections,
  timelineEvents,
} from "../src/lib/schema";

async function main() {
  const db = createDb();

  console.log("Clearing existing rows…");
  await db.delete(ruleSections);
  await db.delete(timelineEvents);
  await db.delete(galleryItems);
  await db.delete(forumThreads);
  await db.delete(members);

  console.log("Seeding placeholder content…");
  await db.insert(members).values(seedData.members);
  await db.insert(forumThreads).values(seedData.threads);
  await db.insert(galleryItems).values(seedData.gallery);
  await db.insert(timelineEvents).values(seedData.timeline);
  await db.insert(ruleSections).values(seedData.rules);

  console.log("Done. Seed complete.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
