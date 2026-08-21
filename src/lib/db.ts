import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

/**
 * Create a database client. Throws if no DATABASE_URL is available.
 * Used by the seed script and anything that requires a connection.
 *
 * Works with ANY Postgres — Supabase (recommended), Neon, RDS, local.
 * Set DATABASE_URL to your Supabase "Session pooler" or "Direct"
 * connection string. Example:
 *   postgresql://postgres.abcdefgh:[PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:5432/postgres
 *
 * `prepare: false` keeps the client compatible with Supabase's
 * connection pooler (transaction mode), which does not support
 * prepared statements.
 *
 * The client is cached at module level: on serverless platforms (Vercel)
 * the same warm instance serves many requests, and creating a fresh
 * `postgres()` client per request without ever calling `end()` would
 * leak connections until the pooler maxes out and the site goes down.
 */
// Cache on globalThis: Next.js dev hot-reload re-evaluates modules, so a
// plain module-level let would create a NEW postgres pool on every edit
// while the old one keeps its sockets open — until the pooler maxes out.
const g = globalThis as unknown as { __techstealDb?: Db };

export function createDb(url = process.env.DATABASE_URL): Db {
  if (!url) throw new Error("DATABASE_URL is not set");
  if (g.__techstealDb) return g.__techstealDb;
  // Pool sizing is about Supabase's SESSION pooler (port 5432), which caps
  // each user at ~15 server sessions. Every warm serverless instance holds
  // its pool open, so a big `max` here gets the whole site
  // EMAXCONNSESSION errors once a few instances are warm. Keep it small
  // and release idle sockets quickly.
  const client = postgres(url, {
    prepare: false,
    max: 3,
    idle_timeout: 20, // seconds — free the pooler slot when an instance goes quiet
    max_lifetime: 60 * 5, // seconds — never hold a slot longer than 5 min
    connect_timeout: 10,
  });
  const db = drizzle(client, { schema });
  g.__techstealDb = db;
  return db;
}

/**
 * Null-safe accessor for API routes.
 * Returns null when the database hasn't been configured yet — routes then
 * fall back to static placeholder content so the site still renders.
 */
export function getDb(): Db | null {
  return process.env.DATABASE_URL ? createDb() : null;
}
