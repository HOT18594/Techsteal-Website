// One-off additive DB setup for the permanent public anti-cheat command ledger
// (`server_command_logs`). Purely additive (IF NOT EXISTS), never drops or
// alters any existing table, so it avoids `db:push`'s legacy `members` prompt.
// Safe to re-run.
import { config } from "dotenv";
config({ path: ".env.local" });
import { sql } from "drizzle-orm";
import { createDb } from "../src/lib/db";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const db = createDb(url);

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "server_command_logs" (
    "id" serial PRIMARY KEY NOT NULL,
    "fingerprint" text NOT NULL,
    "actor" text NOT NULL,
    "actor_source" text DEFAULT 'ingame' NOT NULL,
    "command_type" text DEFAULT 'other' NOT NULL,
    "severity" text DEFAULT 'normal' NOT NULL,
    "summary" text NOT NULL,
    "raw_line" text DEFAULT '' NOT NULL,
    "log_time" text DEFAULT '' NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "server_command_logs_fingerprint_uq" ON "server_command_logs" USING btree ("fingerprint")`,
  `CREATE INDEX IF NOT EXISTS "server_command_logs_occurred_idx" ON "server_command_logs" USING btree ("occurred_at")`,
  `CREATE INDEX IF NOT EXISTS "server_command_logs_type_idx" ON "server_command_logs" USING btree ("command_type","occurred_at")`,
  `CREATE INDEX IF NOT EXISTS "server_command_logs_actor_idx" ON "server_command_logs" USING btree ("actor","occurred_at")`,
];

async function main() {
  for (const statement of STATEMENTS) {
    await db.execute(sql.raw(statement));
  }
  console.log("Table ready: server_command_logs (+ unique & lookup indexes).");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
