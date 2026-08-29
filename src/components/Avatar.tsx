// Avatar tile — image when available, otherwise a pixel-art placeholder:
// the user's first letter in the Minecraft pixel font over a ghosted
// creeper-style face on their gradient tile. Broken image URLs fall back
// to the placeholder too. Sizes match the `.avatar` CSS (sm 36 · md 48 ·
// lg 72 · xl 96).

import { useState } from "react";

interface AvatarProps {
  /** Used for the letter fallback and as the image alt/title. */
  name: string;
  /** Optional image URL (e.g. a Minecraft skin head or Discord PFP). */
  src?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  /** Gradient tile class used when there's no image. */
  color?: string;
  className?: string;
  /** Shows an online/offline status dot when set. */
  online?: boolean;
}

const SIZES = { sm: "size-sm", md: "size-md", lg: "size-lg", xl: "size-xl" } as const;

export function Avatar({
  name,
  src,
  size = "md",
  color = "avatar-1",
  className = "",
  online,
}: AvatarProps) {
  // A src that fails to load (deleted Discord PFP, minotar hiccup) drops
  // to the placeholder instead of an empty tile. Track WHICH url failed so
  // a changed src (e.g. a fresh Discord PFP) gets retried instead of being
  // stuck on the fallback forever.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(src) && failedSrc !== src;

  return (
    <span
      className={`avatar ${SIZES[size]} ${color} ${className}`}
      role="img"
      aria-label={name}
      title={name}
    >
      {showImage ? (
        // Sized entirely by the .avatar wrapper's CSS (SIZES), so there are no
        // intrinsic width/height to hand next/image, and images.unoptimized is
        // on in next.config.ts — <img> is the right primitive here.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src ?? ""} alt="" loading="lazy" onError={() => setFailedSrc(src ?? null)} />
      ) : (
        <span className="avatar-fallback" aria-hidden="true">
          {/* Ghosted creeper-style pixel face (8×8, like a skin texture) */}
          <svg className="avatar-pixel-face" viewBox="0 0 8 8" preserveAspectRatio="none">
            <rect x="1" y="2" width="2" height="2" />
            <rect x="5" y="2" width="2" height="2" />
            <rect x="3" y="4" width="2" height="1" />
            <rect x="2" y="5" width="4" height="2" />
            <rect x="2" y="7" width="1" height="1" />
            <rect x="5" y="7" width="1" height="1" />
          </svg>
          <span className="avatar-letter">{name.charAt(0).toUpperCase()}</span>
        </span>
      )}
      {online !== undefined ? (
        <span className={online ? "status-online" : "status-offline"} aria-hidden="true" />
      ) : null}
    </span>
  );
}
