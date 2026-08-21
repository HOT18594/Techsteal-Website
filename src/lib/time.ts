/** Compact X-style relative time for ISO timestamps. */
export function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  // Guard against malformed values (e.g. legacy "just now" strings) so we
  // never render "Invalid Date".
  if (Number.isNaN(d.getTime())) return "just now";
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d`;
  // Explicit locale + year for old posts: server locale would differ from
  // the client (hydration mismatch), and "Aug 20" is ambiguous across years.
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}
