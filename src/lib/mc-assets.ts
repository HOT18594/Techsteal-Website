// Minecraft 1.21.11 + server custom mod asset resolver.
// Backed by src/lib/mc-asset-index.json (generated from assets.mcasset.cloud/1.21.11
// and the server's custom Fabric mod JARs — all 1,504 vanilla items + mod items).

import rawIndex from "./mc-asset-index.json";

type RawItemEntry =
  | string
  | {
      k: "item";
      tex: string;
      overlay?: string;
      tint?: string;
      tintBase?: boolean;
    }
  | {
      k: "cube";
      t: string;
      l: string;
      r: string;
      tint?: string;
      tintTopOnly?: boolean;
    }
  | {
      k: "special";
      type: string;
      color?: string;
      variant?: string;
    };

interface RawAssetIndex {
  version: string;
  cdnBase: string;
  effects: string[];
  mods: Record<string, { k: "mod_item" | "mod_cube"; url: string }>;
  items: Record<string, RawItemEntry>;
}

const INDEX = rawIndex as unknown as RawAssetIndex;

export const MC_ASSET_VERSION = INDEX.version;
export const MC_TEXTURE_BASE = INDEX.cdnBase;

const EFFECT_SET = new Set(INDEX.effects);

export type ResolvedItemAsset =
  | {
      kind: "item";
      url: string;
      overlayUrl?: string;
      tint?: string;
      tintBase?: boolean;
    }
  | {
      kind: "cube";
      topUrl: string;
      leftUrl: string;
      rightUrl: string;
      tint?: string;
      tintTopOnly?: boolean;
    }
  | {
      kind: "special";
      specialType: string;
      color?: string;
      variant?: string;
    }
  | {
      kind: "fallback";
      namespace: string;
      shortName: string;
    };

/** Official Minecraft 1.21.11 HUD & container slot silhouette sprites. */
export const MC_HUD_SPRITES = {
  heartFull: `${MC_TEXTURE_BASE}/gui/sprites/hud/heart/full.png`,
  heartHalf: `${MC_TEXTURE_BASE}/gui/sprites/hud/heart/half.png`,
  heartEmpty: `${MC_TEXTURE_BASE}/gui/sprites/hud/heart/container.png`,
  heartAbsorbFull: `${MC_TEXTURE_BASE}/gui/sprites/hud/heart/absorbing_full.png`,
  foodFull: `${MC_TEXTURE_BASE}/gui/sprites/hud/food_full.png`,
  foodHalf: `${MC_TEXTURE_BASE}/gui/sprites/hud/food_half.png`,
  foodEmpty: `${MC_TEXTURE_BASE}/gui/sprites/hud/food_empty.png`,
  armorFull: `${MC_TEXTURE_BASE}/gui/sprites/hud/armor_full.png`,
  armorHalf: `${MC_TEXTURE_BASE}/gui/sprites/hud/armor_half.png`,
  armorEmpty: `${MC_TEXTURE_BASE}/gui/sprites/hud/armor_empty.png`,
  slotHelmet: `${MC_TEXTURE_BASE}/gui/sprites/container/slot/helmet.png`,
  slotChestplate: `${MC_TEXTURE_BASE}/gui/sprites/container/slot/chestplate.png`,
  slotLeggings: `${MC_TEXTURE_BASE}/gui/sprites/container/slot/leggings.png`,
  slotBoots: `${MC_TEXTURE_BASE}/gui/sprites/container/slot/boots.png`,
  slotShield: `${MC_TEXTURE_BASE}/gui/sprites/container/slot/shield.png`,
} as const;

/** Standard Minecraft potion colors (for tinting potion/splash/lingering bottles & tipped arrows). */
export const POTION_COLORS: Record<string, string> = {
  water: "#385dc6",
  mundane: "#385dc6",
  thick: "#385dc6",
  awkward: "#385dc6",
  night_vision: "#c2ff66",
  invisibility: "#f6f6f6",
  leaping: "#fdff84",
  fire_resistance: "#ff9900",
  swiftness: "#33ebff",
  slowness: "#8bafe0",
  turtle_master: "#735a83",
  water_breathing: "#98dac0",
  healing: "#f82423",
  harming: "#a9656a",
  poison: "#87a363",
  regeneration: "#cd5cab",
  strength: "#ffc700",
  weakness: "#484d48",
  luck: "#59c106",
  slow_falling: "#f3cfb9",
  wind_charged: "#bdc9ff",
  weaving: "#78695a",
  oozing: "#99ffa3",
  infested: "#8c9b8c",
};

/** Banner/shield dye color palette. */
export const MC_DYE_HEX: Record<string, string> = {
  white: "#f9fffe",
  orange: "#f9801d",
  magenta: "#c74ebd",
  light_blue: "#3ab3da",
  yellow: "#fed83d",
  lime: "#80c71f",
  pink: "#f38baa",
  gray: "#474f52",
  light_gray: "#9d9d97",
  cyan: "#169c9c",
  purple: "#8932b8",
  blue: "#3c44aa",
  brown: "#835432",
  green: "#5e7c16",
  red: "#b02e26",
  black: "#1d1d21",
};

/** Vanilla Minecraft 1.21.11 maximum durability table (when minecraft:max_damage is not overridden). */
export const ITEM_MAX_DURABILITY: Record<string, number> = {
  // Swords, axes, pickaxes, shovels, hoes, spears
  wooden_sword: 59, wooden_pickaxe: 59, wooden_axe: 59, wooden_shovel: 59, wooden_hoe: 59, wooden_spear: 59,
  stone_sword: 131, stone_pickaxe: 131, stone_axe: 131, stone_shovel: 131, stone_hoe: 131, stone_spear: 131,
  copper_sword: 190, copper_pickaxe: 190, copper_axe: 190, copper_shovel: 190, copper_hoe: 190, copper_spear: 190,
  iron_sword: 250, iron_pickaxe: 250, iron_axe: 250, iron_shovel: 250, iron_hoe: 250, iron_spear: 250,
  golden_sword: 32, golden_pickaxe: 32, golden_axe: 32, golden_shovel: 32, golden_hoe: 32, golden_spear: 32,
  diamond_sword: 1561, diamond_pickaxe: 1561, diamond_axe: 1561, diamond_shovel: 1561, diamond_hoe: 1561, diamond_spear: 1561,
  netherite_sword: 2031, netherite_pickaxe: 2031, netherite_axe: 2031, netherite_shovel: 2031, netherite_hoe: 2031, netherite_spear: 2031,
  // Armor
  leather_helmet: 55, leather_chestplate: 80, leather_leggings: 75, leather_boots: 65,
  chainmail_helmet: 165, chainmail_chestplate: 240, chainmail_leggings: 225, chainmail_boots: 195,
  copper_helmet: 121, copper_chestplate: 176, copper_leggings: 165, copper_boots: 143,
  iron_helmet: 165, iron_chestplate: 240, iron_leggings: 225, iron_boots: 195,
  golden_helmet: 77, golden_chestplate: 112, golden_leggings: 105, golden_boots: 91,
  diamond_helmet: 363, diamond_chestplate: 528, diamond_leggings: 495, diamond_boots: 429,
  netherite_helmet: 407, netherite_chestplate: 592, netherite_leggings: 555, netherite_boots: 481,
  turtle_helmet: 275,
  // Combat & utility
  bow: 384,
  crossbow: 465,
  trident: 250,
  mace: 500,
  shield: 336,
  elytra: 432,
  flint_and_steel: 64,
  fishing_rod: 64,
  shears: 238,
  brush: 64,
  carrot_on_a_stick: 25,
  warped_fungus_on_a_stick: 100,
  wolf_armor: 64,
};

/** Armor defense points contributed by each vanilla armor piece. */
export const ARMOR_DEFENSE_POINTS: Record<string, number> = {
  leather_helmet: 1, leather_chestplate: 3, leather_leggings: 2, leather_boots: 1,
  golden_helmet: 2, golden_chestplate: 5, golden_leggings: 3, golden_boots: 1,
  chainmail_helmet: 2, chainmail_chestplate: 5, chainmail_leggings: 4, chainmail_boots: 1,
  copper_helmet: 2, copper_chestplate: 5, copper_leggings: 3, copper_boots: 1,
  iron_helmet: 2, iron_chestplate: 6, iron_leggings: 5, iron_boots: 2,
  turtle_helmet: 2,
  diamond_helmet: 3, diamond_chestplate: 8, diamond_leggings: 6, diamond_boots: 3,
  netherite_helmet: 3, netherite_chestplate: 8, netherite_leggings: 6, netherite_boots: 3,
};

/** Items that always display the enchantment glint even without explicit enchantments. */
export const INNATE_GLINT_ITEMS = new Set([
  "enchanted_golden_apple",
  "nether_star",
  "end_crystal",
  "experience_bottle",
  "written_book",
  "debug_stick",
  "enchanted_book",
]);

export function splitItemId(rawId: string): { namespace: string; name: string } {
  const clean = (rawId ?? "").trim().toLowerCase();
  const colon = clean.indexOf(":");
  if (colon === -1) return { namespace: "minecraft", name: clean };
  return { namespace: clean.slice(0, colon), name: clean.slice(colon + 1) };
}

export function formatMcIdentifier(raw: string): string {
  const { name } = splitItemId(raw);
  return name
    .replace(/[/_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function toRoman(num: number): string {
  if (!Number.isFinite(num) || num <= 0) return String(num);
  if (num > 20) return String(num);
  const pairs: Array<[number, string]> = [
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let rem = Math.floor(num);
  let out = "";
  for (const [val, sym] of pairs) {
    while (rem >= val) {
      out += sym;
      rem -= val;
    }
  }
  return out;
}

export function resolvePotionColor(potionId?: string | null, customColor?: number | null): string | undefined {
  if (typeof customColor === "number" && Number.isFinite(customColor)) {
    return "#" + (customColor & 0xffffff).toString(16).padStart(6, "0");
  }
  if (!potionId) return undefined;
  const { name } = splitItemId(potionId);
  const base = name.replace(/^(?:long_|strong_)/, "");
  return POTION_COLORS[base] ?? "#385dc6";
}

export function resolveMobEffectIcon(effectId: string): string | null {
  const { name } = splitItemId(effectId);
  if (EFFECT_SET.has(name)) {
    return `${MC_TEXTURE_BASE}/mob_effect/${name}.png`;
  }
  return null;
}

export function resolveItemAsset(
  rawId: string,
  opts?: {
    potionColor?: string;
    dyedColor?: string;
    baseColor?: string;
  }
): ResolvedItemAsset {
  const { namespace, name } = splitItemId(rawId);
  const fullId = `${namespace}:${name}`;

  // 1. Check extracted custom server mod assets first
  const modEntry = INDEX.mods[fullId];
  if (modEntry) {
    if (modEntry.k === "mod_cube") {
      return {
        kind: "cube",
        topUrl: modEntry.url,
        leftUrl: modEntry.url,
        rightUrl: modEntry.url,
      };
    }
    return { kind: "item", url: modEntry.url };
  }

  // 2. Vanilla Minecraft 1.21.11 lookup
  const entry = namespace === "minecraft" ? INDEX.items[name] : undefined;
  if (!entry) {
    return { kind: "fallback", namespace, shortName: name };
  }

  if (typeof entry === "string") {
    const prefix = entry.slice(0, 2);
    const texName = entry.slice(2);
    if (prefix === "i:") {
      return { kind: "item", url: `${MC_TEXTURE_BASE}/item/${texName}.png` };
    }
    if (prefix === "b:") {
      return { kind: "item", url: `${MC_TEXTURE_BASE}/block/${texName}.png` };
    }
    if (prefix === "c:") {
      const url = `${MC_TEXTURE_BASE}/block/${texName}.png`;
      return { kind: "cube", topUrl: url, leftUrl: url, rightUrl: url };
    }
  } else if (entry.k === "item") {
    const isPotion = name === "potion" || name === "splash_potion" || name === "lingering_potion" || name === "tipped_arrow";
    const tint = isPotion
      ? opts?.potionColor ?? entry.tint
      : entry.tintBase
        ? opts?.dyedColor ?? entry.tint
        : entry.tint;
    return {
      kind: "item",
      url: `${MC_TEXTURE_BASE}/${entry.tex}.png`,
      overlayUrl: entry.overlay ? `${MC_TEXTURE_BASE}/${entry.overlay}.png` : undefined,
      tint,
      tintBase: entry.tintBase,
    };
  } else if (entry.k === "cube") {
    return {
      kind: "cube",
      topUrl: `${MC_TEXTURE_BASE}/block/${entry.t}.png`,
      leftUrl: `${MC_TEXTURE_BASE}/block/${entry.l}.png`,
      rightUrl: `${MC_TEXTURE_BASE}/block/${entry.r}.png`,
      tint: entry.tint,
      tintTopOnly: entry.tintTopOnly,
    };
  } else if (entry.k === "special") {
    const shieldColor =
      entry.type === "shield" && opts?.baseColor
        ? MC_DYE_HEX[opts.baseColor.toLowerCase()] ?? undefined
        : entry.color;
    return {
      kind: "special",
      specialType: entry.type,
      color: shieldColor ?? entry.color,
      variant: entry.variant,
    };
  }

  return { kind: "fallback", namespace, shortName: name };
}
