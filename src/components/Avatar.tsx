// Avatar tile — image when available, otherwise a pixel-art placeholder:
// the user's first letter in the Minecraft pixel font over a ghosted
// creeper-style face on their gradient tile. Sizes match the `.avatar`
// CSS (sm 36 · md 48 · lg 72 · xl 96).

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
  return (
    <span
      className={`avatar ${SIZES[size]} ${color} ${className}`}
      role="img"
      aria-label={name}
      title={name}
    >
      {src ? (
        <img src={src} alt="" loading="lazy" />
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
