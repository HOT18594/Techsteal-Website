// One-off: apply the additive community-feature schema (migration 0002) —
// the `notifications` and `audit_log` tables plus their indexes. Idempotent
// (IF NOT EXISTS) and purely additive: it never drops or alters anything, so
// it sidesteps `db:push`'s interactive legacy-`members`-table drop prompt.
// Safe to re-run. Mirrors drizzle/0002_puzzling_star_brand.sql exactly.
import { config } from "dotenv";
config({ path: ".env.local" });
import { sql } from "drizzle-orm";
import { createDb } from "../src/lib/db";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const db = createDb(url);

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "audit_log" (
    "id" serial PRIMARY KEY NOT NULL,
    "actor_id" text DEFAULT '' NOT NULL,
    "actor_name" text DEFAULT '' NOT NULL,
    "action" text NOT NULL,
    "target_id" text DEFAULT '' NOT NULL,
    "target_name" text DEFAULT '' NOT NULL,
    "detail" text DEFAULT '' NOT NULL,
    "created_at" timestamp DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS "notifications" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "actor_id" text DEFAULT '' NOT NULL,
    "actor_name" text DEFAULT '' NOT NULL,
    "type" text NOT NULL,
    "thread_id" integer,
    "reply_id" integer,
    "item_id" integer,
    "excerpt" text DEFAULT '' NOT NULL,
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS "audit_log_created_idx" ON "audit_log" USING btree ("created_at")`,
  `CREATE INDEX IF NOT EXISTS "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at")`,
];

async function main() {
  for (const statement of STATEMENTS) {
    await db.execute(sql.raw(statement));
  }
  console.log("Community tables ready: audit_log, notifications (+ indexes).");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });