// Centralized HTML sanitization using DOMPurify.
// Used to prevent XSS from user-generated rich text (posts, comments, blog, seasons).
// Keep normal user content and season instructions on separate configs so contextual
// attributes such as href/src are not accidentally forbidden everywhere.
//
// This module is imported by BOTH client components and server routes. On the
// client (and in the vitest jsdom env) a global `window` exists, so DOMPurify
// is initialized synchronously from it. Server routes instead use the async
// `sanitizeHtmlAsync` / `sanitizeSeasonHtmlAsync` from `@/lib/sanitize.server`
// (which lazily creates a JSDOM window) — see that file for why we don't import
// jsdom here (it crashed Next.js API routes at module load via ERR_REQUIRE_ESM,
// which was the root cause of the 500s on post/blog creation).

import DOMPurify from "dompurify";
import {
  BASE_ALLOWED_TAGS,
  BASE_ALLOWED_ATTR,
  SEASON_ALLOWED_TAGS,
  SEASON_ALLOWED_ATTR,
  hardenLinks,
} from "./sanitize-shared";

let purify: typeof DOMPurify | null = null;

function getPurify(): typeof DOMPurify {
  if (purify) return purify;
  if (typeof window === "undefined") {
    // Server context without a window: fall back to a tag-stripping regex so
    // a synchronous call never throws. Server routes should use the async
    // variants in sanitize.server.ts for real DOMPurify sanitization.
    throw new Error("sanitize: no window available — use sanitize.server.ts on the server");
  }
  purify = DOMPurify(window);
  return purify;
}

export function sanitizeHtml(dirty: string): string {
  if (!dirty) return "";
  try {
    const clean = getPurify().sanitize(dirty, {
      ALLOWED_TAGS: BASE_ALLOWED_TAGS,
      ALLOWED_ATTR: BASE_ALLOWED_ATTR,
      ALLOW_DATA_ATTR: false,
      SANITIZE_DOM: true,
    }) as string;
    return hardenLinks(clean);
  } catch {
    return dirty.replace(/<[^>]*>/g, "");
  }
}

// For seasons only: allows <img> with safe src/alt/size attributes but still
// forbids styles, scripts, SVG/math, and all event/data attributes (anything
// not in the allowlist is removed).
export function sanitizeSeasonHtml(dirty: string): string {
  if (!dirty) return "";
  try {
    const clean = getPurify().sanitize(dirty, {
      ALLOWED_TAGS: SEASON_ALLOWED_TAGS,
      ALLOWED_ATTR: SEASON_ALLOWED_ATTR,
      ALLOW_DATA_ATTR: false,
      SANITIZE_DOM: true,
    }) as string;
    return hardenLinks(clean);
  } catch {
    return dirty.replace(/<[^>]*>/g, "");
  }
}
