// Shared sanitization config used by both the sync client sanitizer
// (sanitize.ts) and the async server sanitizer (sanitize.server.ts).

export const BASE_ALLOWED_TAGS = [
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

export const BASE_ALLOWED_ATTR = ["href", "target", "rel", "class"];

// We rely on ALLOWED_TAGS / ALLOWED_ATTR as an explicit allowlist rather than
// FORBID_TAGS/FORBID_ATTR. DOMPurify treats ALLOWED and FORBID as mutually
// exclusive — supplying both produces inconsistent output (tags in the
// allowlist can still be stripped). An allowlist is also stricter: anything
// not listed is removed, so <script>/<img>/<iframe> etc. are dropped by default.
// ALLOW_DATA_ATTR: false already blocks all data-* attributes.

export const SEASON_ALLOWED_TAGS = [...BASE_ALLOWED_TAGS, "img"];
export const SEASON_ALLOWED_ATTR = [
  ...BASE_ALLOWED_ATTR,
  "src",
  "alt",
  "width",
  "height",
  "loading",
];

export function hardenLinks(html: string): string {
  return html.replace(/<a\b([^>]*)>/gi, (match) => {
    if (/\btarget\s*=\s*["']?_blank/i.test(match) && !/\brel\s*=/i.test(match)) {
      return match.replace(/>$/, ' rel="noopener noreferrer">');
    }
    return match;
  });
}
