// Server-side image upload to Supabase Storage (the site's host, shared with
// the Postgres connection). Uses the Storage REST API via `fetch` — no extra
// dependency — authenticated with the service role key (server-only, never
// exposed to the browser). Server-to-Supabase requests avoid browser CORS.

const BUCKET = "gallery";

/** Image types accepted for gallery posts. */
export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

/** Max server-accepted upload size (8 MB). */
export const MAX_BYTES = 8 * 1024 * 1024;

/** Categories a user can choose when posting (matches the gallery page filter). */
export const GALLERY_CATEGORIES = ["Builds", "Redstone", "Technical", "Ideas", "Showcase"] as const;

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
 * Upload raw image bytes to the public `gallery` bucket and return its stable
 * public URL. Throws a descriptive Error when storage isn't configured or the
 * upload fails so the API route can surface a clean message.
 *
 * `folder` separates gallery posts (`gallery/`) from forum embeds (`embeds/`)
 * inside the same bucket.
 */
export async function uploadImage(
  buffer: Buffer,
  mime: string,
  originalName: string,
  folder = "gallery"
): Promise<string> {
  if (!ALLOWED_MIME.includes(mime as (typeof ALLOWED_MIME)[number])) {
    throw new Error("Unsupported image type.");
  }
  const url = supabaseUrl();
  const key = serviceRoleKey();

  // Safe file extension from the mime, with a random suffix to avoid collisions.
  const base = (originalName || "image").replace(/[^\w.-]/g, "").replace(/^[.]+/, "").slice(0, 60) || "image";
  const ext = MIME_EXT[mime] ?? "jpg";
  const path = `${folder}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${base}.${ext}`;

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

  return `${url}/storage/v1/object/public/${BUCKET}/${path}`;
}