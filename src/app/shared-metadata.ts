// Shared metadata fields for nested segments.
//
// Next.js merges the metadata exported by layouts/pages *shallowly*: a page
// that sets `openGraph` (or `alternates`) replaces the root layout's whole
// object instead of merging into it. Pulling the shared nested fields out
// here — the pattern from Next's metadata docs — lets dynamic pages keep the
// social image and the site-wide RSS link while overriding title/description.

import type { Metadata } from "next";

/** Hero image used for social share cards (same asset as the root layout). */
export const SHARE_IMAGES = ["/techsteal-hero.jpeg"];

/** Root layout's site-wide RSS alternate link. */
export const RSS_ALTERNATE_TYPES: NonNullable<Metadata["alternates"]>["types"] = {
  "application/rss+xml": "/forum/rss.xml",
};
