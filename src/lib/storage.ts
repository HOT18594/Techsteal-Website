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
 */
export async function uploadImage(buffer: Buffer, mime: string, originalName: string): Promise<string> {
  if (!ALLOWED_MIME.includes(mime as (typeof ALLOWED_MIME)[number])) {
    throw new Error("Unsupported image type.");
  }
  const url = supabaseUrl();
  const key = serviceRoleKey();

  // Safe file extension from the mime, with a random suffix to avoid collisions.
  const base = (originalName || "image").replace(/[^\w.-]/g, "").slice(0, 60);
  const ext = MIME_EXT[mime] ?? "jpg";
  const path = `gallery/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${base}.${ext}`;

  const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": mime,
      "x-upsert": "true",
    },
    body: Uint8Array.from(buffer),
  });

  if (!res.ok) {
    throw new Error(`Upload failed (${res.status}).`);
  }

  return `${url}/storage/v1/object/public/${BUCKET}/${path}`;
}