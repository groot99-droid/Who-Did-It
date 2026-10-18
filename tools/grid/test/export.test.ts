import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createNavGrid } from '@wdi/shared';
import {
  GREYBOX,
  SCENES_DIR,
  type SceneJson,
  assertTileSize,
  buildOutputs,
  loadScenes,
  navFor,
  tilemapFor,
} from '../export';

const scenes = loadScenes();
const byId = (id: string) => scenes.find((s) => s.id === id) as SceneJson;

describe('grid exporter', () => {
  it('finds every scene of every map and skips nav files', () => {
    const mapsDir = join(SCENES_DIR, '../maps');
    const listed = readdirSync(mapsDir).flatMap(
      (f) => (JSON.parse(readFileSync(join(mapsDir, f), 'utf8')) as { scenes: string[] }).scenes,
    );
    expect(scenes.map((s) => s.id).sort()).toEqual(listed.sort());
  });

  it('fails on any tile size other than 64', () => {
    expect(() => assertTileSize(64, 64, 'x')).not.toThrow();
    expect(() => assertTileSize(32, 32, 'x')).toThrow(/must be 64/);
    expect(() => assertTileSize(64, 48, 'x')).toThrow(/must be 64/);
  });

  it('turns walls, doors, spots and gates into solid tiles and spawns into floor', () => {
    const nav = navFor(byId('tavern_bar'));
    const grid = createNavGrid(nav, 'small');
    expect(grid.solidAt(0, 0)).toBe(true); // wall
    expect(grid.solidAt(4, 11)).toBe(true); // door D
    expect(grid.solidAt(4, 10)).toBe(false); // spawn S
    expect(grid.solidAt(15, 1)).toBe(true); // hiding spot H
    expect(grid.solidAt(5, 5)).toBe(false); // floor
    const ow = navFor(byId('overworld'));
    expect(createNavGrid(ow, 'small').solidAt(21, 10)).toBe(true); // manor gate shut
    expect(createNavGrid(ow, 'medium').solidAt(21, 10)).toBe(false);
  });

  it('rejects a grid that does not match its size', () => {
    const bad = { ...byId('tavern_back'), grid: byId('tavern_back').grid.slice(1) };
    expect(() => navFor(bad)).toThrow(/rows/);
  });

  it('writes a 64 px Phaser tilemap with the grid, portals and spawns', () => {
    const scene = byId('tavern_bar');
    const map = tilemapFor(scene) as {
      tilewidth: number;
      tilesets: Array<{ tilewidth: number; name: string }>;
      layers: Array<{
        name: string;
        data?: number[];
        objects?: Array<{ name: string; x: number; y: number }>;
      }>;
    };
    expect(map.tilewidth).toBe(64);
    expect(map.tilesets.map((t) => t.name)).toEqual(['tiles_greybox', 'tiles_floorboards']);
    const ground = map.layers.find((l) => l.name === 'ground')?.data as number[];
    expect(ground).toHaveLength(20 * 12);
    expect(ground[0]).toBe(GREYBOX.wall);
    expect(ground[11 * 20 + 4]).toBe(GREYBOX.door);
    const portals = map.layers.find((l) => l.name === 'portals')?.objects ?? [];
    expect(portals.find((p) => p.name === 'tb.back')).toMatchObject({ x: 10 * 64, y: 11 * 64 });
  });

  it('keeps the committed outputs up to date', () => {
    for (const o of buildOutputs(scenes)) expect(readFileSync(o.path, 'utf8'), o.path).toBe(o.text);
  });
});
