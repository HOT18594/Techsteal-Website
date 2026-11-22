import type { CSSProperties } from "react";

export const ANNOUNCEMENT_THEMES = [
  { id: "info", label: "Classic", color: "#d2d2cb", color2: "#a8a89f", defaultIcon: "fa-bullhorn" },
  { id: "emerald", label: "Emerald", color: "#22c55e", color2: "#4ade80", defaultIcon: "fa-wand-magic-sparkles" },
  { id: "diamond", label: "Diamond", color: "#38bdf8", color2: "#818cf8", defaultIcon: "fa-gem" },
  { id: "gold", label: "Gold", color: "#facc15", color2: "#fb923c", defaultIcon: "fa-crown" },
  { id: "amethyst", label: "Amethyst", color: "#c084fc", color2: "#f472b6", defaultIcon: "fa-wand-magic-sparkles" },
  { id: "sunset", label: "Sunset", color: "#fb923c", color2: "#f43f5e", defaultIcon: "fa-fire" },
  { id: "warning", label: "Warning", color: "#ffd166", color2: "#f59e0b", defaultIcon: "fa-triangle-exclamation" },
  { id: "critical", label: "Critical", color: "#f43f5e", color2: "#fb7185", defaultIcon: "fa-circle-exclamation" },
] as const;

export type AnnouncementTone = (typeof ANNOUNCEMENT_THEMES)[number]["id"];

export const ANNOUNCEMENT_PATTERNS = [
  { id: "none", label: "Solid" },
  { id: "stripes", label: "Diagonal Stripes" },
  { id: "pixels", label: "Minecraft Pixels" },
  { id: "grid", label: "Pixel Grid" },
  { id: "chevron", label: "Energy Bars" },
  { id: "aurora", label: "Vibrant Blend" },
] as const;

export type AnnouncementPattern = (typeof ANNOUNCEMENT_PATTERNS)[number]["id"];

export const ANNOUNCEMENT_ICONS = [
  { id: "fa-bullhorn", label: "Megaphone" },
  { id: "fa-wand-magic-sparkles", label: "Sparkles" },
  { id: "fa-rocket", label: "Rocket" },
  { id: "fa-gem", label: "Diamond" },
  { id: "fa-bolt", label: "Bolt" },
  { id: "fa-fire", label: "Fire" },
  { id: "fa-cube", label: "Block" },
  { id: "fa-crown", label: "Crown" },
  { id: "fa-gift", label: "Gift" },
  { id: "fa-calendar-check", label: "Calendar" },
  { id: "fa-bell", label: "Bell" },
  { id: "fa-triangle-exclamation", label: "Warning" },
  { id: "fa-circle-exclamation", label: "Alert" },
] as const;

export type AnnouncementIcon = (typeof ANNOUNCEMENT_ICONS)[number]["id"];

const TONE_SET = new Set<string>(ANNOUNCEMENT_THEMES.map((t) => t.id));
const PATTERN_SET = new Set<string>(ANNOUNCEMENT_PATTERNS.map((p) => p.id));
const ICON_SET = new Set<string>(ANNOUNCEMENT_ICONS.map((i) => i.id));

export function isAnnouncementTone(value: unknown): value is AnnouncementTone {
  return typeof value === "string" && TONE_SET.has(value);
}

export function isAnnouncementPattern(value: unknown): value is AnnouncementPattern {
  return typeof value === "string" && PATTERN_SET.has(value);
}

export function isAnnouncementIcon(value: unknown): value is AnnouncementIcon {
  return typeof value === "string" && ICON_SET.has(value);
}

/** Validates a 6-digit hex color (`#rrggbb`), returning `""` if invalid/empty. */
export function sanitizeHexColor(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toLowerCase() : "";
}

/** Allows same-site relative paths (`/join`, `/status`) or http(s) URLs only. */
export function sanitizeAnnouncementHref(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim().slice(0, 200);
  if (!trimmed) return "";
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.toString();
    }
  } catch {
    // invalid URL
  }
  return "";
}

export function getAnnouncementTheme(tone: string | undefined) {
  return ANNOUNCEMENT_THEMES.find((t) => t.id === tone) ?? ANNOUNCEMENT_THEMES[0];
}

export function resolveAnnouncementIcon(item: { tone?: string; icon?: string }): string {
  if (item.icon && ICON_SET.has(item.icon)) return item.icon;
  return getAnnouncementTheme(item.tone).defaultIcon;
}

export function resolveAnnouncementPattern(pattern: string | undefined): AnnouncementPattern {
  return isAnnouncementPattern(pattern) ? pattern : "none";
}

export function announcementCssVars(item: {
  tone?: string;
  accentColor?: string;
}): CSSProperties {
  const theme = getAnnouncementTheme(item.tone);
  const custom = sanitizeHexColor(item.accentColor);
  const primary = custom || (theme.id === "info" ? "var(--accent)" : theme.color);
  const secondary = custom || (theme.id === "info" ? "var(--accent-bright)" : theme.color2);
  return {
    "--announce-tone": primary,
    "--announce-tone-2": secondary,
  } as CSSProperties;
}
