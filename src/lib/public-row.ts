/**
 * Strip server-only fields from DB rows before they go out in public API
 * responses. `likedBy` holds account ids ("discord:<id>") — useful for
 * server-side toggling, but an unneeded stable-identifier disclosure on
 * every unauthenticated list/detail response (the client gets a derived
 * per-viewer `liked` boolean instead).
 *
 * The bound is `object`, not `{ likedBy?: unknown }`: rows from tables that
 * never had the column (gallery comments) should still be able to go through
 * the same helper, so every public response reads the same way and a column
 * added later can't quietly start leaking.
 */
export function publicRow<T extends object>(row: T): Omit<T, "likedBy"> {
  const rest = { ...row };
  delete (rest as { likedBy?: unknown }).likedBy;
  return rest as Omit<T, "likedBy">;
}
