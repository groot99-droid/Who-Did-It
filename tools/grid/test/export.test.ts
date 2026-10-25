import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createNavGrid, navFromGrid } from '@wdi/shared';
import { formatJson } from '../../../packages/content/scripts/lint-data.mjs';
import type { Scene } from '@wdi/content';
import {
  SCENES_DIR,
  SIDE,
  assertGroundCell,
  assertNavTile,
  buildOutputs,
  gidOf,
  kitFrameOf,
  loadScenes,
  navFor,
  portalFace,
  staleOutputs,
  tileLayers,
  tilemapFor,
} from '../export';

const scenes = loadScenes();
const byId = (id: string) => scenes.find((s) => s.id === id)!;

/**
 * A small cutaway room (docs/SPRITES.md 10.15): an inner pillar, a door in the south wall and one in the east
 * wall, a flagstone patch on the planks and a covered prop tile in the north wall.
 */
const ROOM: Scene = {
  id: 'room',
  prefix: 'rm',
  name: 'Fixture room',
  zoneId: 'room',
  profile: 'small',
  kind: 'interior',
  biome: 'house',
  dark: false,
  size: { w: 8, h: 7 },
  notes: '',
  worldRef: '4.3',
  portals: [
    {
      id: 'rm.south',
      from: 'room',
      x: 3,
      y: 6,
      kind: 'door',
      to: null,
      toSpawn: null,
      oneWay: false,
      lock: null,
      window: null,
      noise: 'door',
      elevationDelta: 0,
      minProfile: 'small',
      ships: 'V1.5',
    },
    {
      id: 'rm.east',
      from: 'room',
      x: 7,
      y: 3,
      kind: 'door',
      to: null,
      toSpawn: null,
      oneWay: false,
      lock: null,
      window: null,
      noise: 'door',
      elevationDelta: 0,
      minProfile: 'small',
      ships: 'V1.5',
    },
    {
      id: 'rm.north',
      from: 'room',
      x: 5,
      y: 0,
      kind: 'stairs',
      to: null,
      toSpawn: null,
      oneWay: false,
      lock: null,
      window: null,
      noise: 'door',
      elevationDelta: 0,
      minProfile: 'small',
      ships: 'V1.5',
    },
  ],
  spawns: [{ id: 'in', x: 3, y: 5, z: 0, facing: 'n' }],
  spots: [],
  props: [{ id: 'rm.shelf', kind: 'decor', x: 2, y: 0 }],
  gates: [],
  paths: [],
  grid: ['#####D##', '#......#', '#..#...#', '#......D', '#......#', '#..S...#', '###D####'],
  material: ['WWPWWWWW', 'WwwwwwwW', 'WwwKwwwW', 'WwffwwwW', 'WwffwwwW', 'WwwwwwwW', 'WWWWWWWW'],
};

/** A wide block of rock with one room in a corner: most of it lies beyond the deep-cull distance. */
const { material: _unused, ...ROOM_BASE } = ROOM;
const CAVE: Scene = {
  ...ROOM_BASE,
  id: 'cave',
  kind: 'interior',
  biome: 'cave',
  dark: true,
  size: { w: 10, h: 8 },
  portals: [],
  props: [],
  spawns: [{ id: 'in', x: 1, y: 1, z: 0, facing: 's' }],
  grid: [
    '##########',
    '#S.#######',
    '#..#######',
    '##########',
    '##########',
    '##########',
    '##########',
    '##########',
  ],
};

const layer = (map: unknown, name: string) =>
  (
    map as { layers: Array<{ name: string; data?: number[]; objects?: Array<Record<string, unknown>> }> }
  ).layers.find((l) => l.name === name)!;
const prop = (o: Record<string, unknown>, name: string) =>
  (o.properties as Array<{ name: string; value: unknown }>).find((p) => p.name === name)?.value;

describe('grid exporter', () => {
  it('finds every scene of every map', () => {
    const mapsDir = join(SCENES_DIR, '../maps');
    const listed = readdirSync(mapsDir).flatMap(
      (f) => (JSON.parse(readFileSync(join(mapsDir, f), 'utf8')) as { scenes: string[] }).scenes,
    );
    expect(scenes.map((s) => s.id).sort()).toEqual(listed.sort());
  });

  it('checks the nav tile and the ground cell separately', () => {
    expect(() => assertNavTile(64, 'x')).not.toThrow();
    expect(() => assertNavTile(128, 'x')).toThrow(/must be 64/);
    expect(() => assertGroundCell(128, 64, 'x')).not.toThrow();
    expect(() => assertGroundCell(64, 64, 'x')).toThrow(/must be 128x64/);
  });

  it('writes an isometric 128 x 64 map and leaves the nav on the 64 px square grid', () => {
    const map = tilemapFor(ROOM, 'hollowmere') as Record<string, unknown>;
    expect(map).toMatchObject({
      orientation: 'isometric',
      tilewidth: 128,
      tileheight: 64,
      width: 8,
      height: 7,
    });
    expect((map.tilesets as Array<Record<string, unknown>>)[0]).toMatchObject({
      firstgid: 1,
      name: 'iso_ground_harbour',
      imagewidth: 1280,
      imageheight: 1792,
      columns: 10,
      tilecount: 280,
    });
    const nav = navFor(ROOM);
    expect(nav.tile).toBe(64);
    expect(nav.solid[2]).toBe('10010001');
    const grid = createNavGrid(nav, 'small');
    expect(grid.solidAt(3, 6)).toBe(true); // door
    expect(grid.solidAt(3, 5)).toBe(false); // spawn
  });

  it('stands the back shell full, the front shell as a stub and the rest half height', () => {
    expect(kitFrameOf(ROOM, 0, 0)).toMatch(/^wall\/full\//); // north-west corner
    expect(kitFrameOf(ROOM, 4, 0)).toMatch(/^wall\/full\//); // north wall
    expect(kitFrameOf(ROOM, 0, 4)).toMatch(/^wall\/full\//); // west wall
    expect(kitFrameOf(ROOM, 4, 6)).toMatch(/^wall\/stub\//); // south wall
    expect(kitFrameOf(ROOM, 7, 5)).toMatch(/^wall\/stub\//); // east wall
    expect(kitFrameOf(ROOM, 3, 2)).toMatch(/^stack\/full\//); // a stack has one height
    const pillar = { ...ROOM, material: ROOM.material!.map((r, y) => (y === 2 ? 'WwwWwwwW' : r)) };
    expect(kitFrameOf(pillar, 3, 2)).toMatch(/^wall\/half\//);
  });

  it('draws nothing of its own on a covered tile', () => {
    expect(kitFrameOf(ROOM, 2, 0)).toBeNull();
    const names = layer(tilemapFor(ROOM, 'hollowmere'), 'solids').objects!.map((o) => o.name);
    expect(names).not.toContain('2,0');
    expect(names).toContain('1,0');
  });

  it('culls solid tiles beyond the deep-cull distance: gid 0 and no solid object', () => {
    const map = tilemapFor(CAVE, 'hollowmere');
    const ground = layer(map, 'ground').data!;
    expect(ground[1 * 10 + 1]).toBe(gidOf('r', (1 * 7 + 1 * 13) % 4)); // the floor
    expect(ground[7 * 10 + 9]).toBe(0); // the far corner
    expect(ground[2 * 10 + 4]).not.toBe(0); // two tiles from the floor
    expect(ground[2 * 10 + 5]).toBe(0); // three
    const names = layer(map, 'solids').objects!.map((o) => o.name);
    expect(names).toContain('4,2');
    expect(names).not.toContain('5,2');
  });

  it('lays the fringes of the two highest-ranked neighbours and drops a third', () => {
    // Flags rank above planks: the plank tile north of the patch gets the flag fringe on its south side, and
    // on its east side from the stack, which draws the ground of its first walkable neighbour (the flags).
    const room = tileLayers(ROOM);
    expect(room.blend1[2 * 8 + 2]).toBe(gidOf('f', 3 + (SIDE.s | SIDE.e)));
    expect(room.blend2[2 * 8 + 2]).toBe(0);
    // A rock tile between grass (east), moss (north) and litter (south): grass and moss, litter dropped.
    const mixed: Scene = {
      ...ROOM,
      material: ['WWPWWWWW', 'WwwwmwwW', 'WwwKrgwW', 'WffwlwwW', 'WwffwwwW', 'WwwwwwwW', 'WWWWWWWW'],
    };
    const layers = tileLayers(mixed);
    const i = 2 * 8 + 4;
    expect(layers.blend1[i]).toBe(gidOf('g', 3 + SIDE.e));
    expect(layers.blend2[i]).toBe(gidOf('m', 3 + SIDE.n));
  });

  it('faces a portal toward its floor: south and east draw a frame, north and west a sill', () => {
    expect(portalFace(ROOM, 5, 0)).toBe('s');
    expect(portalFace(ROOM, 3, 6)).toBe('sill');
    expect(portalFace(ROOM, 7, 3)).toBe('sill');
    const ow = byId('overworld');
    expect(portalFace(ow, 28, 34)).toBe('s'); // the tavern's front door
    expect(portalFace(ow, 36, 31)).toBe('e'); // the tavern alley
    const door = layer(tilemapFor(ow), 'portals').objects!.find((o) => o.name === 'ov.tavern_front')!;
    expect(prop(door, 'inBuilding')).toBe(true);
  });

  it('carries the map, theme, void and lights of a real scene', () => {
    const map = tilemapFor(byId('bp_mine')) as { properties: Array<{ name: string; value: unknown }> };
    const props = Object.fromEntries(map.properties.map((p) => [p.name, p.value]));
    expect(props).toMatchObject({
      map: 'blackpine',
      theme: 'timber',
      dark: true,
      void: 'ink',
      biome: 'cave',
    });
    const torch = layer(map, 'lights').objects!.find((o) => o.name === 'bm.lt_daylight')!;
    expect(prop(torch, 'color')).toBe('moon');
    expect(prop(torch, 'phases')).toBe('day,dusk');
  });

  it('runs rails on along their axis', () => {
    const mine = byId('bp_mine');
    const ground = layer(tilemapFor(mine), 'ground').data!;
    const cell = (x: number, y: number) => (ground[y * mine.size.w + x]! - 1) % 20;
    expect(cell(22, 22)).toBeGreaterThanOrEqual(2); // the adit's tram rails run along world y
  });

  it('fails --check on a stale tilemap', () => {
    const dir = mkdtempSync(join(tmpdir(), 'grid-'));
    const fresh = { path: join(dir, 'fresh.json'), text: '{}\n' };
    const stale = { path: join(dir, 'stale.json'), text: '{"a":1}\n' };
    writeFileSync(fresh.path, fresh.text);
    writeFileSync(stale.path, '{"a":0}\n');
    expect(
      staleOutputs([fresh, stale, { path: join(dir, 'missing.json'), text: '' }]).map((o) => o.path),
    ).toEqual([stale.path, join(dir, 'missing.json')]);
  });

  it('keeps the committed outputs up to date', () => {
    for (const o of buildOutputs(scenes)) expect(readFileSync(o.path, 'utf8'), o.path).toBe(o.text);
  });

  it("regenerates every committed scene's nav byte for byte with the shared navFromGrid (round 9)", () => {
    for (const scene of scenes) {
      const path = join(SCENES_DIR, `${scene.id}.nav.json`);
      expect(formatJson(navFromGrid(scene)), path).toBe(readFileSync(path, 'utf8'));
    }
  });
});
