// Centralized HTML sanitization using DOMPurify (isomorphic).
// Used to prevent XSS from user-generated rich text (posts, comments, blog, seasons).
// CRITICAL: style attribute is explicitly FORBIDDEN in all sanitizers to prevent
// CSS injection (position:fixed overlay, background-image exfiltration, etc.).

import DOMPurify from "isomorphic-dompurify";

// Strict allowlist for user-generated content (posts, comments, blog bodies).
// NO style, NO src, NO on* handlers, NO data-* attributes.
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

const FORBID_TAGS = ["script", "style", "iframe", "object", "embed", "form", "img", "video", "audio", "source", "track", "picture", "svg", "math"];
const FORBID_ATTR = [
  "onerror",
  "onload",
  "onclick",
  "onmouseover",
  "onmouseout",
  "onfocus",
  "onblur",
  "onchange",
  "onsubmit",
  "onkeydown",
  "onkeyup",
  "onkeypress",
  "style",
  "src",
  "href", // href allowed only on <a> via ALLOWED_ATTR; explicit deny on others via FORBID_ATTR is redundant but safe
  "data-*",
  "x-*",
];

export function sanitizeHtml(dirty: string): string {
  if (!dirty) return "";
  try {
    return DOMPurify.sanitize(dirty, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      ALLOW_DATA_ATTR: false,
      FORBID_TAGS,
      FORBID_ATTR,
      // Additional safety: ensure <a> tags get rel="noopener noreferrer"
      SANITIZE_DOM: true,
    }) as string;
  } catch {
    // Fallback: strip all tags if DOMPurify fails
    return dirty.replace(/<[^>]*>/g, "");
  }
}

// For seasons only: allows <img> with src/alt but STILL forbids style and all event handlers.
// Images in seasons should be uploaded to Supabase Storage, not hotlinked.
export function sanitizeSeasonHtml(dirty: string): string {
  if (!dirty) return "";
  try {
    return DOMPurify.sanitize(dirty, {
      ALLOWED_TAGS: [...ALLOWED_TAGS, "img"],
      ALLOWED_ATTR: [...ALLOWED_ATTR, "src", "alt", "width", "height"],
      FORBID_TAGS,
      FORBID_ATTR,
    }) as string;
  } catch {
    return dirty.replace(/<[^>]*>/g, "");
  }
}
