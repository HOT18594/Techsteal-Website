// Server-only HTML sanitization. API routes use these async variants instead of
// the sync `sanitizeHtml`/`sanitizeSeasonHtml` in `@/lib/sanitize`, because the
// server has no global `window` and must lazily create a JSDOM one.
//
// jsdom is imported dynamically (not statically) so it stays out of the route's
// module-load graph and out of the client bundle. This is what fixes the 500s
// on post/blog creation: the old `isomorphic-dompurify` eagerly required jsdom
// at module load, and its transitive `@exodus/bytes` (ESM-only) crashed Next.js
// API routes with ERR_REQUIRE_ESM.

import DOMPurify from "dompurify";
import {
  BASE_ALLOWED_TAGS,
  BASE_ALLOWED_ATTR,
  SEASON_ALLOWED_TAGS,
  SEASON_ALLOWED_ATTR,
  hardenLinks,
} from "./sanitize-shared";

let purify: typeof DOMPurify | null = null;
let purifyPromise: Promise<typeof DOMPurify> | null = null;

async function getPurify(): Promise<typeof DOMPurify> {
  if (purify) return purify;
  if (!purifyPromise) {
    purifyPromise = (async () => {
      // Browser/test (jsdom) environment — a global window already exists.
      if (typeof window !== "undefined") {
        purify = DOMPurify(window);
        return purify;
      }
      // Node server: create a minimal JSDOM window.
      const { JSDOM } = await import("jsdom");
      const dom = new JSDOM("<!DOCTYPE html>");
      purify = DOMPurify(dom.window);
      return purify;
    })();
  }
  const p = await purifyPromise;
  purifyPromise = null;
  return p;
}

export async function sanitizeHtmlAsync(dirty: string): Promise<string> {
  if (!dirty) return "";
  try {
    const clean = (await getPurify()).sanitize(dirty, {
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

export async function sanitizeSeasonHtmlAsync(dirty: string): Promise<string> {
  if (!dirty) return "";
  try {
    const clean = (await getPurify()).sanitize(dirty, {
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
