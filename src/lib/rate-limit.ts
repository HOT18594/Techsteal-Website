// Tiny in-memory sliding-window rate limiter, used for brute-forceable
// actions (admin-code attempts). Best-effort: on serverless platforms each
// instance keeps its own counter, so this slows abuse down rather than
// being a hard guarantee — plenty for a low-traffic community site.

const HITS = new Map<string, number[]>();
let lastSweep = 0;

/** True when `key` has gone over `limit` requests within `windowMs`. */
export function isRateLimited(
  key: string,
  limit: number,
  windowMs: number
): boolean {
  const now = Date.now();
  // Occasionally drop keys whose entries are all stale — without a sweep,
  // abandoned keys linger in the map forever (slow memory leak).
  if (now - lastSweep > 5 * 60_000) {
    lastSweep = now;
    for (const [k, ts] of HITS) {
      if (ts.every((t) => now - t > 60 * 60_000)) HITS.delete(k);
    }
  }
  const recent = (HITS.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    HITS.set(key, recent);
    return true;
  }
  recent.push(now);
  HITS.set(key, recent);
  return false;
}
