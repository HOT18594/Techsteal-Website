// Centralized HTML sanitization using DOMPurify (isomorphic).
// Used to prevent XSS from user-generated rich text (posts, comments, blog, seasons).
// Keep normal user content and season instructions on separate configs so contextual
// attributes such as href/src are not accidentally forbidden everywhere.

import DOMPurify from "isomorphic-dompurify";

const BASE_ALLOWED_TAGS = [
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

const BASE_ALLOWED_ATTR = ["href", "target", "rel", "class"];

const NORMAL_FORBID_TAGS = [
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
  "img",
  "video",
  "audio",
  "source",
  "track",
  "picture",
  "svg",
  "math",
];

const SEASON_FORBID_TAGS = NORMAL_FORBID_TAGS.filter((tag) => tag !== "img");

const COMMON_FORBID_ATTR = [
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
  "data-*",
  "x-*",
];

function hardenLinks(html: string): string {
  return html.replace(/<a\b([^>]*)>/gi, (match) => {
    if (/\btarget\s*=\s*["']?_blank/i.test(match) && !/\brel\s*=/i.test(match)) {
      return match.replace(/>$/, ' rel="noopener noreferrer">');
    }
    return match;
  });
}

export function sanitizeHtml(dirty: string): string {
  if (!dirty) return "";
  try {
    const clean = DOMPurify.sanitize(dirty, {
      ALLOWED_TAGS: BASE_ALLOWED_TAGS,
      ALLOWED_ATTR: BASE_ALLOWED_ATTR,
      ALLOW_DATA_ATTR: false,
      FORBID_TAGS: NORMAL_FORBID_TAGS,
      FORBID_ATTR: COMMON_FORBID_ATTR,
      SANITIZE_DOM: true,
    }) as string;
    return hardenLinks(clean);
  } catch {
    return dirty.replace(/<[^>]*>/g, "");
  }
}

// For seasons only: allows <img> with safe src/alt/size attributes but still forbids
// styles, scripts, SVG/math, and all event/data attributes.
export function sanitizeSeasonHtml(dirty: string): string {
  if (!dirty) return "";
  try {
    const clean = DOMPurify.sanitize(dirty, {
      ALLOWED_TAGS: [...BASE_ALLOWED_TAGS, "img"],
      ALLOWED_ATTR: [...BASE_ALLOWED_ATTR, "src", "alt", "width", "height", "loading"],
      ALLOW_DATA_ATTR: false,
      FORBID_TAGS: SEASON_FORBID_TAGS,
      FORBID_ATTR: COMMON_FORBID_ATTR,
      SANITIZE_DOM: true,
    }) as string;
    return hardenLinks(clean);
  } catch {
    return dirty.replace(/<[^>]*>/g, "");
  }
}
