"use client";

import { useEffect, useState } from "react";

// The copyright year must be computed in the browser: the Footer is a
// server component, so a server-rendered year is baked into prerendered
// HTML and goes stale on January 1 until the next deploy. A stateless
// render of `new Date().getFullYear()` would be baked at build time and
// never re-render, so opt in on the client after mount instead.
// suppressHydrationWarning absorbs the (rare) server/client year mismatch.

export function CopyrightYear() {
  const [year, setYear] = useState<number | null>(null);

  useEffect(() => {
    setYear(new Date().getFullYear());
  }, []);

  return <span suppressHydrationWarning>{year ?? ""}</span>;
}
