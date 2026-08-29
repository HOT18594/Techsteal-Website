// Shared "count a view once per viewer per window" helper.
//
// Previously duplicated verbatim in the forum and gallery detail routes,
// which meant a fix to one (e.g. the unbounded-Map leak) silently missed the
// other. Each content kind gets its own namespace so a forum thread id and a
// gallery item id can't collide.
//
// Best-effort by design: serverless instances don't share memory, so a view
// may be counted once per warm instance. That's the accepted trade-off — the
// alternative is a write on every page load.

const VIEW_TTL = 30 * 60 * 1000; // 30 minutes
/** Hard cap per namespace so a long-lived instance can't grow forever. */
const MAX_KEYS = 5_000;

const seen = new Map<string, Map<string, number>>();

function bucket(namespace: string): Map<string, number> {
  let map = seen.get(namespace);
  if (!map) {
    map = new Map();
    seen.set(namespace, map);
  }
  return map;
}

/**
 * Returns true when this (namespace, id, viewer) should be counted as a new
 * view, and records it. `viewer` is an account id when signed in, otherwise
 * a coarse client fingerprint (IP) — never used for anything else.
 */
export function shouldCountView(namespace: string, id: number, viewer: string): boolean {
  const map = bucket(namespace);
  const key = `${id}:${viewer}`;
  const now = Date.now();
  const last = map.get(key);
  if (last !== undefined && now - last < VIEW_TTL) return false;

  // Sweep expired entries before inserting; if the map is still over the cap
  // (pathological traffic), drop the oldest insertions.
  if (map.size >= MAX_KEYS) {
    for (const [k, at] of map) {
      if (now - at >= VIEW_TTL) map.delete(k);
    }
    while (map.size >= MAX_KEYS) {
      const oldest = map.keys().next();
      if (oldest.done) break;
      map.delete(oldest.value);
    }
  }
  map.set(key, now);
  return true;
}
