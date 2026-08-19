// Tiny in-memory sliding-window rate limiter, used for brute-forceable
// actions (admin-code attempts). Best-effort: on serverless platforms each
// instance keeps its own counter, so this slows abuse down rather than
// being a hard guarantee — plenty for a low-traffic community site.

const HITS = new Map<string, number[]>();

/** True when `key` has gone over `limit` requests within `windowMs`. */
export function isRateLimited(
  key: string,
  limit: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const recent = (HITS.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    HITS.set(key, recent);
    return true;
  }
  recent.push(now);
  HITS.set(key, recent);
  return false;
}
