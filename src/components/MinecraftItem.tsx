"use client";

import { useState } from "react";
import { resolveItemAsset, splitItemId } from "@/lib/mc-assets";
import type { DecodedItemStack } from "@/lib/mc-playerdata";

function SpecialMinecraftSvg({
  type,
  color = "#8932b8",
  variant,
  size,
}: {
  type: string;
  color?: string;
  variant?: string;
  size: number;
}) {
  if (type === "shulker_box") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" style={{ imageRendering: "pixelated" }}>
        <polygon points="8,1 14,4.5 8,8 2,4.5" fill={color} />
        <polygon points="2,4.5 8,8 8,15 2,11.5" fill={color} style={{ filter: "brightness(0.8)" }} />
        <polygon points="8,8 14,4.5 14,11.5 8,15" fill={color} style={{ filter: "brightness(0.62)" }} />
        <line x1="2" y1="8.2" x2="8" y2="11.6" stroke="#18181b" strokeWidth="0.9" strokeOpacity="0.65" />
        <line x1="8" y1="11.6" x2="14" y2="8.2" stroke="#18181b" strokeWidth="0.9" strokeOpacity="0.65" />
      </svg>
    );
  }
  if (type === "chest" || type === "trapped_chest" || type === "ender_chest" || type === "copper_chest") {
    const isEnder = type === "ender_chest";
    const isCopper = type === "copper_chest";
    const body = isEnder ? "#1f3338" : isCopper ? "#c06b48" : "#a8742a";
    const border = isEnder ? "#101c20" : isCopper ? "#6d3b27" : "#5c3d13";
    const latch = isEnder ? "#d8c85a" : type === "trapped_chest" ? "#dc2626" : "#d4d4d8";
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" style={{ imageRendering: "pixelated" }}>
        <polygon points="8,1.5 14,4.8 8,8.1 2,4.8" fill={body} stroke={border} strokeWidth="0.6" />
        <polygon points="2,4.8 8,8.1 8,14.5 2,11.2" fill={body} style={{ filter: "brightness(0.84)" }} stroke={border} strokeWidth="0.6" />
        <polygon points="8,8.1 14,4.8 14,11.2 8,14.5" fill={body} style={{ filter: "brightness(0.68)" }} stroke={border} strokeWidth="0.6" />
        <line x1="2" y1="7.5" x2="8" y2="10.8" stroke={border} strokeWidth="0.8" />
        <line x1="8" y1="10.8" x2="14" y2="7.5" stroke={border} strokeWidth="0.8" />
        <rect x="4.2" y="8.1" width="1.8" height="2.4" fill={latch} />
      </svg>
    );
  }
  if (type === "shield") {
    const face = color || "#9d713c";
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" style={{ imageRendering: "pixelated" }}>
        <rect x="3" y="1" width="10" height="14" rx="1" fill="#7c7f85" />
        <rect x="4.5" y="2.5" width="7" height="11" fill={face} />
        <rect x="4" y="2" width="1" height="12" fill="#a1a1aa" fillOpacity="0.45" />
        <rect x="7.5" y="5" width="1" height="6" fill="#27272a" fillOpacity="0.35" />
      </svg>
    );
  }
  if (type === "banner") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" style={{ imageRendering: "pixelated" }}>
        <rect x="7" y="1" width="2" height="14" fill="#8b6239" />
        <rect x="4" y="2" width="8" height="10" fill={color} stroke="#18181b" strokeWidth="0.6" />
      </svg>
    );
  }
  if (type === "bed") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" style={{ imageRendering: "pixelated" }}>
        <polygon points="1,9 9,5 15,8 7,12" fill={color} />
        <polygon points="9,5 12,3.5 15,5 12,6.5" fill="#f4f4f5" />
        <polygon points="1,9 7,12 7,14 1,11" fill="#78522d" />
        <polygon points="7,12 15,8 15,10 7,14" fill="#5e3e20" />
      </svg>
    );
  }
  if (type === "head") {
    const headColors: Record<string, { bg: string; eye: string }> = {
      zombie_head: { bg: "#5a8244", eye: "#1b2816" },
      skeleton_skull: { bg: "#d4d4d0", eye: "#27272a" },
      wither_skeleton_skull: { bg: "#2e2e32", eye: "#52525b" },
      creeper_head: { bg: "#49b83e", eye: "#111827" },
      dragon_head: { bg: "#27242c", eye: "#c026d3" },
      piglin_head: { bg: "#e1a589", eye: "#27272a" },
      player_head: { bg: "#c99776", eye: "#3b2f2f" },
    };
    const pal = headColors[variant ?? "player_head"] ?? headColors.player_head;
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" style={{ imageRendering: "pixelated" }}>
        <rect x="3" y="3" width="10" height="10" fill={pal.bg} stroke="#18181b" strokeWidth="0.7" />
        <rect x="5" y="6" width="2" height="2" fill={pal.eye} />
        <rect x="9" y="6" width="2" height="2" fill={pal.eye} />
        <rect x="6" y="9.5" width="4" height="1.5" fill={pal.eye} />
      </svg>
    );
  }
  if (type === "decorated_pot") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" style={{ imageRendering: "pixelated" }}>
        <rect x="5" y="2" width="6" height="2" fill="#8b4b34" />
        <rect x="6" y="4" width="4" height="1.5" fill="#723c28" />
        <rect x="3.5" y="5.5" width="9" height="8.5" rx="0.5" fill="#9c563b" stroke="#5b2e1e" strokeWidth="0.6" />
      </svg>
    );
  }
  // Conduit / generic special
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" style={{ imageRendering: "pixelated" }}>
      <rect x="4" y="4" width="8" height="8" fill="#5eead4" stroke="#0f766e" strokeWidth="1" />
      <rect x="6.5" y="6.5" width="3" height="3" fill="#0f172a" />
    </svg>
  );
}

export function MinecraftItemIcon({
  id,
  potionColor,
  dyedColor,
  baseColor,
  glint = false,
  size = 32,
}: {
  id: string;
  potionColor?: string | null;
  dyedColor?: string | null;
  baseColor?: string | null;
  glint?: boolean;
  size?: number;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const resolved = resolveItemAsset(id, {
    potionColor: potionColor ?? undefined,
    dyedColor: dyedColor ?? undefined,
    baseColor: baseColor ?? undefined,
  });

  if (imgFailed || resolved.kind === "fallback") {
    const { namespace, name } = splitItemId(id);
    const initials = name
      .split("_")
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("");
    return (
      <span
        className={`mc-item-icon ${glint ? "mc-item-glint" : ""}`}
        style={{
          width: size,
          height: size,
          background: "var(--card)",
          border: "1px solid var(--border-strong)",
          fontSize: Math.max(9, Math.round(size * 0.3)),
          fontWeight: 700,
          color: "var(--accent-bright)",
        }}
        title={`${namespace}:${name}`}
      >
        {initials || "?"}
      </span>
    );
  }

  if (resolved.kind === "special") {
    return (
      <span
        className={`mc-item-icon ${glint ? "mc-item-glint" : ""}`}
        style={{ width: size, height: size }}
      >
        <SpecialMinecraftSvg
          type={resolved.specialType}
          color={resolved.color}
          variant={resolved.variant}
          size={size}
        />
      </span>
    );
  }

  if (resolved.kind === "cube") {
    const scale = size / 32;
    const tintAll = resolved.tint && !resolved.tintTopOnly ? resolved.tint : undefined;
    const tintTop = resolved.tint ? resolved.tint : undefined;
    return (
      <span
        className={`mc-item-icon ${glint ? "mc-item-glint" : ""}`}
        style={{ width: size, height: size }}
      >
        <span
          className="mc-iso-cube"
          style={scale !== 1 ? { transform: `scale(${scale})` } : undefined}
        >
          <span
            className="mc-iso-face mc-iso-top"
            style={{ backgroundImage: `url("${resolved.topUrl}")` }}
          >
            {tintTop ? <span className="mc-iso-tint" style={{ backgroundColor: tintTop }} /> : null}
          </span>
          <span
            className="mc-iso-face mc-iso-left"
            style={{ backgroundImage: `url("${resolved.leftUrl}")` }}
          >
            {tintAll ? <span className="mc-iso-tint" style={{ backgroundColor: tintAll }} /> : null}
          </span>
          <span
            className="mc-iso-face mc-iso-right"
            style={{ backgroundImage: `url("${resolved.rightUrl}")` }}
          >
            {tintAll ? <span className="mc-iso-tint" style={{ backgroundColor: tintAll }} /> : null}
          </span>
        </span>
      </span>
    );
  }

  // Standard 2D item (with optional potion / leather dye overlay)
  return (
    <span
      className={`mc-item-icon ${glint ? "mc-item-glint" : ""}`}
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={resolved.url}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        className="mc-item-img"
        onError={() => setImgFailed(true)}
      />
      {resolved.tint && resolved.tintBase ? (
        <span
          className="mc-item-tint-mask"
          style={{
            backgroundColor: resolved.tint,
            WebkitMaskImage: `url("${resolved.url}")`,
            maskImage: `url("${resolved.url}")`,
          }}
        />
      ) : null}
      {resolved.overlayUrl ? (
        <span className="mc-item-overlay">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resolved.overlayUrl}
            alt=""
            width={size}
            height={size}
            loading="lazy"
            className="mc-item-img"
          />
          {resolved.tint && !resolved.tintBase ? (
            <span
              className="mc-item-tint-mask"
              style={{
                backgroundColor: resolved.tint,
                WebkitMaskImage: `url("${resolved.overlayUrl}")`,
                maskImage: `url("${resolved.overlayUrl}")`,
              }}
            />
          ) : null}
        </span>
      ) : resolved.tint && !resolved.tintBase ? (
        <span
          className="mc-item-tint-mask"
          style={{
            backgroundColor: resolved.tint,
            WebkitMaskImage: `url("${resolved.url}")`,
            maskImage: `url("${resolved.url}")`,
          }}
        />
      ) : null}
    </span>
  );
}

function durabilityColor(ratio: number): string {
  if (ratio > 0.55) return "#22c55e";
  if (ratio > 0.25) return "#facc15";
  return "#f43f5e";
}

export function MinecraftSlot({
  item,
  placeholderIcon,
  placeholderLabel,
  selected = false,
  held = false,
  matchState = "none",
  onSelect,
}: {
  item: DecodedItemStack | null;
  placeholderIcon?: string;
  placeholderLabel?: string;
  selected?: boolean;
  held?: boolean;
  matchState?: "none" | "match" | "dim";
  onSelect?: (item: DecodedItemStack) => void;
}) {
  const displayName = item ? item.customName || item.name : placeholderLabel || "Empty slot";
  const showDurability =
    item !== null &&
    !item.unbreakable &&
    item.damage !== null &&
    item.damage > 0 &&
    item.maxDamage !== null &&
    item.maxDamage > 0;
  const durRatio = showDurability
    ? Math.max(0, Math.min(1, (item!.maxDamage! - item!.damage!) / item!.maxDamage!))
    : 1;

  const classes = [
    "mc-slot",
    !item ? "is-empty" : "",
    selected ? "is-selected" : "",
    held ? "is-held" : "",
    matchState === "match" ? "is-match" : "",
    matchState === "dim" ? "is-dim" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={classes}
      onClick={() => {
        if (item && onSelect) onSelect(item);
      }}
      disabled={!item}
      title={
        item
          ? `${displayName}${item.count > 1 ? ` ×${item.count}` : ""}${item.enchantments.length ? ` · ${item.enchantments.map((e) => `${e.label} ${e.roman}`).join(", ")}` : ""}`
          : placeholderLabel
      }
      aria-label={item ? `${displayName}, count ${item.count}` : placeholderLabel || "Empty slot"}
    >
      {item ? (
        <>
          <MinecraftItemIcon
            id={item.id}
            potionColor={item.potionColor}
            dyedColor={item.dyedColor}
            baseColor={item.baseColor}
            glint={item.glint}
            size={32}
          />
          {item.containerItems.length > 0 ? (
            <span
              className="mc-slot-container-dot"
              title={`Contains ${item.containerItems.length} stack(s)`}
            />
          ) : null}
          {showDurability ? (
            <span className="mc-durability-track" aria-hidden="true">
              <span
                className="mc-durability-bar"
                style={{
                  width: `${Math.round(durRatio * 100)}%`,
                  backgroundColor: durabilityColor(durRatio),
                }}
              />
            </span>
          ) : null}
          {item.count > 1 ? <span className="mc-slot-count">{item.count}</span> : null}
        </>
      ) : placeholderIcon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={placeholderIcon} alt="" className="mc-slot-placeholder" />
      ) : null}
    </button>
  );
}
