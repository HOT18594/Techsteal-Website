"use client";

// The copyright year must be computed in the browser: the Footer is a
// server component, so a server-rendered year is baked into prerendered
// HTML and goes stale on January 1 until the next deploy.
// suppressHydrationWarning absorbs the (rare) server/client year mismatch.

export function CopyrightYear() {
  return <span suppressHydrationWarning>{new Date().getFullYear()}</span>;
}
