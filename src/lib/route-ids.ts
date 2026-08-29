// One id parser for every dynamic API route.
//
// The routes used to mix two different checks: `Number.isInteger(Number(x))`
// (which accepts "" → 0, "-3", "1e2") and a stricter `> 0` parser. The loose
// form let `/api/forum/0` and `/api/gallery/-1` reach the database as real
// queries that always miss, answering 404 instead of 400 — and `?replyId=`
// (empty) silently became reply 0. Every route now shares this parser.

/**
 * Parse a positive integer route/query id.
 * Returns null for anything that isn't a plain positive integer.
 */
export function parseRouteId(raw: string | null | undefined): number | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  // Digits only — rejects "", "-1", "1e2", "1.0", " 1 " padding oddities and
  // "0x10". Leading zeros are harmless ("007" → 7).
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  return n;
}
