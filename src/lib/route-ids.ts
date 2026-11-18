// One id parser for every dynamic API route.
//
// The routes used to mix two different checks: `Number.isInteger(Number(x))`
// (which accepts "" → 0, "-3", "1e2") and a stricter `> 0` parser. The loose
// form let `/api/forum/0` and `/api/gallery/-1` reach the database as real
// queries that always miss, answering 404 instead of 400 — and `?replyId=`
// (empty) silently became reply 0. Every route now shares this parser.

/** Max signed 32-bit integer accepted by PostgreSQL `serial` / `integer` columns. */
export const PG_INT4_MAX = 2_147_483_647;

/**
 * Parse a positive integer route/query id within PostgreSQL INT4 bounds.
 * Returns null for anything that isn't a plain positive 32-bit integer.
 */
export function parseRouteId(raw: string | null | undefined): number | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  // Digits only — rejects "", "-1", "1e2", "1.0", " 1 " padding oddities and
  // "0x10". Leading zeros are harmless ("007" → 7).
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n <= 0 || n > PG_INT4_MAX) return null;
  return n;
}

/**
 * Parse an id from a JSON body (number or numeric string), rejecting
 * null/""/0/negatives/INT4-overflow. One shared copy — the per-route
 * duplicates had begun to drift.
 */
export function parseBodyId(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 && value <= PG_INT4_MAX ? value : null;
  }
  return parseRouteId(typeof value === "string" ? value : null);
}
