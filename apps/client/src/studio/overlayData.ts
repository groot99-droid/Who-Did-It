// Round 9 (9T, docs/round9/admin-studio.md 2): what each Studio overlay draws, from the scene JSON and the nav
// bitmap of `@wdi/content`. Pure (tile coordinates, no Phaser), so it is tested; `OverlayView` paints it.
import mobs from '@wdi/content/data/mobs.json';
import { TILE_PX } from '@wdi/shared/constants';
import { balance, navs, type Profile, type SceneId, scenes } from '@wdi/content';
import type { StudioDayPhase } from '@wdi/shared/protocol';

export const OVERLAYS = [
  'collision',
  'nav',
  'coords',
  'ids',
  'lights',
  'sight',
  'footprints',
  'gating',
] as const;
export type OverlayId = (typeof OVERLAYS)[number];

export const PROFILE_RANK: Record<Profile, number> = { small: 0, medium: 1, large: 2 };
const PROFILES: readonly Profile[] = ['small', 'medium', 'large'];

export interface Tile {
  x: number;
  y: number;
}
export interface Label extends Tile {
  id: string;
  kind: 'prop' | 'portal' | 'spawn' | 'spot' | 'light';
}
export interface Ring extends Tile {
  id: string;
  /** Radius in tiles. */
  r: number;
}
export interface Rect extends Tile {
  w: number;
  h: number;
  id: string;
}
export interface Hidden extends Tile {
  id: string;
  /** The profiles at which this object is absent or closed. */
  hiddenAt: Profile[];
}

const scene = (id: string) => scenes[id as SceneId];
const nav = (id: string) => navs[id as SceneId];

/** True when a nav tile is solid at `profile`: the baked solids plus every gate below its `minProfile`. */
function solidAt(id: string, profile: Profile): boolean[][] {
  const n = nav(id);
  const grid = n.solid.map((row) => [...row].map((c) => c === '1'));
  for (const g of n.gates) {
    if (PROFILE_RANK[profile] >= PROFILE_RANK[g.minProfile]) continue;
    for (let y = g.y; y < g.y + g.h; y++)
      for (let x = g.x; x < g.x + g.w; x++) if (grid[y]?.[x] !== undefined) grid[y]![x] = true;
  }
  return grid;
}

/** Tiles the figure cannot enter at `profile` (the collision grid). */
export function solidTiles(id: string, profile: Profile): Tile[] {
  const out: Tile[] = [];
  solidAt(id, profile).forEach((row, y) => row.forEach((s, x) => s && out.push({ x, y })));
  return out;
}

/** Links between 4-neighbour walkable tiles at `profile`, as tile pairs (the walkable graph). */
export function walkLinks(id: string, profile: Profile): Array<[Tile, Tile]> {
  const g = solidAt(id, profile);
  const out: Array<[Tile, Tile]> = [];
  g.forEach((row, y) =>
    row.forEach((s, x) => {
      if (s) return;
      if (row[x + 1] === false)
        out.push([
          { x, y },
          { x: x + 1, y },
        ]);
      if (g[y + 1]?.[x] === false)
        out.push([
          { x, y },
          { x, y: y + 1 },
        ]);
    }),
  );
  return out;
}

/** The ids of props, portals, spawns, spots and lights of a scene, at their tiles. */
export function idLabels(id: string): Label[] {
  const s = scene(id);
  return [
    ...s.props.map((p) => ({ id: p.id, kind: 'prop' as const, x: p.x, y: p.y })),
    ...s.portals.map((p) => ({ id: p.id, kind: 'portal' as const, x: p.x, y: p.y })),
    ...s.spawns.map((p) => ({ id: p.id, kind: 'spawn' as const, x: p.x, y: p.y })),
    ...s.spots.map((p) => ({ id: p.id, kind: 'spot' as const, x: p.x, y: p.y })),
    ...(s.lights ?? []).map((p) => ({ id: p.id, kind: 'light' as const, x: p.x, y: p.y })),
  ];
}

export function lightRings(id: string): Ring[] {
  return (scene(id).lights ?? []).map((l) => ({ id: l.id, x: l.x, y: l.y, r: l.radiusTiles }));
}

/** The tiles a multi-tile prop covers. */
export function footprints(id: string): Rect[] {
  return scene(id).props.flatMap((p) => (p.footprint ? [{ id: p.id, ...p.footprint }] : []));
}

/** What the figure sees at `phase`, in tiles (GDD 3.7): night is the short ring, every other phase the long one. */
export function visionTiles(phase: StudioDayPhase): number {
  return phase === 'night' ? balance.vision.nightTiles : balance.vision.dayTiles;
}

/**
 * What is absent or closed at `profile` (GDD 3.13): portals below their `minProfile`, props whose `profiles` list
 * leaves it out, and gates below theirs.
 */
export function hiddenAtProfile(id: string, profile: Profile): Hidden[] {
  const s = scene(id);
  const below = (min: Profile) => PROFILES.filter((p) => PROFILE_RANK[p] < PROFILE_RANK[min]);
  const out: Hidden[] = [];
  for (const p of s.portals)
    if (below(p.minProfile).includes(profile))
      out.push({ id: p.id, x: p.x, y: p.y, hiddenAt: below(p.minProfile) });
  for (const g of s.gates)
    if (below(g.minProfile).includes(profile))
      out.push({ id: g.id, x: g.x, y: g.y, hiddenAt: below(g.minProfile) });
  for (const p of s.props) {
    if (p.profiles === undefined || p.profiles.includes(profile)) continue;
    out.push({ id: p.id, x: p.x, y: p.y, hiddenAt: PROFILES.filter((q) => !p.profiles!.includes(q)) });
  }
  return out;
}

/** The sense range of each mob stand-in, in tiles (GDD 3.15): where it notices the figure and gives chase. */
export function senseRings(
  spawns: ReadonlyArray<{ id: string; kind: string; ref: string; px: number; py: number }>,
): Ring[] {
  const table = mobs.mobs as Record<string, { senseTiles: number }>;
  return spawns.flatMap((sp) => {
    const m = sp.kind === 'mob' ? table[sp.ref] : undefined;
    return m ? [{ id: sp.id, x: sp.px / TILE_PX, y: sp.py / TILE_PX, r: m.senseTiles }] : [];
  });
}
