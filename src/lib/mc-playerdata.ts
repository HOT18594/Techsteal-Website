// Decodes Minecraft 1.21.11 (and legacy 1.20.x) world/playerdata/<uuid>.dat
// NBT compounds into structured player vitals, equipment, inventory, ender chest,
// active effects, and recursive shulker box / bundle contents.

import {
  ARMOR_DEFENSE_POINTS,
  INNATE_GLINT_ITEMS,
  ITEM_MAX_DURABILITY,
  formatMcIdentifier,
  resolvePotionColor,
  splitItemId,
  toRoman,
} from "./mc-assets";
import { parseNbt, type NbtValue } from "./mc-nbt";

export type MinecraftGameMode = "survival" | "creative" | "adventure" | "spectator";

export interface DecodedEnchantment {
  id: string;
  label: string;
  level: number;
  roman: string;
}

export interface DecodedItemStack {
  slot: number;
  id: string;
  name: string;
  customName: string | null;
  count: number;
  glint: boolean;
  enchantments: DecodedEnchantment[];
  storedEnchantments: DecodedEnchantment[];
  damage: number | null;
  maxDamage: number | null;
  unbreakable: boolean;
  potionId: string | null;
  potionLabel: string | null;
  potionColor: string | null;
  dyedColor: string | null;
  baseColor: string | null;
  bannerPatterns: Array<{ pattern: string; color: string }>;
  trim: { material: string; pattern: string } | null;
  lore: string[];
  repairCost: number | null;
  containerItems: DecodedItemStack[];
}

export interface DecodedActiveEffect {
  id: string;
  label: string;
  amplifier: number;
  roman: string;
  durationSeconds: number;
  infinite: boolean;
}

export interface DecodedCoords {
  dimension: string;
  x: number;
  y: number;
  z: number;
}

export interface DecodedPlayerData {
  dataVersion: number | null;
  gameMode: MinecraftGameMode;
  previousGameMode: MinecraftGameMode | null;
  health: number;
  maxHealth: number;
  absorption: number;
  foodLevel: number;
  foodSaturation: number;
  armorPoints: number;
  xpLevel: number;
  xpProgress: number;
  xpTotal: number;
  selectedSlot: number;
  position: DecodedCoords | null;
  respawn: DecodedCoords | null;
  lastDeath: DecodedCoords | null;
  activeEffects: DecodedActiveEffect[];
  equipment: {
    head: DecodedItemStack | null;
    chest: DecodedItemStack | null;
    legs: DecodedItemStack | null;
    feet: DecodedItemStack | null;
    offhand: DecodedItemStack | null;
  };
  /** Slots 0–8 (always length 9, null for empty slots). */
  hotbar: Array<DecodedItemStack | null>;
  /** Slots 9–35 (always length 27, null for empty slots). */
  inventory: Array<DecodedItemStack | null>;
  /** Slots 0–26 (always length 27, null for empty slots). */
  enderChest: Array<DecodedItemStack | null>;
  totalItemStacks: number;
  totalEnderStacks: number;
}

function asObj(v: NbtValue | undefined): Record<string, NbtValue> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, NbtValue>) : null;
}

function asArr(v: NbtValue | undefined): NbtValue[] {
  return Array.isArray(v) ? v : [];
}

function asNum(v: NbtValue | undefined): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "bigint") return Number(v);
  return null;
}

function asStr(v: NbtValue | undefined): string | null {
  return typeof v === "string" ? v : null;
}

function gameModeFromId(id: number | null): MinecraftGameMode | null {
  switch (id) {
    case 0:
      return "survival";
    case 1:
      return "creative";
    case 2:
      return "adventure";
    case 3:
      return "spectator";
    default:
      return null;
  }
}

function formatDimension(raw: string | null): string {
  if (!raw) return "Overworld";
  const clean = raw.replace(/^minecraft:/, "");
  if (clean === "overworld") return "Overworld";
  if (clean === "the_nether") return "The Nether";
  if (clean === "the_end") return "The End";
  return formatMcIdentifier(clean);
}

/** Extract plain text from a Minecraft 1.21.5+ NBT text component, JSON text component, or raw string. */
function extractTextComponent(raw: NbtValue | undefined, depth = 0): string {
  if (raw === undefined || raw === null || depth > 8) return "";
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"'))
    ) {
      try {
        const parsed = JSON.parse(trimmed) as NbtValue;
        return extractTextComponent(parsed, depth + 1);
      } catch {
        return raw.replace(/§[0-9a-fk-or]/gi, "");
      }
    }
    return raw.replace(/§[0-9a-fk-or]/gi, "");
  }
  if (Array.isArray(raw)) {
    return raw.map((child) => extractTextComponent(child, depth + 1)).join("");
  }
  if (typeof raw === "object") {
    const obj = raw as Record<string, NbtValue>;
    let text = "";
    if (typeof obj.text === "string") text += obj.text;
    else if (typeof obj.translate === "string") text += obj.translate;
    if (obj.extra !== undefined) {
      text += extractTextComponent(obj.extra, depth + 1);
    }
    return text.replace(/§[0-9a-fk-or]/gi, "");
  }
  return "";
}

function parseEnchantmentMap(raw: NbtValue | undefined): DecodedEnchantment[] {
  const obj = asObj(raw);
  if (!obj) return [];
  // 1.20.5-1.21.4 nested under .levels; 1.21.5+ flat map { "minecraft:sharpness": 5 }
  const map = asObj(obj.levels) ?? obj;
  const out: DecodedEnchantment[] = [];
  for (const [key, val] of Object.entries(map)) {
    if (key === "show_in_tooltip") continue;
    const lvl = asNum(val);
    if (lvl === null || lvl <= 0) continue;
    out.push({
      id: key,
      label: formatMcIdentifier(key),
      level: lvl,
      roman: toRoman(lvl),
    });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

function parseLegacyEnchantmentList(raw: NbtValue | undefined): DecodedEnchantment[] {
  const out: DecodedEnchantment[] = [];
  for (const entry of asArr(raw)) {
    const o = asObj(entry);
    if (!o) continue;
    const id = asStr(o.id);
    const lvl = asNum(o.lvl);
    if (!id || lvl === null) continue;
    out.push({
      id,
      label: formatMcIdentifier(id),
      level: lvl,
      roman: toRoman(lvl),
    });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

function rgbIntToHex(raw: number | null): string | null {
  if (raw === null) return null;
  return "#" + (raw & 0xffffff).toString(16).padStart(6, "0");
}

function decodeItem(raw: NbtValue | undefined, fallbackSlot = 0, depth = 0): DecodedItemStack | null {
  if (depth > 3) return null;
  const obj = asObj(raw);
  if (!obj) return null;
  const id = asStr(obj.id);
  if (!id || id === "minecraft:air") return null;

  const count = asNum(obj.count) ?? asNum(obj.Count) ?? 1;
  const slot = asNum(obj.Slot) ?? fallbackSlot;
  const components = asObj(obj.components) ?? {};
  const legacyTag = asObj(obj.tag) ?? {};
  const legacyDisplay = asObj(legacyTag.display) ?? {};

  // Custom / display name
  const customRaw =
    components["minecraft:custom_name"] ??
    components["minecraft:item_name"] ??
    legacyDisplay.Name;
  const customName = extractTextComponent(customRaw).trim() || null;

  // Enchantments & stored enchantments
  const enchantments = [
    ...parseEnchantmentMap(components["minecraft:enchantments"]),
    ...parseLegacyEnchantmentList(legacyTag.Enchantments),
  ];
  const storedEnchantments = [
    ...parseEnchantmentMap(components["minecraft:stored_enchantments"]),
    ...parseLegacyEnchantmentList(legacyTag.StoredEnchantments),
  ];

  // Glint
  const glintOverride = asNum(components["minecraft:enchantment_glint_override"]);
  const { name: bareName } = splitItemId(id);
  const glint =
    glintOverride !== null
      ? glintOverride !== 0
      : enchantments.length > 0 ||
        storedEnchantments.length > 0 ||
        INNATE_GLINT_ITEMS.has(bareName);

  // Durability
  const damage = asNum(components["minecraft:damage"]) ?? asNum(legacyTag.Damage);
  const maxDamage =
    asNum(components["minecraft:max_damage"]) ??
    (ITEM_MAX_DURABILITY[bareName] ?? null);
  const unbreakable =
    components["minecraft:unbreakable"] !== undefined ||
    asNum(legacyTag.Unbreakable) === 1;

  // Potion contents
  const potionComp = asObj(components["minecraft:potion_contents"]);
  const potionId = asStr(potionComp?.potion) ?? asStr(legacyTag.Potion);
  const potionCustomColor = asNum(potionComp?.custom_color) ?? asNum(legacyTag.CustomPotionColor);
  const isPotionItem =
    bareName === "potion" ||
    bareName === "splash_potion" ||
    bareName === "lingering_potion" ||
    bareName === "tipped_arrow";
  const potionColor = isPotionItem
    ? (resolvePotionColor(potionId, potionCustomColor) ?? "#385dc6")
    : null;
  const potionLabel = potionId ? formatMcIdentifier(potionId) : null;

  // Dyed color (leather / wolf armor)
  const dyedComp = components["minecraft:dyed_color"];
  const dyedInt =
    asNum(dyedComp) ??
    asNum(asObj(dyedComp)?.rgb) ??
    asNum(legacyDisplay.color);
  const dyedColor = rgbIntToHex(dyedInt);

  // Base color & banner patterns (shields / banners)
  const baseColor = asStr(components["minecraft:base_color"]);
  const bannerPatterns: Array<{ pattern: string; color: string }> = [];
  for (const pat of asArr(components["minecraft:banner_patterns"])) {
    const pObj = asObj(pat);
    if (!pObj) continue;
    const pName = asStr(pObj.pattern);
    const pCol = asStr(pObj.color);
    if (pName && pCol) {
      bannerPatterns.push({ pattern: formatMcIdentifier(pName), color: formatMcIdentifier(pCol) });
    }
  }

  // Armor trim
  const trimObj = asObj(components["minecraft:trim"]);
  const trim =
    trimObj && asStr(trimObj.material) && asStr(trimObj.pattern)
      ? {
          material: formatMcIdentifier(asStr(trimObj.material)!),
          pattern: formatMcIdentifier(asStr(trimObj.pattern)!),
        }
      : null;

  // Lore
  const loreRaw = asArr(components["minecraft:lore"] ?? legacyDisplay.Lore);
  const lore = loreRaw
    .map((line) => extractTextComponent(line).trim())
    .filter(Boolean)
    .slice(0, 12);

  // Repair cost
  const repairCost = asNum(components["minecraft:repair_cost"]) ?? asNum(legacyTag.RepairCost);

  // Nested container items (Shulker Boxes & Bundles)
  const containerItems: DecodedItemStack[] = [];
  const shulkerContainer = asArr(components["minecraft:container"]);
  for (let i = 0; i < shulkerContainer.length; i++) {
    const entry = asObj(shulkerContainer[i]);
    if (!entry) continue;
    const slotNum = asNum(entry.slot) ?? i;
    const nested = decodeItem(entry.item, slotNum, depth + 1);
    if (nested) containerItems.push(nested);
  }
  const bundleContents = asArr(components["minecraft:bundle_contents"]);
  for (let i = 0; i < bundleContents.length; i++) {
    const nested = decodeItem(bundleContents[i], i, depth + 1);
    if (nested) containerItems.push(nested);
  }
  // Legacy shulker box format (BlockEntityTag.Items)
  if (containerItems.length === 0) {
    const bet = asObj(legacyTag.BlockEntityTag);
    for (let i = 0; i < asArr(bet?.Items).length; i++) {
      const nested = decodeItem(asArr(bet?.Items)[i], i, depth + 1);
      if (nested) containerItems.push(nested);
    }
  }
  containerItems.sort((a, b) => a.slot - b.slot);

  return {
    slot,
    id,
    name: formatMcIdentifier(id),
    customName,
    count: Math.max(1, count),
    glint,
    enchantments,
    storedEnchantments,
    damage,
    maxDamage,
    unbreakable,
    potionId,
    potionLabel,
    potionColor,
    dyedColor,
    baseColor,
    bannerPatterns,
    trim,
    lore,
    repairCost,
    containerItems,
  };
}

function computeAttributeValue(nbt: Record<string, NbtValue>, attrId: string, defaultBase: number): number {
  const attrs = asArr(nbt.attributes ?? nbt.Attributes);
  for (const raw of attrs) {
    const obj = asObj(raw);
    if (!obj) continue;
    const id = (asStr(obj.id) ?? asStr(obj.Name) ?? "").replace(/^minecraft:/, "");
    if (id !== attrId && id !== `generic.${attrId}`) continue;
    const base = asNum(obj.base ?? obj.Base) ?? defaultBase;
    let add = 0;
    let multBase = 0;
    let multTotal = 1;
    for (const modRaw of asArr(obj.modifiers ?? obj.Modifiers)) {
      const m = asObj(modRaw);
      if (!m) continue;
      const amt = asNum(m.amount ?? m.Amount) ?? 0;
      const op = m.operation ?? m.Operation;
      if (op === "add_value" || op === 0) add += amt;
      else if (op === "add_multiplied_base" || op === 1) multBase += amt;
      else if (op === "add_multiplied_total" || op === 2) multTotal *= 1 + amt;
    }
    return Math.max(1, (base + add) * (1 + multBase) * multTotal);
  }
  return defaultBase;
}

function decodeActiveEffects(nbt: Record<string, NbtValue>): DecodedActiveEffect[] {
  const list = asArr(nbt.active_effects ?? nbt.ActiveEffects);
  const out: DecodedActiveEffect[] = [];
  for (const raw of list) {
    const obj = asObj(raw);
    if (!obj) continue;
    const id = asStr(obj.id);
    if (!id) continue;
    const amplifier = asNum(obj.amplifier ?? obj.Amplifier) ?? 0;
    const durationTicks = asNum(obj.duration ?? obj.Duration) ?? 0;
    const infinite = durationTicks < 0;
    out.push({
      id,
      label: formatMcIdentifier(id),
      amplifier,
      roman: toRoman(amplifier + 1),
      durationSeconds: infinite ? -1 : Math.max(0, Math.round(durationTicks / 20)),
      infinite,
    });
  }
  return out;
}

export function decodePlayerDataNbt(rawBuffer: Buffer): DecodedPlayerData {
  const nbt = parseNbt(rawBuffer);

  const hotbar: Array<DecodedItemStack | null> = Array.from({ length: 9 }, () => null);
  const inventory: Array<DecodedItemStack | null> = Array.from({ length: 27 }, () => null);
  const enderChest: Array<DecodedItemStack | null> = Array.from({ length: 27 }, () => null);

  const equipment: DecodedPlayerData["equipment"] = {
    head: null,
    chest: null,
    legs: null,
    feet: null,
    offhand: null,
  };

  // 1.21.5+ equipment compound
  const eqObj = asObj(nbt.equipment);
  if (eqObj) {
    equipment.head = decodeItem(eqObj.head, 103);
    equipment.chest = decodeItem(eqObj.chest, 102);
    equipment.legs = decodeItem(eqObj.legs, 101);
    equipment.feet = decodeItem(eqObj.feet, 100);
    equipment.offhand = decodeItem(eqObj.offhand, -106);
  }

  // Main inventory + hotbar (+ legacy armor/offhand fallback slots)
  let totalItemStacks = 0;
  for (const rawItem of asArr(nbt.Inventory)) {
    const item = decodeItem(rawItem);
    if (!item) continue;
    if (item.slot >= 0 && item.slot <= 8) {
      hotbar[item.slot] = item;
      totalItemStacks++;
    } else if (item.slot >= 9 && item.slot <= 35) {
      inventory[item.slot - 9] = item;
      totalItemStacks++;
    } else if (item.slot === 103 && !equipment.head) {
      equipment.head = item;
    } else if (item.slot === 102 && !equipment.chest) {
      equipment.chest = item;
    } else if (item.slot === 101 && !equipment.legs) {
      equipment.legs = item;
    } else if (item.slot === 100 && !equipment.feet) {
      equipment.feet = item;
    } else if (item.slot === -106 && !equipment.offhand) {
      equipment.offhand = item;
    }
  }
  for (const piece of Object.values(equipment)) {
    if (piece) totalItemStacks++;
  }

  // Ender chest
  let totalEnderStacks = 0;
  for (const rawItem of asArr(nbt.EnderItems)) {
    const item = decodeItem(rawItem);
    if (!item) continue;
    if (item.slot >= 0 && item.slot <= 26) {
      enderChest[item.slot] = item;
      totalEnderStacks++;
    }
  }

  // Vitals
  const health = Math.round((asNum(nbt.Health) ?? 20) * 10) / 10;
  const maxHealth = Math.round(computeAttributeValue(nbt, "max_health", 20) * 10) / 10;
  const absorption = Math.round((asNum(nbt.AbsorptionAmount) ?? 0) * 10) / 10;
  const foodLevel = Math.max(0, Math.min(20, Math.round(asNum(nbt.foodLevel) ?? 20)));
  const foodSaturation = Math.round((asNum(nbt.foodSaturationLevel) ?? 0) * 10) / 10;

  let armorPoints = 0;
  for (const piece of [equipment.head, equipment.chest, equipment.legs, equipment.feet]) {
    if (!piece) continue;
    const { name } = splitItemId(piece.id);
    armorPoints += ARMOR_DEFENSE_POINTS[name] ?? 0;
  }

  const posArr = asArr(nbt.Pos);
  const position: DecodedCoords | null =
    posArr.length >= 3 && asNum(posArr[0]) !== null && asNum(posArr[1]) !== null && asNum(posArr[2]) !== null
      ? {
          dimension: formatDimension(asStr(nbt.Dimension)),
          x: Math.round(asNum(posArr[0])!),
          y: Math.round(asNum(posArr[1])!),
          z: Math.round(asNum(posArr[2])!),
        }
      : null;

  // Respawn point (1.21.5+ respawn compound or legacy SpawnX/Y/Z)
  let respawn: DecodedCoords | null = null;
  const respawnObj = asObj(nbt.respawn);
  if (respawnObj) {
    const rPos = asArr(respawnObj.pos);
    if (rPos.length >= 3 && asNum(rPos[0]) !== null) {
      respawn = {
        dimension: formatDimension(asStr(respawnObj.dimension)),
        x: Math.round(asNum(rPos[0])!),
        y: Math.round(asNum(rPos[1])!),
        z: Math.round(asNum(rPos[2])!),
      };
    }
  } else if (asNum(nbt.SpawnX) !== null && asNum(nbt.SpawnY) !== null && asNum(nbt.SpawnZ) !== null) {
    respawn = {
      dimension: formatDimension(asStr(nbt.SpawnDimension)),
      x: Math.round(asNum(nbt.SpawnX)!),
      y: Math.round(asNum(nbt.SpawnY)!),
      z: Math.round(asNum(nbt.SpawnZ)!),
    };
  }

  // Last death location
  let lastDeath: DecodedCoords | null = null;
  const deathObj = asObj(nbt.LastDeathLocation);
  if (deathObj) {
    const dPos = asArr(deathObj.pos);
    if (dPos.length >= 3 && asNum(dPos[0]) !== null) {
      lastDeath = {
        dimension: formatDimension(asStr(deathObj.dimension)),
        x: Math.round(asNum(dPos[0])!),
        y: Math.round(asNum(dPos[1])!),
        z: Math.round(asNum(dPos[2])!),
      };
    }
  }

  return {
    dataVersion: asNum(nbt.DataVersion),
    gameMode: gameModeFromId(asNum(nbt.playerGameType)) ?? "survival",
    previousGameMode: gameModeFromId(asNum(nbt.previousPlayerGameType)),
    health,
    maxHealth,
    absorption,
    foodLevel,
    foodSaturation,
    armorPoints: Math.min(20, armorPoints),
    xpLevel: Math.max(0, Math.round(asNum(nbt.XpLevel) ?? 0)),
    xpProgress: Math.max(0, Math.min(1, asNum(nbt.XpP) ?? 0)),
    xpTotal: Math.max(0, Math.round(asNum(nbt.XpTotal) ?? 0)),
    selectedSlot: Math.max(0, Math.min(8, Math.round(asNum(nbt.SelectedItemSlot) ?? 0))),
    position,
    respawn,
    lastDeath,
    activeEffects: decodeActiveEffects(nbt),
    equipment,
    hotbar,
    inventory,
    enderChest,
    totalItemStacks,
    totalEnderStacks,
  };
}
