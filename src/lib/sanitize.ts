// Centralized HTML sanitization using DOMPurify (isomorphic).
// Used to prevent XSS from user-generated rich text (posts, comments, blog, seasons).

import DOMPurify from "isomorphic-dompurify";

// Allow basic rich text only - no scripts, no event handlers, no iframes.
const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "ul",
  "ol",
  "li",
  "blockquote",
  "a",
  "code",
  "pre",
  "span",
  "div",
  "h1",
  "h2",
  "h3",
];

const ALLOWED_ATTR = ["href", "target", "rel", "class"];

export function sanitizeHtml(dirty: string): string {
  if (!dirty) return "";
  try {
    return DOMPurify.sanitize(dirty, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      ALLOW_DATA_ATTR: false,
      FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "img"],
      FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "style", "src"],
    }) as string;
  } catch {
    // Fallback: strip all tags if DOMPurify fails
    return dirty.replace(/<[^>]*>/g, "");
  }
}

// For cases where we want to allow images (not in body), but still sanitize.
// We do NOT allow <img> in rich text bodies - images are handled via uploads array.
export function sanitizeSeasonHtml(dirty: string): string {
  if (!dirty) return "";
  try {
    return DOMPurify.sanitize(dirty, {
      ALLOWED_TAGS: [...ALLOWED_TAGS, "img"],
      ALLOWED_ATTR: [...ALLOWED_ATTR, "src", "alt"],
      FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form"],
      FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
    }) as string;
  } catch {
    return dirty.replace(/<[^>]*>/g, "");
  }
}
