/** The only direction table (docs/ASSETS.md 6.2): index 0 = n (screen up), then clockwise. */
export const DIRECTIONS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;
export type Direction = (typeof DIRECTIONS)[number];

/**
 * Maps a movement vector in screen space (x right, y down, as in Phaser) to one of 8 directions.
 * A zero vector returns `fallback` so an idle sprite keeps its facing.
 */
export function dirFromVector(dx: number, dy: number, fallback: Direction = 's'): Direction {
  if (dx === 0 && dy === 0) return fallback;
  // Angle clockwise from screen-up: atan2(dx, -dy) is 0 for up, +90 deg for right.
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return DIRECTIONS[idx] as Direction;
}
