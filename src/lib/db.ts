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
let cachedClient: Db | null = null;

export function createDb(url = process.env.DATABASE_URL): Db {
  if (!url) throw new Error("DATABASE_URL is not set");
  if (cachedClient) return cachedClient;
  const client = postgres(url, { prepare: false, max: 1 });
  cachedClient = drizzle(client, { schema });
  return cachedClient;
}

/**
 * Null-safe accessor for API routes.
 * Returns null when the database hasn't been configured yet — routes then
 * fall back to static placeholder content so the site still renders.
 */
export function getDb(): Db | null {
  return process.env.DATABASE_URL ? createDb() : null;
}
