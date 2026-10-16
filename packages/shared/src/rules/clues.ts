import { DIRECTIONS, dirFromVector } from '../direction';

// Clue placement and the per-scene cap (GDD 3.4, A30). Pure functions; the room writes the schema.

/** `Clue.dir` (an index into DIRECTIONS) of the trail that runs from a tile toward another. */
export function trailDir(fromTx: number, fromTy: number, toTx: number, toTy: number): number {
  return DIRECTIONS.indexOf(dirFromVector(toTx - fromTx, toTy - fromTy, 's'));
}

export interface Tile {
  x: number;
  y: number;
}

/**
 * The walkable tile beside a portal where a Thread snags: the 8 neighbours first (edges before
 * corners), the one nearest to `near` winning; the portal tile itself when none is walkable.
 */
export function besideTile(portal: Tile, near: Tile, walkable: (tx: number, ty: number) => boolean): Tile {
  const around: Tile[] = [];
  for (const [dx, dy] of [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ] as const) {
    if (walkable(portal.x + dx, portal.y + dy)) around.push({ x: portal.x + dx, y: portal.y + dy });
  }
  const rank = (t: Tile): number => (t.x === portal.x || t.y === portal.y ? 0 : 1);
  around.sort(
    (a, b) =>
      rank(a) - rank(b) || Math.hypot(a.x - near.x, a.y - near.y) - Math.hypot(b.x - near.x, b.y - near.y),
  );
  return around[0] ?? { x: portal.x, y: portal.y };
}

export interface CapClue {
  id: string;
  claimed: boolean;
  /** Spawn order within the scene; smaller is older. */
  seq: number;
}

/**
 * Ids to drop so a scene holds at most `cap` clues: the oldest claimed clue goes first, then the oldest
 * of the rest (GDD 3.4). `keep` ids are never dropped.
 */
export function evictOverCap(
  clues: readonly CapClue[],
  cap: number,
  keep: ReadonlySet<string> = new Set(),
): string[] {
  const over = clues.length - cap;
  if (over <= 0) return [];
  const order = clues
    .filter((c) => !keep.has(c.id))
    .sort((a, b) => Number(b.claimed) - Number(a.claimed) || a.seq - b.seq);
  return order.slice(0, over).map((c) => c.id);
}
