"use client";

// Single upload helper for every client that posts an image to /api/upload.
//
// fetch() reports no progress for request bodies, so this uses XMLHttpRequest
// to drive real progress bars. It was previously copy-pasted into RichEditor
// and the gallery composer, and the copies had already drifted (the gallery
// one was missing its `onabort` handler, so an aborted upload never settled
// its promise and left the composer spinning forever).

/**
 * POST `file` to /api/upload, resolving with the stored public URL.
 *
 * @param onProgress Called with 0–100 as the body uploads.
 * @param registry   Optional set the request registers itself in, so the
 *                   owner can abort in-flight uploads on unmount. Aborting
 *                   rejects with `new Error("aborted")` — callers treat that
 *                   as intentional cleanup, not a user-facing failure.
 */
export function xhrUpload(
  file: File,
  onProgress: (pct: number) => void,
  registry?: Set<XMLHttpRequest>
): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = new FormData();
    body.set("image", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.timeout = 60_000;
    const settle = () => registry?.delete(xhr);
    xhr.ontimeout = () => {
      settle();
      reject(new Error("Upload timed out — try again."));
    };
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      settle();
      try {
        const data = JSON.parse(xhr.responseText) as { url?: string; error?: string };
        if (xhr.status >= 200 && xhr.status < 300 && data.url) resolve(data.url);
        else reject(new Error(data.error ?? `Upload failed (${xhr.status})`));
      } catch {
        reject(new Error("Upload failed"));
      }
    };
    xhr.onerror = () => {
      settle();
      reject(new Error("Upload failed — check your connection."));
    };
    xhr.onabort = () => {
      settle();
      reject(new Error("aborted"));
    };
    registry?.add(xhr);
    xhr.send(body);
  });
}
