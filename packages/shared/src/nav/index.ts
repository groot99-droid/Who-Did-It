// The `.nav.json` contract (docs/ASSETS.md 6.3): one solid/walkable bitmap per scene, written by
// tools/grid/export.ts from the ASCII grid today and by the Tiled exporter from M6 with the same shape.
// Server and client load it through `createNavGrid` so both sides agree on every wall.

export const NAV_VERSION = 1;

export type NavProfile = 'small' | 'medium' | 'large';
export const NAV_PROFILE_RANK: Record<NavProfile, number> = { small: 0, medium: 1, large: 2 };

/** Floor tiles that are solid below `minProfile` (district gates on the overworld). */
export interface NavGate {
  id: string;
  minProfile: NavProfile;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NavData {
  version: typeof NAV_VERSION;
  sceneId: string;
  /** Tile edge in pixels; the exporter refuses anything but TILE_PX. */
  tile: number;
  w: number;
  h: number;
  /** `h` strings of `w` characters, '1' solid and '0' walkable. Origin top-left, y down. */
  solid: string[];
  gates: NavGate[];
}

/** What collision needs from a scene: tile size, bounds and a solidity query. Out of bounds is solid. */
export interface SolidQuery {
  readonly tile: number;
  readonly w: number;
  readonly h: number;
  solidAt(tx: number, ty: number): boolean;
}

export class NavGrid implements SolidQuery {
  readonly tile: number;
  readonly w: number;
  readonly h: number;
  private readonly bits: Uint8Array;

  constructor(
    readonly data: NavData,
    profile: NavProfile,
  ) {
    this.tile = data.tile;
    this.w = data.w;
    this.h = data.h;
    this.bits = new Uint8Array(data.w * data.h);
    for (let y = 0; y < data.h; y++) {
      const row = data.solid[y] ?? '';
      for (let x = 0; x < data.w; x++) this.bits[y * data.w + x] = row[x] === '1' ? 1 : 0;
    }
    const rank = NAV_PROFILE_RANK[profile];
    for (const g of data.gates) {
      if (NAV_PROFILE_RANK[g.minProfile] <= rank) continue;
      for (let y = g.y; y < g.y + g.h; y++)
        for (let x = g.x; x < g.x + g.w; x++) if (this.inBounds(x, y)) this.bits[y * data.w + x] = 1;
    }
  }

  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h;
  }

  solidAt(tx: number, ty: number): boolean {
    return !this.inBounds(tx, ty) || this.bits[ty * this.w + tx] === 1;
  }

  /** Pixel position to solidity, for callers that think in pixels. */
  solidAtPx(px: number, py: number): boolean {
    return this.solidAt(Math.floor(px / this.tile), Math.floor(py / this.tile));
  }
}

export function createNavGrid(data: NavData, profile: NavProfile): NavGrid {
  return new NavGrid(data, profile);
}

/** Structural check for data read from disk or the network; returns the problem or null. */
export function navProblem(d: unknown): string | null {
  const n = d as Partial<NavData> | null;
  if (n === null || typeof n !== 'object') return 'not an object';
  if (n.version !== NAV_VERSION) return `version must be ${NAV_VERSION}`;
  if (!Number.isInteger(n.w) || !Number.isInteger(n.h) || (n.w as number) < 1 || (n.h as number) < 1)
    return 'w and h must be positive integers';
  if (!Number.isInteger(n.tile) || (n.tile as number) < 1) return 'tile must be a positive integer';
  if (!Array.isArray(n.solid) || n.solid.length !== n.h) return 'solid must have h rows';
  for (const row of n.solid)
    if (typeof row !== 'string' || row.length !== n.w || /[^01]/.test(row)) return 'bad solid row';
  if (!Array.isArray(n.gates)) return 'gates must be an array';
  return null;
}
