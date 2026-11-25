// Builds the complete Minecraft 1.21.11 + custom server mod asset index.
// - Resolves all 1,505 vanilla 1.21.11 items from assets.mcasset.cloud
// - Extracts custom mod item/block PNGs from the Exaroton server's mods/ JARs
//   into public/mc-assets/mods/<namespace>/<kind>/<name>.png
// Outputs: src/lib/mc-asset-index.json
// Run: node scripts/build-mc-asset-index.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { config } from "dotenv";

config({ path: ".env.local" });

const MC_VERSION = "1.21.11";
const BASE = `https://assets.mcasset.cloud/${MC_VERSION}/assets/minecraft`;
const CONCURRENCY = 28;

const COLOR_HEX = {
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

const TINTED_FOLIAGE = new Set([
  "oak_leaves",
  "jungle_leaves",
  "acacia_leaves",
  "dark_oak_leaves",
  "mangrove_leaves",
  "vine",
  "sugar_cane",
  "lily_pad",
  "fern",
  "large_fern",
  "short_grass",
  "tall_grass",
  "bush",
]);

const FLAT_BLOCK_PARENTS = [
  "item/generated",
  "item/handheld",
  "block/cross",
  "block/tinted_cross",
  "block/torch",
  "block/rail_flat",
  "block/template_rail_raised",
  "block/crop",
  "block/flowerbed",
  "block/tinted_flower_pot_cross",
  "block/pane_post",
];

function stripNs(ref) {
  if (typeof ref !== "string") return "";
  return ref.replace(/^minecraft:/, "");
}

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return null;
  return res.json();
}

const modelCache = new Map();

async function getModel(modelRef) {
  const clean = stripNs(modelRef);
  if (!clean) return null;
  if (modelCache.has(clean)) return modelCache.get(clean);
  const p = fetchJson(`${BASE}/models/${clean}.json`).catch(() => null);
  modelCache.set(clean, p);
  return p;
}

/** Walk a model's parent chain and merge textures + collect parent names. */
async function resolveModelChain(modelRef, depth = 0) {
  if (!modelRef || depth > 8) return { textures: {}, parents: [] };
  const model = await getModel(modelRef);
  if (!model) return { textures: {}, parents: [] };
  const parentRef = model.parent ? stripNs(model.parent) : null;
  const base = parentRef
    ? await resolveModelChain(parentRef, depth + 1)
    : { textures: {}, parents: [] };
  const textures = { ...base.textures, ...(model.textures ?? {}) };
  const parents = [stripNs(modelRef), ...base.parents];
  return { textures, parents };
}

/** Resolve "#var" texture references inside a merged texture dictionary. */
function derefTexture(textures, key, depth = 0) {
  if (!key || depth > 8) return null;
  const val = textures[key];
  if (!val) return null;
  if (val.startsWith("#")) return derefTexture(textures, val.slice(1), depth + 1);
  return stripNs(val);
}

/** Extract the primary model reference from a 1.21.4+ items/<name>.json definition. */
function extractFromItemDef(node) {
  if (!node || typeof node !== "object") return null;
  const t = stripNs(node.type ?? "");
  if (t === "model" && typeof node.model === "string") {
    return { kind: "model", model: stripNs(node.model), tints: node.tints ?? null };
  }
  if (t === "special") {
    return {
      kind: "special",
      base: node.base ? stripNs(node.base) : null,
      special: node.model ?? null,
    };
  }
  if (t === "condition") {
    return extractFromItemDef(node.on_false) || extractFromItemDef(node.on_true);
  }
  if (t === "select") {
    if (node.fallback) {
      const fb = extractFromItemDef(node.fallback);
      if (fb) return fb;
    }
    if (Array.isArray(node.cases) && node.cases.length > 0) {
      return extractFromItemDef(node.cases[0]?.model);
    }
  }
  if (t === "range_dispatch") {
    if (node.fallback) {
      const fb = extractFromItemDef(node.fallback);
      if (fb) return fb;
    }
    if (Array.isArray(node.entries) && node.entries.length > 0) {
      return extractFromItemDef(node.entries[0]?.model);
    }
  }
  if (t === "composite" && Array.isArray(node.models)) {
    for (const m of node.models) {
      const res = extractFromItemDef(m);
      if (res) return res;
    }
  }
  return null;
}

function rgbIntToHex(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const v = n & 0xffffff;
  return "#" + v.toString(16).padStart(6, "0");
}

function extractColorFromName(name) {
  for (const c of Object.keys(COLOR_HEX)) {
    if (name.startsWith(`${c}_`)) return c;
  }
  return null;
}

function pickBlockTexName(ref, blockTexSet) {
  if (!ref) return null;
  const clean = stripNs(ref);
  if (clean.startsWith("block/")) {
    const n = clean.slice(6);
    if (blockTexSet.has(n)) return n;
  }
  return null;
}

function pickItemTexName(ref, itemTexSet) {
  if (!ref) return null;
  const clean = stripNs(ref);
  if (clean.startsWith("item/")) {
    const n = clean.slice(5);
    if (itemTexSet.has(n)) return n;
  }
  return null;
}

async function resolveItem(name, itemTexSet, blockTexSet) {
  if (name === "air") return null;

  // Special entity-rendered vanilla items with clean custom rendering
  if (name === "chest" || name === "trapped_chest" || name === "ender_chest") {
    return { k: "special", type: name };
  }
  if (name.endsWith("copper_chest")) {
    return { k: "special", type: "copper_chest", variant: name };
  }
  if (name === "shulker_box" || name.endsWith("_shulker_box")) {
    const col = extractColorFromName(name);
    return { k: "special", type: "shulker_box", color: col ? COLOR_HEX[col] : "#8932b8" };
  }
  if (name.endsWith("_banner")) {
    const col = extractColorFromName(name);
    return { k: "special", type: "banner", color: col ? COLOR_HEX[col] : "#f9fffe" };
  }
  if (name.endsWith("_bed")) {
    const col = extractColorFromName(name);
    return { k: "special", type: "bed", color: col ? COLOR_HEX[col] : "#b02e26" };
  }
  if (name === "shield") {
    return { k: "special", type: "shield" };
  }
  if (
    name === "player_head" ||
    name === "zombie_head" ||
    name === "skeleton_skull" ||
    name === "wither_skeleton_skull" ||
    name === "creeper_head" ||
    name === "dragon_head" ||
    name === "piglin_head"
  ) {
    return { k: "special", type: "head", variant: name };
  }
  if (name === "decorated_pot") {
    return { k: "special", type: "decorated_pot" };
  }
  if (name === "conduit") {
    return { k: "special", type: "conduit" };
  }

  // Potions & tipped arrow (with overlay tinting!)
  if (name === "potion" || name === "splash_potion" || name === "lingering_potion") {
    return { k: "item", tex: `item/${name}`, overlay: "item/potion_overlay", tint: "#385dc6" };
  }
  if (name === "tipped_arrow") {
    return { k: "item", tex: "item/tipped_arrow_base", overlay: "item/tipped_arrow_head", tint: "#385dc6" };
  }

  // Leather armor / horse armor (supports dyed color!)
  if (
    name === "leather_helmet" ||
    name === "leather_chestplate" ||
    name === "leather_leggings" ||
    name === "leather_boots"
  ) {
    return { k: "item", tex: `item/${name}`, overlay: `item/${name}_overlay`, tint: "#a06540", tintBase: true };
  }
  if (name === "leather_horse_armor" || name === "wolf_armor") {
    return {
      k: "item",
      tex: `item/${name}`,
      overlay: itemTexSet.has(`${name}_overlay`) ? `item/${name}_overlay` : undefined,
      tint: "#a06540",
      tintBase: true,
    };
  }

  // Fast path: direct 2D item texture (except spawn eggs or grass/foliage that need tint)
  if (itemTexSet.has(name)) {
    return `i:${name}`;
  }

  // Walk official 1.21.11 items/<name>.json -> models/*.json
  const itemDef = await fetchJson(`${BASE}/items/${name}.json`).catch(() => null);
  const extracted = itemDef?.model ? extractFromItemDef(itemDef.model) : null;

  let tintHex = null;
  if (extracted?.tints && Array.isArray(extracted.tints) && extracted.tints.length > 0) {
    const t0 = extracted.tints[0];
    const tType = stripNs(t0?.type ?? "");
    if (tType === "constant" && typeof t0.value === "number") {
      tintHex = rgbIntToHex(t0.value);
    } else if (tType === "grass") {
      tintHex = "#79c05a";
    } else if (tType === "dye" && typeof t0.default === "number") {
      tintHex = rgbIntToHex(t0.default);
    }
  }
  if (!tintHex && TINTED_FOLIAGE.has(name)) {
    tintHex = name === "spruce_leaves" ? "#619961" : name === "birch_leaves" ? "#80a755" : "#59ae30";
  }
  if (name === "spruce_leaves") tintHex = "#619961";
  if (name === "birch_leaves") tintHex = "#80a755";

  const modelRef =
    extracted?.kind === "model"
      ? extracted.model
      : extracted?.kind === "special" && extracted.base
        ? extracted.base
        : `item/${name}`;

  const { textures, parents } = await resolveModelChain(modelRef);

  const layer0 = derefTexture(textures, "layer0");
  const layer1 = derefTexture(textures, "layer1");
  const isFlat =
    Boolean(layer0) ||
    parents.some((p) => FLAT_BLOCK_PARENTS.some((fp) => p === fp || p.endsWith("/" + fp)));

  if (layer0) {
    const itemTex = pickItemTexName(layer0, itemTexSet);
    const blkTex = pickBlockTexName(layer0, blockTexSet);
    const tex = itemTex ? `item/${itemTex}` : blkTex ? `block/${blkTex}` : null;
    if (tex) {
      const ovItem = pickItemTexName(layer1, itemTexSet);
      const ovBlk = pickBlockTexName(layer1, blockTexSet);
      const overlay = ovItem ? `item/${ovItem}` : ovBlk ? `block/${ovBlk}` : undefined;
      if (tintHex || overlay) {
        return { k: "item", tex, ...(overlay ? { overlay } : {}), ...(tintHex ? { tint: tintHex } : {}) };
      }
      return itemTex ? `i:${itemTex}` : `b:${blkTex}`;
    }
  }

  // Resolve block cube faces (top, front/left, side/right)
  const texAll =
    derefTexture(textures, "all") ||
    derefTexture(textures, "texture") ||
    derefTexture(textures, "wool") ||
    derefTexture(textures, "planks") ||
    derefTexture(textures, "wall") ||
    derefTexture(textures, "particle");

  const texTop =
    derefTexture(textures, "top") ||
    derefTexture(textures, "up") ||
    derefTexture(textures, "end") ||
    derefTexture(textures, "cap") ||
    texAll;

  const texFront =
    derefTexture(textures, "front") ||
    derefTexture(textures, "north") ||
    derefTexture(textures, "side") ||
    derefTexture(textures, "east") ||
    derefTexture(textures, "bark") ||
    texAll ||
    texTop;

  const texSide =
    derefTexture(textures, "side") ||
    derefTexture(textures, "west") ||
    derefTexture(textures, "south") ||
    derefTexture(textures, "front") ||
    texFront ||
    texAll;

  const bTop = pickBlockTexName(texTop, blockTexSet);
  const bFront = pickBlockTexName(texFront, blockTexSet);
  const bSide = pickBlockTexName(texSide, blockTexSet);

  // If it's a flat plant/torch/rail/pane/cross block with a block texture
  const bCross =
    pickBlockTexName(derefTexture(textures, "cross"), blockTexSet) ||
    pickBlockTexName(derefTexture(textures, "plant"), blockTexSet) ||
    pickBlockTexName(derefTexture(textures, "torch"), blockTexSet) ||
    pickBlockTexName(derefTexture(textures, "rail"), blockTexSet) ||
    pickBlockTexName(derefTexture(textures, "pane"), blockTexSet) ||
    pickBlockTexName(derefTexture(textures, "fan"), blockTexSet) ||
    pickBlockTexName(derefTexture(textures, "flower"), blockTexSet) ||
    pickBlockTexName(derefTexture(textures, "stem"), blockTexSet);

  if (bCross || (isFlat && (bFront || bTop))) {
    const chosen = bCross || bFront || bTop;
    if (tintHex) return { k: "item", tex: `block/${chosen}`, tint: tintHex };
    return `b:${chosen}`;
  }

  if (bTop || bFront || bSide) {
    const t = bTop || bFront || bSide;
    const l = bFront || bSide || t;
    const r = bSide || bFront || t;
    if (t === l && l === r && !tintHex) {
      return `c:${t}`;
    }
    return {
      k: "cube",
      t,
      l,
      r,
      ...(tintHex ? { tint: tintHex, tintTopOnly: name === "grass_block" } : {}),
    };
  }

  // Fallback heuristics: check direct block texture or any texture value in model
  if (blockTexSet.has(name)) {
    return tintHex ? { k: "cube", t: name, l: name, r: name, tint: tintHex } : `c:${name}`;
  }
  for (const val of Object.values(textures)) {
    const resolved = val.startsWith("#") ? derefTexture(textures, val.slice(1)) : stripNs(val);
    const it = pickItemTexName(resolved, itemTexSet);
    if (it) return `i:${it}`;
    const bt = pickBlockTexName(resolved, blockTexSet);
    if (bt) return `c:${bt}`;
  }

  return null;
}

/** Extract matching PNG entries from a ZIP/JAR buffer using Node's built-in zlib. */
function extractZipPngs(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return [];
  const cdOffset = buf.readUInt32LE(eocd + 16);
  const count = buf.readUInt16LE(eocd + 10);
  const files = [];
  let off = cdOffset;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localHeaderOff = buf.readUInt32LE(off + 42);
    const name = buf.toString("utf8", off + 46, off + 46 + nameLen);
    off += 46 + nameLen + extraLen + commentLen;

    const match = name.match(/^assets\/([a-z0-9_.-]+)\/textures\/(item|block|mob_effect)\/(.+)\.png$/);
    if (!match) continue;
    if (buf.readUInt32LE(localHeaderOff) !== 0x04034b50) continue;
    const lNameLen = buf.readUInt16LE(localHeaderOff + 26);
    const lExtraLen = buf.readUInt16LE(localHeaderOff + 28);
    const dataStart = localHeaderOff + 30 + lNameLen + lExtraLen;
    const slice = buf.subarray(dataStart, dataStart + compSize);
    const data = method === 0 ? slice : method === 8 ? inflateRawSync(slice) : null;
    if (!data) continue;
    files.push({ namespace: match[1], kind: match[2], name: match[3], data });
  }
  return files;
}

async function extractServerModTextures() {
  const token = process.env.EXAROTON_TOKEN ?? "";
  const serverId = (process.env.EXAROTON_SERVER_ID ?? "").replace(/^#/, "");
  const modsMap = {};
  if (!token || !serverId) {
    console.log("Skipping Exaroton mod texture extraction (no credentials).");
    return modsMap;
  }

  const targetJars = [
    "lifesteal-fabric-10.0.7-1.21.11.jar",
    "indestructible_blocks-fabric-1.0.5-1.21.11.jar",
  ];

  for (const jar of targetJars) {
    const res = await fetch(
      `https://api.exaroton.com/v1/servers/${encodeURIComponent(serverId)}/files/data/mods/${encodeURIComponent(jar)}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) }
    );
    if (!res.ok) continue;
    const buf = Buffer.from(await res.arrayBuffer());
    const extracted = extractZipPngs(buf);
    for (const file of extracted) {
      const relUrl = `/mc-assets/mods/${file.namespace}/${file.kind}/${file.name}.png`;
      const diskPath = join(process.cwd(), "public", "mc-assets", "mods", file.namespace, file.kind, `${file.name}.png`);
      mkdirSync(dirname(diskPath), { recursive: true });
      writeFileSync(diskPath, file.data);
      const itemId = `${file.namespace}:${file.name}`;
      if (file.kind === "item" || file.kind === "block") {
        modsMap[itemId] = { k: file.kind === "block" ? "mod_cube" : "mod_item", url: relUrl };
      }
    }
    console.log(`Extracted ${extracted.length} texture(s) from ${jar}`);
  }
  return modsMap;
}

async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let next = 0;
  async function runner() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runner));
  return results;
}

async function main() {
  console.log(`Fetching Minecraft ${MC_VERSION} asset manifests from assets.mcasset.cloud…`);
  const [itemsList, itemTexList, blockTexList, effectTexList] = await Promise.all([
    fetchJson(`${BASE}/items/_list.json`),
    fetchJson(`${BASE}/textures/item/_list.json`),
    fetchJson(`${BASE}/textures/block/_list.json`),
    fetchJson(`${BASE}/textures/mob_effect/_list.json`),
  ]);

  const itemTexSet = new Set(itemTexList.files.filter((f) => f.endsWith(".png")).map((f) => f.slice(0, -4)));
  const blockTexSet = new Set(blockTexList.files.filter((f) => f.endsWith(".png")).map((f) => f.slice(0, -4)));
  const effects = effectTexList.files.filter((f) => f.endsWith(".png")).map((f) => f.slice(0, -4)).sort();
  const allItems = itemsList.files.filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();

  console.log(`Resolving ${allItems.length} vanilla 1.21.11 items…`);
  const [resolved, mods] = await Promise.all([
    runPool(allItems, (name) => resolveItem(name, itemTexSet, blockTexSet), CONCURRENCY),
    extractServerModTextures(),
  ]);

  const items = {};
  const unresolved = [];
  for (let i = 0; i < allItems.length; i++) {
    const name = allItems[i];
    if (name === "air") continue;
    const desc = resolved[i];
    if (desc) items[name] = desc;
    else unresolved.push(name);
  }

  console.log(`Resolved ${Object.keys(items).length}/${allItems.length - 1} items. Unresolved (${unresolved.length}):`, unresolved.slice(0, 30));

  const outPath = join(process.cwd(), "src", "lib", "mc-asset-index.json");
  const payload = {
    version: MC_VERSION,
    cdnBase: `${BASE}/textures`,
    effects,
    mods,
    items,
  };
  writeFileSync(outPath, JSON.stringify(payload));
  console.log(`Wrote ${outPath} (${(Buffer.byteLength(JSON.stringify(payload)) / 1024).toFixed(1)} KB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
