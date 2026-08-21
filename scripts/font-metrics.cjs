// Parse TTF metrics: per-glyph ink bounds for chosen character sets.
// Read-only analysis used to derive @font-face ascent/descent overrides.
const fs = require("fs");

function parseTTF(path) {
  const buf = fs.readFileSync(path);
  const u16 = (o) => buf.readUInt16BE(o);
  const i16 = (o) => buf.readInt16BE(o);
  const u32 = (o) => buf.readUInt32BE(o);
  const tag = (o) => buf.toString("latin1", o, o + 4);

  const numTables = u16(4);
  const tables = {};
  for (let i = 0; i < numTables; i++) {
    const off = 12 + i * 16;
    tables[tag(off)] = { offset: u32(off + 8), length: u32(off + 12) };
  }

  const head = tables.head.offset;
  const unitsPerEm = u16(head + 18);
  const indexToLocFormat = i16(head + 50);

  const hhea = tables.hhea.offset;
  const hheaAscent = i16(hhea + 4);
  const hheaDescent = i16(hhea + 6);

  let os2 = null;
  if (tables.OS_2) {
    const o = tables.OS_2.offset;
    os2 = {
      typoAscender: i16(o + 68),
      typoDescender: i16(o + 70),
      winAscent: u16(o + 74),
      winDescent: u16(o + 76),
    };
  }

  // cmap: find a (3,1) or (0,x) subtable, handle format 4 and format 12
  const cmap = tables.cmap.offset;
  const subCount = u16(cmap + 2);
  let sub = null;
  for (let i = 0; i < subCount; i++) {
    const rec = cmap + 4 + i * 8;
    const platform = u16(rec);
    const encoding = u16(rec + 2);
    if (platform === 3 && encoding === 1) { sub = cmap + u32(rec + 4); break; }
    if (platform === 0) sub = cmap + u32(rec + 4);
  }
  const charToGlyph = {};
  const format = u16(sub);
  if (format === 4) {
    const segCountX2 = u16(sub + 6);
    const segCount = segCountX2 / 2;
    const endCodes = sub + 14;
    const startCodes = endCodes + segCountX2 + 2;
    const idDeltas = startCodes + segCountX2;
    const idRangeOffsets = idDeltas + segCountX2;
    for (let s = 0; s < segCount; s++) {
      const end = u16(endCodes + s * 2);
      const start = u16(startCodes + s * 2);
      const delta = i16(idDeltas + s * 2);
      const rangeOff = u16(idRangeOffsets + s * 2);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let g;
        if (rangeOff === 0) {
          g = (c + delta) & 0xffff;
        } else {
          const addr = idRangeOffsets + s * 2 + rangeOff + (c - start) * 2;
          g = u16(addr);
          if (g !== 0) g = (g + delta) & 0xffff;
        }
        if (g !== 0) charToGlyph[c] = g;
      }
    }
  } else if (format === 12) {
    const nGroups = u32(sub + 12);
    for (let gi = 0; gi < nGroups; gi++) {
      const rec = sub + 16 + gi * 12;
      const start = u32(rec);
      const end = u32(rec + 4);
      const startG = u32(rec + 8);
      for (let c = start; c <= end; c++) charToGlyph[c] = startG + (c - start);
    }
  } else {
    throw new Error("unsupported cmap format " + format);
  }

  // loca
  const locaOff = tables.loca.offset;
  const loca = (i) =>
    indexToLocFormat === 0 ? u16(locaOff + i * 2) * 2 : u32(locaOff + i * 4);

  const glyfOff = tables.glyf.offset;

  function glyphBounds(g) {
    const start = loca(g);
    const end = loca(g + 1);
    if (end <= start) return null; // empty glyph
    const o = glyfOff + start;
    return { xMin: i16(o + 2), yMin: i16(o + 4), xMax: i16(o + 6), yMax: i16(o + 8) };
  }

  return { unitsPerEm, hheaAscent, hheaDescent, os2, charToGlyph, glyphBounds };
}

function analyze(path, label) {
  const f = parseTTF(path);
  const upm = f.unitsPerEm;
  const pct = (v) => +(v / upm * 100).toFixed(2);

  const sets = {
    "caps A-Z": "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    "digits 0-9": "0123456789",
    "lower a-z": "abcdefghijklmnopqrstuvwxyz",
    "no-descenders (caps+lower-minus-desc+digits)":
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789acefghkmnoprstuvwxyz",
    "TECHSTEAL": "TECHSTEAL",
    "typical title (Server History 5)": "ServerHistory5",
  };

  console.log(`\n=== ${label} (${path}) ===`);
  console.log(`unitsPerEm: ${upm}`);
  console.log(`hhea ascent/descent: ${pct(f.hheaAscent)}% / ${pct(f.hheaDescent)}%`);
  if (f.os2) {
    console.log(
      `OS/2 typo: ${pct(f.os2.typoAscender)}% / ${pct(f.os2.typoDescender)}%  win: ${pct(f.os2.winAscent)}% / ${pct(f.os2.winDescent)}%`
    );
  }
  for (const [name, chars] of Object.entries(sets)) {
    let top = -Infinity;
    let bottom = Infinity;
    let missing = [];
    for (const ch of chars) {
      const g = f.charToGlyph[ch.codePointAt(0)];
      if (!g) { missing.push(ch); continue; }
      const b = f.glyphBounds(g);
      if (!b) { missing.push(ch); continue; }
      if (b.yMax > top) top = b.yMax;
      if (b.yMin < bottom) bottom = b.yMin;
    }
    if (top === -Infinity) { console.log(`  ${name}: no glyphs`); continue; }
    const C = (top + bottom) / 2; // ink center above baseline
    console.log(
      `  ${name}: inkTop ${pct(top)}% inkBottom ${pct(bottom)}%  ->  inkCenter C = ${pct(C)}%  (ascent-override for centering: ${pct(2 * C)}%)${missing.length ? "  missing: " + missing.join("") : ""}`
    );
  }
}

analyze("public/fonts/Minecraftia-Regular.ttf", "Minecraft Pixel (Minecraftia)");
analyze("public/fonts/Minecraft.ttf", "Minecraft Logo");
