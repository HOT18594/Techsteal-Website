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
//
// Keyed by the resolved connection string: the cache used to be a single slot,
// so `createDb(otherUrl)` silently handed back the client for whatever URL got
// there first and connected to the wrong database (the seed script passes an
// explicit URL).
const g = globalThis as unknown as { __techstealDb?: Map<string, Db> };

/**
 * Route session-pooler URLs (port 5432) to Supabase's TRANSACTION pooler
 * (port 6543). The session pooler caps the whole project at ~15 server
 * sessions; a handful of warm serverless instances (each holding a small
 * pool) plus local dev exhausted it, and every DB call across the site
 * failed with EMAXCONNSESSION. The transaction pooler multiplexes many
 * clients over a few server sessions — it's what Supabase recommends for
 * serverless. prepare:false (below) keeps it compatible.
 */
export function toTransactionPooler(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith(".pooler.supabase.com") && u.port !== "6543") {
      u.port = "6543";
      return u.toString();
    }
    return url;
  } catch {
    return url;
  }
}

export function createDb(url = process.env.DATABASE_URL): Db {
  if (!url) throw new Error("DATABASE_URL is not set");
  const resolved = toTransactionPooler(url);
  const cache = (g.__techstealDb ??= new Map<string, Db>());
  const cached = cache.get(resolved);
  if (cached) return cached;
  const client = postgres(resolved, {
    // Required for the transaction pooler: it doesn't support session-level
    // prepared statements.
    prepare: false,
    max: 3,
    idle_timeout: 20, // seconds — release the slot when an instance goes quiet
    max_lifetime: 60 * 5, // seconds — never hold a slot longer than 5 min
    connect_timeout: 10,
  });
  const db = drizzle(client, { schema });
  cache.set(resolved, db);
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
