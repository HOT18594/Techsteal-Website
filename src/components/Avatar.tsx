// Avatar tile — Minecraft skin head when available, letter fallback.
// Sizes match the `.avatar` CSS (sm 36 · md 48 · lg 72 · xl 96).

interface AvatarProps {
  /** Used for the letter fallback and as the image alt/title. */
  name: string;
  /** Optional image URL (e.g. a Minecraft skin head). */
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
        <span aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
      )}
      {online !== undefined ? (
        <span className={online ? "status-online" : "status-offline"} aria-hidden="true" />
      ) : null}
    </span>
  );
}
