"use client";

// Client-side image compression. Minecraft screenshots are multi-megabyte
// PNGs; downscaling to ≤1920px and re-encoding as WebP/JPEG in the browser
// typically cuts uploads (and everyone's load times) by 80–95%.
//
// GIFs skip compression — re-encoding through <canvas> would freeze the
// animation into its first frame.

export interface CompressResult {
  file: File;
  /** True when the file was actually re-encoded (false = passed through). */
  compressed: boolean;
}

export async function compressImage(
  file: File,
  maxDim = 1920,
  quality = 0.85
): Promise<File> {
  return (await compressImageDetailed(file, maxDim, quality)).file;
}

export async function compressImageDetailed(
  file: File,
  maxDim = 1920,
  quality = 0.85
): Promise<CompressResult> {
  if (file.type === "image/gif") return { file, compressed: false };
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return { file, compressed: false };

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { file, compressed: false }; // undecodable → let the server sniff it
  }

  try {
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const alreadySmall = scale === 1 && file.size < 400_000;
    if (alreadySmall) return { file, compressed: false };

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return { file, compressed: false };
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    // WebP everywhere it's supported; JPEG as the fallback (older Safari).
    let blob = await toBlob(canvas, "image/webp", quality);
    if (!blob || blob.type !== "image/webp") {
      // JPEG has no alpha — flatten transparency onto white first.
      const flat = document.createElement("canvas");
      flat.width = canvas.width;
      flat.height = canvas.height;
      const fctx = flat.getContext("2d");
      if (!fctx) return { file, compressed: false };
      fctx.fillStyle = "#ffffff";
      fctx.fillRect(0, 0, flat.width, flat.height);
      fctx.drawImage(canvas, 0, 0);
      blob = await toBlob(flat, "image/jpeg", quality);
      if (!blob) return { file, compressed: false };
    }
    // Never "compress" into something larger than the original.
    if (blob.size >= file.size) return { file, compressed: false };

    const ext = blob.type === "image/webp" ? ".webp" : ".jpg";
    const name = `${file.name.replace(/\.[^.]+$/, "").replace(/[^\w.-]/g, "").slice(0, 60) || "image"}${ext}`;
    return { file: new File([blob], name, { type: blob.type }), compressed: true };
  } finally {
    bitmap.close();
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}
