// Maintenance: find objects in the gallery bucket that no live content
// references (leftovers from deleted posts, legacy pre-owner-token uploads)
// and optionally delete them.
//
//   npx tsx scripts/cleanup-storage.ts          # dry run — list orphans only
//   npx tsx scripts/cleanup-storage.ts --apply  # actually delete them
import { config } from "dotenv";
config({ path: ".env.local" });
import {
  deleteStorageObjects,
  listStorageObjects,
  referencedStoragePaths,
} from "../src/lib/storage";

async function main() {
  const apply = process.argv.includes("--apply");
  const [objects, refs] = await Promise.all([listStorageObjects(), referencedStoragePaths()]);
  if (objects === null) {
    throw new Error("Could not list the storage bucket — are SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY set?");
  }
  if (refs === null) {
    throw new Error("Could not scan content references — aborting (never delete on an incomplete reference list).");
  }
  const orphans = objects.filter((p) => !refs.has(p));
  console.log(
    `Bucket objects: ${objects.length} · referenced paths: ${refs.size} · orphans: ${orphans.length}`
  );
  for (const p of orphans) console.log(` - ${p}`);
  if (orphans.length === 0) {
    console.log("Nothing to clean up.");
    return;
  }
  if (!apply) {
    console.log("\nDry run — re-run with --apply to delete the objects above.");
    return;
  }
  const deleted = await deleteStorageObjects(orphans);
  console.log(`Deleted ${deleted} object(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });