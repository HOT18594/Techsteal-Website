// Client-safe: the gallery page (a client component) imports this, so it
// must stay free of server-only modules — it used to live in lib/storage.ts
// until that file gained a database import for reference-counting GC.

/** Categories a user can choose when posting (matches the gallery page filter). */
export const GALLERY_CATEGORIES = ["Builds", "Redstone", "Technical", "Ideas", "Showcase"] as const;