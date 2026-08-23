/**
 * Strip server-only fields from DB rows before they go out in public API
 * responses. `likedBy` holds account ids ("discord:<id>") — useful for
 * server-side toggling, but an unneeded stable-identifier disclosure on
 * every unauthenticated list/detail response (the client gets a derived
 * per-viewer `liked` boolean instead).
 */
export function publicRow<T extends { likedBy?: unknown }>(row: T): Omit<T, "likedBy"> {
  const rest = { ...row };
  delete (rest as Partial<T>).likedBy;
  return rest as Omit<T, "likedBy">;
}
