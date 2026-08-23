/**
 * Only allow same-site relative redirect targets — never off-site.
 *
 * Validated by parsing against a sentinel origin rather than prefix checks
 * alone: the WHATWG URL parser treats "\" as "/" and strips control
 * characters, so values like "/\evil.com" or "/\n//evil.com" resolve to
 * https://evil.com while still starting with "/". Callers must pass an
 * already-percent-DECODED value (URLSearchParams output, or a decoded
 * cookie), because the control-char/backslash rejection runs pre-parse.
 */
const SENTINEL = "https://redirect-target.invalid";

export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  // Backslash-as-slash and control-character smuggling (tab/newline/etc.)
  // must never reach the URL parser as part of a redirect target.
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw, SENTINEL);
  } catch {
    return null;
  }
  if (parsed.origin !== SENTINEL) return null;
  return raw;
}
