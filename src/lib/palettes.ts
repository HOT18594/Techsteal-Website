export const PALETTES = [
  { id: "graphite", name: "Graphite", colors: ["#191919", "#252525", "#d2d2cb"] },
  { id: "stone", name: "Stone", colors: ["#171916", "#20231e", "#c6b79d"] },
  { id: "forest", name: "Forest", colors: ["#111c17", "#1c2b22", "#accb9b"] },
  { id: "sandstone", name: "Sandstone", colors: ["#211d18", "#302921", "#dcc99f"] },
  { id: "ember", name: "Ember", colors: ["#211916", "#30221d", "#e8b293"] },
  { id: "rose", name: "Rosewood", colors: ["#20191d", "#2e2229", "#ddb4c5"] },
  { id: "amethyst", name: "Amethyst", colors: ["#1c1922", "#292331", "#c9b6e4"] },
  { id: "ocean", name: "Ocean", colors: ["#171d20", "#212d32", "#a4c6d3"] },
  { id: "emerald", name: "Emerald", colors: ["#101b15", "#192c22", "#4ade80"] },
  { id: "diamond", name: "Diamond", colors: ["#101920", "#192935", "#38bdf8"] },
  { id: "crimson", name: "Redstone", colors: ["#211317", "#311c22", "#fb7185"] },
  { id: "gold", name: "Gold", colors: ["#1f1a11", "#2f2719", "#facc15"] },
] as const;

export type PaletteId = (typeof PALETTES)[number]["id"];
export const DEFAULT_PALETTE: PaletteId = "graphite";
export const PALETTE_STORAGE_KEY = "techsteal-palette";
export function isPaletteId(value: unknown): value is PaletteId {
  return PALETTES.some((palette) => palette.id === value);
}

export function getPaletteThemeColor(id: PaletteId): string {
  return PALETTES.find((palette) => palette.id === id)?.colors[0] ?? PALETTES[0].colors[0];
}

const PALETTE_THEME_COLORS = Object.fromEntries(
  PALETTES.map((p) => [p.id, p.colors[0]])
);

// Apply the allow-listed preference before first paint, including when storage
// is blocked. No account data or user-provided CSS is accepted.
export const paletteBootstrap = `try{var m=${JSON.stringify(PALETTE_THEME_COLORS)},p=localStorage.getItem(${JSON.stringify(PALETTE_STORAGE_KEY)});if(p&&Object.prototype.hasOwnProperty.call(m,p)){document.documentElement.dataset.palette=p;var t=document.querySelector('meta[name="theme-color"]');if(t)t.setAttribute("content",m[p])}}catch{}`;
