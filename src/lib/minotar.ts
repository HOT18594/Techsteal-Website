// Client-safe skin-head URL helper (no server imports — safe to use in
// client components and server routes alike).

/** Skin head URL for a Minecraft username (minotar — no key needed). */
export function minotarUrl(username: string): string {
  return `https://minotar.net/helm/${encodeURIComponent(username)}/64.png`;
}