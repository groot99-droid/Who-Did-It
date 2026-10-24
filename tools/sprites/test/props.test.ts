import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodePng } from '../bleed.ts';
import type { MultiAtlas } from '../pack.ts';
import {
  MAP_PROPS_FRAMES,
  PROPS_FRAMES,
  clueFrameNames,
  expectedFrames,
  type StaticAtlas,
} from '../pack-static.ts';
import { finishEnabled, paletteFile } from '../palette.ts';
import { audit } from '../pixel.ts';
import { MAP_SLICED_PROPS, sliceNames } from '../placeholder-world.ts';

const ROOT = join(import.meta.dirname, '../../..');
const ASSETS = join(ROOT, 'apps/client/public/assets');
const DATA = join(ROOT, 'packages/content/data');

interface Scene {
  props?: Array<{ id: string; kind: string; footprint?: unknown }>;
  spots?: Array<{ id: string; variant: string }>;
  portals?: Array<{ id: string; kind: string }>;
}

const frames = (rel: string): Set<string> => {
  const file = join(ASSETS, rel);
  if (!existsSync(file)) return new Set();
  const atlas = JSON.parse(readFileSync(file, 'utf8')) as MultiAtlas;
  return new Set(atlas.textures.flatMap((t) => t.frames.map((f) => f.filename)));
};

const maps = ['hollowmere', 'blackpine'].filter((m) => existsSync(join(DATA, 'maps', `${m}.json`)));

describe.each(maps)('the props of %s resolve to frames (SPRITES 10.13, art plan 3.5-3.7)', (map) => {
  const { scenes } = JSON.parse(readFileSync(join(DATA, 'maps', `${map}.json`), 'utf8')) as {
    scenes: string[];
  };
  const shared = frames('props/props.json');
  const own = frames(`props/props_${map}.json`);
  const bld = frames(`buildings/bld_${map}.json`);
  const has = (name: string) =>
    own.has(name) || bld.has(name) || shared.has(name) || own.has(`${name}#0_0`) || bld.has(`${name}#0_0`);
  /** props_<mapId>, bld_<mapId> (BLD_PROPS_MAPS), then props; within each prop_<kind>[_<state>], prop_<id tail>, then the tail without _<n> (SPRITES 3). */
  const resolves = (kind: string, id: string) => {
    const tail = id.slice(id.lastIndexOf('.') + 1);
    const state = [...own, ...shared].some((f) => f.startsWith(`prop_${kind}_`));
    const stem = tail.replace(/_\d+$/, '');
    if (kind === 'decor' || kind === 'dressing' || kind === 'taskSource')
      return has(`prop_${tail}`) || has(`prop_${stem}`);
    return has(`prop_${kind}`) || state || has(`prop_${tail}`) || has(`prop_${stem}`);
  };

  it.each(scenes)('%s', (sceneId) => {
    const scene = JSON.parse(readFileSync(join(DATA, 'scenes', `${sceneId}.json`), 'utf8')) as Scene;
    for (const p of scene.props ?? []) {
      if (p.kind === 'teachingClue') continue;
      expect(resolves(p.kind, p.id), `${p.id} (${p.kind})`).toBe(true);
    }
    for (const s of scene.spots ?? [])
      expect(has(`spot_${s.variant}`), `${s.id} spot_${s.variant}`).toBe(true);
    for (const p of scene.portals ?? []) {
      if (p.kind === 'hatch' || p.kind === 'drop') expect(has(`portal_${p.kind}`), p.id).toBe(true);
      else
        for (const face of ['s', 'e', 'sill'])
          expect(has(`portal_${p.kind}_${face}`), `${p.id} ${face}`).toBe(true);
    }
  });
});

describe('the prop and clue atlases', () => {
  it('ship exactly their frame lists, in both manifests', () => {
    for (const dir of ['', 'placeholder/']) {
      expect([...frames(`${dir}props/props.json`)].sort(), `${dir}props`).toEqual([...PROPS_FRAMES].sort());
      for (const [key, names] of Object.entries(MAP_PROPS_FRAMES)) {
        const slices = (MAP_SLICED_PROPS[key] ?? []).flatMap((p) => sliceNames(p.art, p.w, p.h));
        // A map's props that pack with its buildings (BLD_PROPS_MAPS) are in its building atlas instead; the
        // greybox fallback, outside the texture budget, keeps them all in props_<mapId>.
        const own = dir ? [...names] : expectedFrames(key as StaticAtlas);
        expect([...frames(`${dir}props/${key}.json`)].sort(), `${dir}${key}`).toEqual(
          [...own, ...slices].sort(),
        );
        const bld = frames(`${dir}buildings/bld_${key.slice('props_'.length)}.json`);
        for (const n of names.filter((f) => !own.includes(f)))
          expect(bld.has(n), `${dir}bld ${n}`).toBe(true);
      }
      expect([...frames(`${dir}clues/clues.json`)].sort(), `${dir}clues`).toEqual(clueFrameNames());
    }
  });

  it('keep every page in budget and, under the finish, in world colours with hard alpha', () => {
    const pages: Array<[string, number]> = [
      ['props/props.json', 1024],
      ...Object.keys(MAP_PROPS_FRAMES).map((k): [string, number] => [`props/${k}.json`, 1024]),
      ['clues/clues.json', 512],
    ];
    for (const [rel, cap] of pages) {
      const atlas = JSON.parse(readFileSync(join(ASSETS, rel), 'utf8')) as MultiAtlas;
      for (const t of atlas.textures) {
        expect(Math.max(t.size.w, t.size.h), t.image).toBeLessThanOrEqual(cap);
        if (!finishEnabled('main')) continue;
        const a = audit(decodePng(readFileSync(join(ASSETS, rel, '..', t.image))));
        expect(a.offPalette, t.image).toBe(0);
        expect(a.partialAlpha, t.image).toBe(0);
        expect(a.saturatedShare, t.image).toBeLessThanOrEqual(paletteFile.rules.maxSaturatedAccentShare);
      }
    }
  });
});
