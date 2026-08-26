// Tiny in-memory sliding-window rate limiter, used for brute-forceable
// actions (admin-code attempts). Best-effort: on serverless platforms each
// instance keeps its own counter, so this slows abuse down rather than
// being a hard guarantee — plenty for a low-traffic community site.

// Each key remembers the largest window it was used with, so the sweep can
// prune exactly-stale histories without breaking callers whose window is
// longer than the sweeper's own idea of "stale" (a fixed 60-minute cutoff
// silently reset e.g. 24h windows after an hour of idleness).
const HITS = new Map<string, { ts: number[]; windowMs: number }>();
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
    for (const [k, entry] of HITS) {
      const newest = entry.ts[entry.ts.length - 1];
      if (newest !== undefined && now - newest > entry.windowMs) HITS.delete(k);
    }
  }
  const recent = (HITS.get(key)?.ts ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    HITS.set(key, { ts: recent, windowMs });
    return true;
  }
  recent.push(now);
  HITS.set(key, { ts: recent, windowMs });
  return false;
}

/**
 * Best-effort client IP for rate-limit keys. The LAST x-forwarded-for
 * entry is the one the platform's own edge appended and is the only
 * trustworthy one — a client can pad the header with arbitrary values,
 * so keying on the FIRST entry lets an attacker rotate a fresh "IP" per
 * request and bypass the limiter entirely.
 */
export function rateLimitIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1].slice(0, 60);
  }
  return request.headers.get("x-real-ip")?.trim().slice(0, 60) || "local";
}
