// Valid Minecraft usernames: 1–16 chars of letters, digits or underscore.
// (Since 2022 Mojang allows any length ≥1; prefixes like "." are illegal.)
//
// Shared so the profile PATCH validator and the skin proxy can never drift
// apart — they used to declare the same regex twice.

export const MC_NAME_RE = /^[A-Za-z0-9_]{1,16}$/;

export function isValidMcName(name: string): boolean {
  return MC_NAME_RE.test(name);
}
