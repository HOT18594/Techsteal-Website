// Server-side image upload to Supabase Storage (the site's host, shared with
// the Postgres connection). Uses the Storage REST API via `fetch` — no extra
// dependency — authenticated with the service role key (server-only, never
// exposed to the browser). Server-to-Supabase requests avoid browser CORS.

import { createHash } from "node:crypto";
import { type AnyColumn, ilike, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { forumReplies, forumThreads, galleryComments, galleryItems } from "@/lib/schema";

const BUCKET = "gallery";

/** Image types accepted for gallery posts. */
export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

/** Max server-accepted upload size (8 MB). */
export const MAX_BYTES = 8 * 1024 * 1024;

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * Sniff the file's magic bytes to confirm it really is the image type it
 * claims. The client-supplied Content-Type alone must never be trusted —
 * otherwise the public bucket becomes a free host for arbitrary files
 * (HTML/SVG payloads, malware) served from the site's storage domain.
 */
export function sniffImageMime(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
  ) {
    return "image/png";
  }
  if (buffer.toString("ascii", 0, 3) === "GIF") {
    return "image/gif";
  }
  if (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function supabaseUrl(): string {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  if (!url) throw new Error("SUPABASE_URL is not configured");
  return url;
}

function serviceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return key;
}

/**
 * Opaque per-uploader path segment. The raw Discord id must not appear in
 * public URLs; the hash lets garbage collection verify ownership without a
 * database lookup.
 */
export function ownerToken(ownerId: string): string {
  return createHash("sha256").update(ownerId).digest("hex").slice(0, 12);
}

/**
 * Upload raw image bytes to the public `gallery` bucket and return its stable
 * public URL. Throws a descriptive Error when storage isn't configured or the
 * upload fails so the API route can surface a clean message.
 *
 * `folder` separates gallery posts (`gallery/`) from forum embeds (`embeds/`)
 * inside the same bucket. `ownerId` is baked into the path as a hash so the
 * delete paths can refuse to garbage-collect objects the deleter didn't
 * upload — any member can reference any public bucket URL in their content,
 * and without this check deleting their own post destroyed other people's
 * images.
 */
export async function uploadImage(
  buffer: Buffer,
  mime: string,
  originalName: string,
  folder = "gallery",
  ownerId: string
): Promise<string> {
  if (!ALLOWED_MIME.includes(mime as (typeof ALLOWED_MIME)[number])) {
    throw new Error("Unsupported image type.");
  }
  const url = supabaseUrl();
  const key = serviceRoleKey();

  // Safe file extension from the mime, with a random suffix to avoid collisions.
  // Consecutive dots collapse to one: the delete path (`storagePathFromUrl`)
  // rejects any path containing ".." as traversal defense, so a stored key
  // like "my...build.png" could never be garbage-collected (a silent,
  // permanent storage leak for every such upload).
  const base =
    (originalName || "image")
      .replace(/\.[^.]+$/, "")
      .replace(/[^\w.-]/g, "")
      .replace(/^[.]+/, "")
      .replace(/\.{2,}/g, ".")
      .slice(0, 60) || "image";
  const ext = MIME_EXT[mime] ?? "jpg";
  const path = `${folder}/${ownerToken(ownerId)}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${base}.${ext}`;

  const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": mime,
      "x-upsert": "true",
    },
    body: Uint8Array.from(buffer),
    // A stalled Supabase must not hold the upload route open until the
    // platform timeout — fail with a clean message instead.
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    throw new Error(`Upload failed (${res.status}).`);
  }
  await res.body?.cancel().catch(() => {});

  return `${url}/storage/v1/object/public/${BUCKET}/${path}`;
}

/**
 * Turn a public storage URL back into its object path inside the bucket.
 * Returns null for URLs that don't belong to our bucket on our project — a
 * legacy/external image URL (or a crafted one) must never make us issue a
 * delete against an arbitrary path.
 */
export function storagePathFromUrl(publicUrl: string): string | null {
  let base: string;
  try {
    base = supabaseUrl();
  } catch {
    return null;
  }
  const prefix = `${base}/storage/v1/object/public/${BUCKET}/`;
  if (!publicUrl.startsWith(prefix)) return null;
  const rawPath = publicUrl.slice(prefix.length).split(/[?#]/)[0];
  if (!rawPath) return null;
  let decoded = rawPath;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  // No traversal, no empty path, no leading/double slashes.
  if (
    !decoded ||
    rawPath.includes("..") ||
    decoded.includes("..") ||
    decoded.startsWith("/") ||
    decoded.includes("//")
  ) {
    return null;
  }
  // Return the DECODED path, because that is the object key Supabase speaks:
  // public URLs are percent-encoded ("my%20build.png") while list/delete use
  // raw keys ("my build.png"). Returning the encoded spelling made reference
  // checks miss and the orphan cleaner could delete a live image.
  return decoded;
}

/**
 * Pull every URL that points into our own public bucket out of a blob of
 * markdown/content. Forum posts embed images inline in their text (unlike
 * gallery posts, which keep them in columns), so deleting a thread needs
 * this to garbage-collect the bucket — otherwise every embed outlived its
 * post forever. Trailing sentence punctuation is trimmed so a "…png." match
 * still resolves.
 */
export function extractStorageUrls(content: string): string[] {
  if (!content) return [];
  const candidates = content.match(/https?:\/\/[^\s<>"')\]]+/g) ?? [];
  return candidates
    .map((u) => u.replace(/[.,;:!?]+$/, ""))
    .filter((u) => storagePathFromUrl(u) !== null);
}

/**
 * Every bucket path still referenced by live content (forum posts/replies,
 * gallery covers/images/descriptions, gallery comments). Returns null when
 * the scan fails — callers must then NOT delete anything, because an
 * incomplete reference list would destroy images other posts still use.
 */
export async function referencedStoragePaths(): Promise<Set<string> | null> {
  const db = getDb();
  // No database configured → no rows exist that could reference an object.
  if (!db) return new Set();
  try {
    const [threads, replies, items, comments] = await Promise.all([
      db.select({ content: forumThreads.content }).from(forumThreads),
      db.select({ content: forumReplies.content }).from(forumReplies),
      db
        .select({
          image: galleryItems.image,
          images: galleryItems.images,
          description: galleryItems.description,
        })
        .from(galleryItems),
      db.select({ content: galleryComments.content }).from(galleryComments),
    ]);
    const refs = new Set<string>();
    const addUrl = (u: string) => {
      const path = storagePathFromUrl(u);
      if (path) refs.add(path);
    };
    for (const row of [...threads, ...replies, ...comments]) {
      for (const u of extractStorageUrls(row.content)) addUrl(u);
    }
    for (const item of items) {
      addUrl(item.image);
      for (const u of item.images) addUrl(u);
      for (const u of extractStorageUrls(item.description)) addUrl(u);
    }
    return refs;
  } catch (err) {
    console.error("storage: reference scan failed", err);
    return null;
  }
}

/**
 * List every object path in the bucket (recursing into folders). Returns
 * null when storage isn't configured or the listing fails. Used by the
 * orphan-cleanup script; the Supabase list endpoint caps pages at 1000.
 */
export async function listStorageObjects(): Promise<string[] | null> {
  let url: string;
  let key: string;
  try {
    url = supabaseUrl();
    key = serviceRoleKey();
  } catch {
    return null;
  }
  const out: string[] = [];
  const walk = async (folder: string): Promise<void> => {
    let offset = 0;
    for (;;) {
      const res = await fetch(`${url}/storage/v1/object/list/${BUCKET}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prefix: folder,
          limit: 1000,
          offset,
          sortBy: { column: "name", order: "asc" },
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        throw new Error(`list failed (${res.status})`);
      }
      const entries = (await res.json()) as Array<{ name: string; id: string | null }>;
      for (const entry of entries) {
        const path = folder ? `${folder}/${entry.name}` : entry.name;
        // Folders come back with a null id — recurse instead of listing them
        // as objects.
        if (entry.id === null) await walk(path);
        else out.push(path);
      }
      if (entries.length < 1000) break;
      offset += entries.length;
    }
  };
  try {
    await walk("");
    return out;
  } catch (err) {
    console.error("storage: list request failed", err);
    return null;
  }
}

/**
 * Raw delete by bucket path — no ownership or reference checks. Callers
 * must gate first (deleteImagesByUrl does; the cleanup script is admin-run).
 * Best-effort: failures are logged, never thrown.
 */
export async function deleteStorageObjects(paths: string[]): Promise<number> {
  if (paths.length === 0) return 0;
  let url: string;
  let key: string;
  try {
    url = supabaseUrl();
    key = serviceRoleKey();
  } catch {
    return 0; // storage not configured — nothing to clean up
  }
  try {
    const res = await fetch(`${url}/storage/v1/object/${BUCKET}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefixes: paths }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      console.error(`storage: delete failed (${res.status}) for ${paths.length} object(s)`);
      return 0;
    }
    const deleted = (await res.json().catch(() => null)) as unknown;
    return Array.isArray(deleted) ? deleted.length : paths.length;
  } catch (err) {
    console.error("storage: delete request failed", err);
    return 0;
  }
}

/**
 * Delete gallery/embed objects by their public URLs. Best-effort: a failed
 * delete is logged, never thrown, because the DB rows are already gone and
 * failing the request would leave the user staring at an error for a post
 * that no longer exists. URLs outside our bucket are ignored.
 *
 * Ownership gate: content can reference ANY public bucket URL (gallery posts
 * and forum embeds alike), so deleting rows must only destroy objects the
 * actor uploaded — otherwise a member could embed a victim's image, delete
 * their own post, and take the victim's file with it. New uploads carry an
 * owner-token path segment; legacy objects (no token) are admin-only.
 *
 * Reference gate: the same object can be embedded in several posts, so an
 * owned URL is only destroyed when no live row references it anymore. Must
 * be called AFTER the row mutation, or the deleted row still "references"
 * its own images and nothing is ever collected.
 *
 * Returns the number of objects Supabase reported as deleted.
 */
function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Percent-encoded spelling of a bucket path, as it appears inside a public
 *  URL. Per-segment so folder slashes stay slashes. */
function encodeStoragePath(path: string): string {
  return path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

/**
 * Targeted reference check for a small set of candidate paths (used on post
 * delete/edit so we only fetch rows mentioning those paths rather than full-
 * scanning all four tables into Node memory). Returns null on DB failure so
 * callers fail closed and keep every candidate object.
 */
export async function referencedStoragePathsForCandidates(
  candidates: string[]
): Promise<Set<string> | null> {
  if (candidates.length === 0) return new Set();
  const db = getDb();
  if (!db) return new Set();
  try {
    // Candidates are decoded bucket paths (storagePathFromUrl), but stored
    // content holds percent-encoded public URLs — match BOTH spellings or a
    // live encoded reference would look unused and get deleted.
    const patterns = candidates.flatMap((p) => {
      const encoded = encodeStoragePath(p);
      return encoded === p
        ? [`%${escapeLikePattern(p)}%`]
        : [`%${escapeLikePattern(p)}%`, `%${escapeLikePattern(encoded)}%`];
    });
    const matchText = (col: AnyColumn) =>
      or(...patterns.map((pat) => ilike(col, pat)))!;
    const matchGallery = or(
      ...patterns.flatMap((pat) => [
        ilike(galleryItems.image, pat),
        ilike(galleryItems.description, pat),
        sql`${galleryItems.images}::text ilike ${pat}`,
      ])
    )!;

    const [threads, replies, items, comments] = await Promise.all([
      db.select({ content: forumThreads.content }).from(forumThreads).where(matchText(forumThreads.content)),
      db.select({ content: forumReplies.content }).from(forumReplies).where(matchText(forumReplies.content)),
      db
        .select({
          image: galleryItems.image,
          images: galleryItems.images,
          description: galleryItems.description,
        })
        .from(galleryItems)
        .where(matchGallery),
      db.select({ content: galleryComments.content }).from(galleryComments).where(matchText(galleryComments.content)),
    ]);

    const candidateSet = new Set(candidates);
    const refs = new Set<string>();
    const addUrl = (u: string) => {
      const path = storagePathFromUrl(u);
      if (path && candidateSet.has(path)) refs.add(path);
    };
    for (const row of [...threads, ...replies, ...comments]) {
      for (const u of extractStorageUrls(row.content)) addUrl(u);
    }
    for (const item of items) {
      addUrl(item.image);
      for (const u of item.images ?? []) addUrl(u);
      for (const u of extractStorageUrls(item.description)) addUrl(u);
    }
    return refs;
  } catch (err) {
    console.error("storage: candidate reference scan failed", err);
    return null;
  }
}

export async function deleteImagesByUrl(
  publicUrls: string[],
  actor: { id: string; isAdmin: boolean }
): Promise<number> {
  const token = ownerToken(actor.id);
  const owned = [
    ...new Set(
      publicUrls
        .map((u) => (typeof u === "string" ? storagePathFromUrl(u) : null))
        .filter((p): p is string => Boolean(p))
    ),
  ].filter((p) => {
    const segments = p.split("/");
    // folder/<ownerToken>/<file> — owned upload; folder/<file> — legacy.
    if (segments.length === 3) return actor.isAdmin || segments[1] === token;
    return actor.isAdmin;
  });
  if (owned.length === 0) return 0;

  const refs = await referencedStoragePathsForCandidates(owned);
  // Scan failed → we can't prove an object is unused, so keep everything.
  if (refs === null) return 0;
  const orphans = owned.filter((p) => !refs.has(p));
  return deleteStorageObjects(orphans);
}