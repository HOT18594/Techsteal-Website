// Pixel-art icons for the Techsteal nav rail.
// Each icon is a set of filled rectangles on a 16x16 grid: [x, y, w, h].
// Pixel art = rects (no strokes); shapeRendering="crispEdges" keeps them blocky
// and Minecraft-styled at any size. fill="currentColor" inherits the nav color.

export type PixelIconDef = [number, number, number, number][]; // [x, y, w, h]

export const navIcons = {
  // House: peaked roof + walls + door
  home: [
    [7, 1, 2, 1],
    [6, 2, 4, 1],
    [5, 3, 6, 1],
    [4, 4, 8, 1],
    [3, 5, 10, 1],
    [3, 6, 1, 7],
    [12, 6, 1, 7],
    [3, 13, 10, 1],
    [7, 9, 2, 4],
  ],
  // Plus in a rounded square (How to Join / setup)
  join: [
    [2, 2, 12, 1],
    [2, 13, 12, 1],
    [2, 2, 1, 12],
    [13, 2, 1, 12],
    [7, 4, 2, 8],
    [4, 7, 8, 2],
  ],
  // Speech bubble (Community / posts)
  community: [
    [3, 2, 10, 1],
    [2, 3, 12, 7],
    [3, 10, 3, 1],
    [4, 11, 2, 1],
    [5, 12, 2, 1],
    [6, 13, 2, 1],
    [5, 5, 6, 1],
    [5, 8, 4, 1],
  ],
  // Document / page with lines (Blog / news)
  blog: [
    [3, 1, 8, 1],
    [3, 14, 8, 1],
    [3, 1, 1, 14],
    [10, 1, 1, 14],
    [11, 2, 2, 1],
    [11, 3, 2, 1],
    [11, 4, 2, 1],
    [5, 4, 4, 1],
    [5, 6, 4, 1],
    [5, 8, 4, 1],
    [5, 10, 3, 1],
  ],
  // Gear (Settings)
  settings: [
    [7, 1, 2, 2],
    [7, 13, 2, 2],
    [1, 7, 2, 2],
    [13, 7, 2, 2],
    [3, 3, 2, 1],
    [11, 3, 2, 1],
    [3, 12, 2, 1],
    [11, 12, 2, 1],
    [3, 3, 1, 2],
    [12, 3, 1, 2],
    [3, 11, 1, 2],
    [12, 11, 1, 2],
    [5, 5, 6, 1],
    [5, 10, 6, 1],
    [5, 5, 1, 6],
    [10, 5, 1, 6],
    [7, 7, 2, 2],
  ],
  // Left-pointing chevron (rotates 180deg to point right when collapsed)
  chevron: [
    [4, 3, 2, 1],
    [5, 4, 2, 1],
    [6, 5, 2, 1],
    [7, 6, 2, 1],
    [8, 7, 2, 1],
    [7, 8, 2, 1],
    [6, 9, 2, 1],
    [5, 10, 2, 1],
    [4, 11, 2, 1],
  ],
} satisfies Record<string, PixelIconDef>;

export type IconName = keyof typeof navIcons;

export function PixelIcon({
  name,
  className,
}: {
  name: IconName;
  className?: string;
}) {
  const rects = navIcons[name];
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="currentColor"
      shapeRendering="crispEdges"
      className={className}
      aria-hidden="true"
    >
      {rects.map(([x, y, w, h], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} />
      ))}
    </svg>
  );
}
