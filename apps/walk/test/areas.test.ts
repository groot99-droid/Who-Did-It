import { readFileSync } from 'node:fs';
import { Group } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import {
  areaById,
  areaOfSpawn,
  areaUrl,
  crossingAddress,
  notBuiltWords,
  parseIndex,
  pickerSpawns,
  routePortal,
  routeToSpawn,
  sceneWords,
  startOf,
  worldFromQuery,
  type WalkIndex,
} from '../src/areas';
import { findPortals } from '../src/portals';
import { findSpawns, pickSpawn } from '../src/spawn';
import './helpers/node-gltf';
import { tinyWorld } from './helpers/tiny-areas';

// The index (src/areas.ts) on the contract's test world, test/fixtures/areas/ (a copy of
// tools/blender/walk_areas/fixture/areas/: two village sections joined by a seam, a room, two caves joined by a cave
// seam, a cave mouth, and a door into a scene that is not built), and on the two tiny .glb caves of
// helpers/tiny-areas.ts. The numbered cases are those of docs/walk-areas.md, section 10.

const AREAS = new URL('./fixtures/areas/', import.meta.url);
const rawIndex = (): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL('walk-index.json', AREAS), 'utf8')) as Record<string, unknown>;

function contractIndex(change?: (raw: Record<string, unknown>) => void): WalkIndex {
  const raw = rawIndex();
  change?.(raw);
  const parsed = parseIndex(raw);
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.index;
}

describe('parseIndex', () => {
  it('reads the contract test world: its areas, files, spawns, portals, pending scenes and walk-only scenes', () => {
    const index = contractIndex();
    expect(index.start).toBe('square');
    expect(index.areas.map((a) => a.id)).toEqual([
      'room_shop',
      'under_a',
      'under_b',
      'village_east',
      'village_west',
    ]);
    const a = areaById(index, 'under_a')!;
    expect(a.file).toBe('walk-under_a.gltf');
    expect(a.bytes).toBe(6975);
    expect(a.kind).toBe('cave');
    expect(a.name).toBe('The Undermere, mouth passage');
    expect(a.spawns.map((s) => [s.id, s.picker])).toEqual([
      ['undermere_mouth_east', true],
      ['undermere_seam_a_b_a_1', false],
      ['undermere_seam_a_b_a_2', false],
    ]);
    expect(a.portals.map((p) => [p.id, p.to, p.toSpawn, p.kind, p.targetArea])).toContainEqual([
      'umeast_out',
      'overworld',
      'mouth_east',
      'cave_mouth',
      'village_east',
    ]);
    expect(index.pending).toEqual(['mine']);
    expect(index.sceneNames.get('undermere')).toBe('The Undermere');
    expect(index.spawnArea.size).toBe(16);
  });

  it('reads the tiny world of two .glb caves', () => {
    const parsed = parseIndex(tinyWorld().index);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.index.areas.map((a) => [a.id, a.file])).toEqual([
      ['under_x', 'walk-under_x.glb'],
      ['under_y', 'walk-under_y.glb'],
    ]);
  });

  it('treats an index of another format as absent, and says why', () => {
    expect(parseIndex({ ...rawIndex(), format: 2 })).toEqual({
      ok: false,
      reason: 'the index says format 2; this viewer reads format 1',
    });
    expect(parseIndex({ ...rawIndex(), format: undefined })).toMatchObject({ ok: false });
    expect(parseIndex('not an object')).toEqual({ ok: false, reason: 'the index is not a JSON object' });
    expect(parseIndex([])).toMatchObject({ ok: false });
    expect(parseIndex(null)).toMatchObject({ ok: false });
  });

  it('refuses what would mislead the viewer: no start, no areas, a spawn in two areas, a file outside the folder', () => {
    expect(parseIndex({ ...rawIndex(), start: '' })).toMatchObject({ ok: false });
    expect(parseIndex({ ...rawIndex(), areas: {} })).toEqual({
      ok: false,
      reason: 'the index lists no area',
    });
    const twice = rawIndex();
    const areas = twice.areas as Record<string, { spawns: { id: string }[]; file: string }>;
    areas.under_b!.spawns.push({ id: 'square' });
    expect(parseIndex(twice)).toEqual({
      ok: false,
      reason: 'the spawn square is in both under_b and village_west',
    });
    for (const file of [
      '../walk-x.glb',
      'sub/walk-x.glb',
      'a\\b.glb',
      'https://elsewhere.test/walk-x.glb',
      '',
      '..',
    ]) {
      const raw = rawIndex();
      (raw.areas as Record<string, { file: string }>).under_a!.file = file;
      expect(parseIndex(raw), file).toMatchObject({ ok: false });
    }
  });

  it('ignores fields it does not know, at every level', () => {
    const raw = rawIndex();
    raw.later_field = { anything: 1 };
    (raw.areas as Record<string, Record<string, unknown>>).under_a!.new_stat = 3;
    expect(parseIndex(raw).ok).toBe(true);
  });
});

describe('area and spawn lookup', () => {
  const index = contractIndex();

  it('finds the area that holds a spawn, across every file', () => {
    expect(areaOfSpawn(index, 'square')?.id).toBe('village_west');
    expect(areaOfSpawn(index, 'mill')?.id).toBe('village_east');
    expect(areaOfSpawn(index, 'undermere_seam_a_b_b_2')?.id).toBe('under_b');
    expect(areaOfSpawn(index, 'shop_door')?.id).toBe('room_shop');
    expect(areaOfSpawn(index, 'no_such_spawn')).toBeNull();
    expect(areaOfSpawn(index, null)).toBeNull();
  });

  it('the picker lists the six spawns that are not arrivals (case 4)', () => {
    expect(
      pickerSpawns(index)
        .map((s) => s.id)
        .sort(),
    ).toEqual(
      [
        'square',
        'overworld_shop_door',
        'mill',
        'shop_door',
        'overworld_mouth_east',
        'undermere_mouth_east',
      ].sort(),
    );
  });

  it('starts at ?spawn= in whatever file holds it, else the index start; never square by accident (case 6)', () => {
    expect(startOf(index)).toMatchObject({ spawn: 'square', area: { id: 'village_west' } });
    expect(startOf(index, { spawn: 'undermere_seam_a_b_b_2' })).toMatchObject({
      spawn: 'undermere_seam_a_b_b_2',
      area: { id: 'under_b' },
    });
    const moved = contractIndex((raw) => (raw.start = 'overworld_shop_door'));
    expect(startOf(moved)).toMatchObject({ spawn: 'overworld_shop_door', area: { id: 'village_west' } });
    expect(startOf(moved, { spawn: 'no_such_spawn' })).toMatchObject({ spawn: 'overworld_shop_door' });
    // What the single-file viewer's pickSpawn gives for the same start, which this replaces: square.
    const westSpawns = areaById(index, 'village_west')!.spawns;
    expect(pickSpawn(westSpawns, null)?.id).toBe('square');
  });

  it('?area= alone opens that area at its first picker spawn, else its first; ?spawn= wins over ?area=', () => {
    expect(startOf(index, { area: 'village_east' })).toMatchObject({
      spawn: 'mill',
      area: { id: 'village_east' },
    });
    expect(startOf(index, { area: 'under_b' })).toMatchObject({ spawn: 'undermere_seam_a_b_b_1' });
    expect(startOf(index, { area: 'village_west' })).toMatchObject({ spawn: 'square' });
    expect(startOf(index, { area: 'under_a', spawn: 'mill' })).toMatchObject({
      area: { id: 'village_east' },
    });
    expect(startOf(index, { area: 'nowhere' })).toMatchObject({ spawn: 'square' });
  });

  it('an area file is the index folder plus its file, with 8 characters of its hash', () => {
    const a = areaById(index, 'under_a')!;
    expect(areaUrl('http://walk.test/caves/walk-index.json', a)).toBe(
      'http://walk.test/caves/walk-under_a.gltf?v=715d10a7',
    );
    expect(areaUrl('http://walk.test/caves/walk-index.json?x=1', a)).toBe(
      'http://walk.test/caves/walk-under_a.gltf?v=715d10a7',
    );
  });
});

describe('portals across files', () => {
  const index = contractIndex();

  it("finds a portal's target by its exact id in any file, never by the bare id (case 1)", () => {
    // The shop's way out asks for overworld + shop_door; the shop's own spawn is shop_door.
    expect(routePortal(index, 'room_shop', { to: 'overworld', toSpawn: 'shop_door' })).toMatchObject({
      kind: 'cross',
      spawn: 'overworld_shop_door',
      area: { id: 'village_west' },
    });
    expect(routePortal(index, 'room_shop', { to: 'mine', toSpawn: 'mouth' })).toEqual({
      kind: 'missing',
      words: 'Mine is not built yet',
    });
  });

  it('a seam leads into the other section; a target in the open file stays in it', () => {
    expect(
      routePortal(index, 'village_west', { to: 'overworld', toSpawn: 'seam_west_east_b_2' }),
    ).toMatchObject({
      kind: 'cross',
      spawn: 'overworld_seam_west_east_b_2',
      area: { id: 'village_east' },
    });
    expect(
      routePortal(index, 'village_east', { to: 'overworld', toSpawn: 'seam_west_east_b_2' }),
    ).toMatchObject({
      kind: 'here',
    });
  });

  it('the cave mouth leads into the caves and back out (case 8)', () => {
    expect(routePortal(index, 'village_east', { to: 'undermere', toSpawn: 'mouth_east' })).toMatchObject({
      kind: 'cross',
      spawn: 'undermere_mouth_east',
      area: { id: 'under_a' },
    });
    expect(routePortal(index, 'under_a', { to: 'overworld', toSpawn: 'mouth_east' })).toMatchObject({
      kind: 'cross',
      spawn: 'overworld_mouth_east',
      area: { id: 'village_east' },
    });
  });

  it('a gate into an area that is not in the index is "not built yet", in plain words', () => {
    const caves = contractIndex((raw) => {
      const areas = raw.areas as Record<string, unknown>;
      delete areas.village_east;
      delete areas.village_west;
      delete areas.room_shop;
    });
    expect(routePortal(caves, 'under_a', { to: 'overworld', toSpawn: 'mouth_east' })).toEqual({
      kind: 'missing',
      words: 'The village is not built yet',
    });
    expect(notBuiltWords(caves, 'undermere')).toBe('The Undermere is not built yet');
    expect(sceneWords(null, 'widow_parlour')).toBe('Widow parlour');
  });

  it('the picker routes a spawn of another file as a crossing, and one of this file as a move', () => {
    expect(routeToSpawn(index, 'village_west', 'mill')).toMatchObject({
      kind: 'cross',
      area: { id: 'village_east' },
    });
    expect(routeToSpawn(index, 'village_west', 'square')).toMatchObject({ kind: 'here' });
    expect(routeToSpawn(index, 'village_west', 'gone')).toMatchObject({ kind: 'missing' });
  });

  it('every spawn and portal of the index is read from its file as the viewer reads it', async () => {
    for (const area of index.areas) {
      const json = readFileSync(new URL(area.file, AREAS), 'utf8');
      const { scene } = (await new GLTFLoader().parseAsync(json, '')) as { scene: Group };
      expect(
        findSpawns(scene).map((s) => s.id),
        area.id,
      ).toEqual(area.spawns.map((s) => s.id));
      const portals = findPortals(scene);
      expect(
        portals.map((p) => [p.id, p.to, p.toSpawn]),
        area.id,
      ).toEqual(area.portals.map((p) => [p.id, p.to, p.toSpawn]));
    }
  });
});

describe('the address', () => {
  it('?glb= wins and opens one file as today; else ?index=; else the build index; else the build file', () => {
    const d = { index: '/walk/walk-index.json', glb: '/walk/hollowmere_walk.glb' };
    expect(worldFromQuery('?glb=a.glb&index=i.json', d)).toEqual({ kind: 'glb', url: 'a.glb' });
    expect(worldFromQuery('?index=i.json', d)).toEqual({ kind: 'index', url: 'i.json' });
    expect(worldFromQuery('', d)).toEqual({ kind: 'index', url: '/walk/walk-index.json' });
    expect(worldFromQuery('', { index: null, glb: d.glb })).toEqual({ kind: 'glb', url: d.glb });
    expect(worldFromQuery('?glb=%20', { index: null, glb: null })).toBeNull();
  });

  it('a crossing by page load keeps index, debug, exposure and cross, and names the area and the spawn', () => {
    const next = crossingAddress(
      'http://localhost:8090/Who-Did-It/walk/?index=caves%2Fwalk-index.json&debug&exposure=2&cross=reload&spawn=a&glb=x#h',
      'under_y',
      'undermere_seam_xy_b_1',
    );
    const q = new URL(next).searchParams;
    expect([...q.keys()]).toEqual(['index', 'debug', 'exposure', 'cross', 'area', 'spawn']);
    expect(q.get('index')).toBe('caves/walk-index.json');
    expect(q.get('spawn')).toBe('undermere_seam_xy_b_1');
    expect(q.get('area')).toBe('under_y');
    expect(next).not.toContain('#');
    expect(new URL(crossingAddress('http://h/walk/', 'a', 's')).search).toBe('?area=a&spawn=s');
  });
});
