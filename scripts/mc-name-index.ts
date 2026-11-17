// One-off: replace the case-sensitive Minecraft-name unique index with a
// case-insensitive one (lower(minecraft_username)). Additive-only apart from
// dropping the OLD index it replaces — never touches tables.
//
//   npx tsx scripts/mc-name-index.ts          # check for conflicts only
//   npx tsx scripts/mc-name-index.ts --apply  # perform the swap
import { config } from "dotenv";
config({ path: ".env.local" });
import { sql } from "drizzle-orm";
import { createDb } from "../src/lib/db";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const db = createDb(url);
const apply = process.argv.includes("--apply");

async function main() {
  const dupes = (await db.execute(sql`
    select lower(minecraft_username) as name,
           count(*)::int as n,
           array_agg(minecraft_username) as variants
    from profiles
    where minecraft_username is not null
    group by 1 having count(*) > 1
  `)) as unknown as Array<{ name: string; n: number; variants: string[] }>;
  if (dupes.length > 0) {
    console.log("CONFLICT — case-insensitive duplicates exist, index NOT created:");
    for (const d of dupes) console.log(` - ${d.name}: ${d.variants.join(", ")}`);
    process.exit(1);
  }
  console.log("No case-insensitive duplicates. Safe to create the index.");
  if (!apply) {
    console.log("(check-only mode — re-run with --apply to perform the swap)");
    return;
  }
  await db.execute(sql`drop index if exists "profiles_mc_name_uq"`);
  await db.execute(sql`
    create unique index if not exists "profiles_mc_name_lower_uq"
    on "profiles" (lower("minecraft_username"))
    where minecraft_username is not null
  `);
  const indexes = (await db.execute(sql`
    select indexname from pg_indexes where tablename = 'profiles'
  `)) as unknown as Array<{ indexname: string }>;
  console.log("profiles indexes now:", indexes.map((i) => i.indexname).join(", "));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });