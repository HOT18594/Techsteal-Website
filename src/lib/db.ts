import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export type Db = NeonHttpDatabase<typeof schema>;

/**
 * Create a database client. Throws if no DATABASE_URL is available.
 * Used by the seed script and anything that requires a connection.
 */
export function createDb(url = process.env.DATABASE_URL): Db {
  if (!url) throw new Error("DATABASE_URL is not set");
  return drizzle(neon(url), { schema });
}

/**
 * Null-safe accessor for API routes.
 * Returns null when the database hasn't been configured yet — routes then
 * fall back to static placeholder content so the site still renders.
 */
export function getDb(): Db | null {
  return process.env.DATABASE_URL ? createDb() : null;
}
