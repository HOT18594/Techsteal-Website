import { describe, expect, it } from "vitest";
import { sanitizeHtml, sanitizeSeasonHtml } from "@/lib/sanitize";

describe("HTML sanitization", () => {
  it("keeps safe links while removing dangerous link payloads", () => {
    expect(sanitizeHtml('<p><a href="https://example.com" target="_blank">safe</a></p>')).toContain(
      'href="https://example.com"'
    );
    expect(sanitizeHtml('<p><a href="javascript:alert(1)" onclick="alert(1)">bad</a></p>')).not.toContain(
      "javascript:"
    );
    expect(sanitizeHtml('<p><a href="https://example.com" onclick="alert(1)">safe</a></p>')).not.toContain(
      "onclick"
    );
  });

  it("keeps safe season images but strips unsafe image attributes", () => {
    const clean = sanitizeSeasonHtml(
      '<p><img src="https://example.com/guide.png" alt="Guide" onerror="alert(1)" style="position:fixed"></p>'
    );
    expect(clean).toContain("<img");
    expect(clean).toContain('src="https://example.com/guide.png"');
    expect(clean).toContain('alt="Guide"');
    expect(clean).not.toContain("onerror");
    expect(clean).not.toContain("style");
  });

  it("removes dangerous tags and CSS injection from normal user content", () => {
    const clean = sanitizeHtml('<script>alert(1)</script><p style="position:fixed">Hello</p><img src="https://x.test/a.png">');
    expect(clean).not.toContain("script");
    expect(clean).not.toContain("style");
    expect(clean).not.toContain("<img");
    expect(clean).toContain("Hello");
  });
});
