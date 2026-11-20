import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Permission } from "@/types";

// Guest login — for people without Discord. A shared password (GUEST_PASSWORD
// env var, never hardcoded: the repo is public) mints a real `profiles` row
// keyed `guest:<random>`, so posting, notifications, bans and every other
// account-keyed feature work exactly as for Discord members.

export const GUEST_ID_PREFIX = "guest:";

/** Standard member capabilities, granted explicitly (no Discord to verify). */
export const GUEST_PERMISSIONS: Permission[] = [
  "ai_access",
  "gallery_post",
  "server_control",
];

export function isGuestId(id: string | undefined | null): boolean {
  return typeof id === "string" && id.startsWith(GUEST_ID_PREFIX);
}

/** The configured guest password, or null when guest login is disabled. */
export function getGuestPassword(): string | null {
  const value = (process.env.GUEST_PASSWORD ?? "").trim();
  return value || null;
}

/** Constant-time comparison of SHA-256 digests. */
export function guestPasswordMatches(attempt: string): boolean {
  const configured = getGuestPassword();
  if (!configured) return false;
  const a = createHash("sha256").update(attempt.trim()).digest();
  const b = createHash("sha256").update(configured).digest();
  return timingSafeEqual(a, b);
}

/** A fresh, unguessable guest account id. */
export function newGuestId(): string {
  return `${GUEST_ID_PREFIX}${randomBytes(9).toString("hex")}`;
}

/** Clean a visitor-supplied display name; falls back to "Guest-xxxx". */
export function guestDisplayName(raw: unknown, id: string): string {
  const cleaned =
    typeof raw === "string"
      ? raw
          .replace(/[\u0000-\u001f\u007f<>]/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 20)
      : "";
  if (cleaned.length >= 2) return `${cleaned} (guest)`;
  return `Guest-${id.slice(GUEST_ID_PREFIX.length, GUEST_ID_PREFIX.length + 4)}`;
}
