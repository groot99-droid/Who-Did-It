import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DIRECTIONS } from '../keys.ts';
import {
  GLOW_FRAMES,
  GLOWS,
  M5B_KEYS,
  MOB_ANIM,
  MOB_ANIMS,
  MOB_IDS,
  NODE_STATES,
  RESOURCE_IDS,
  TOOL_IDS,
  glowFrame,
  heldFrame,
  m5bFiles,
  mobAnim,
  mobFrame,
  mobFrameList,
  nodeFrame,
  pageOf,
  snakeOf,
} from '../m5b.ts';
import { artStyles } from '../palette.ts';

const ASSETS = join(import.meta.dirname, '../../../apps/client/public/assets');
const DATA = join(import.meta.dirname, '../../../packages/content/data');
const json = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T;

interface Atlas {
  textures: Array<{
    image: string;
    size: { w: number; h: number };
    frames: Array<{
      filename: string;
      sourceSize: { w: number; h: number };
      pivot: { x: number; y: number };
    }>;
  }>;
}

const WANT = {
  nodes: RESOURCE_IDS.flatMap((id) => NODE_STATES.map((s) => nodeFrame(id, s))).sort(),
  tools: [
    ...TOOL_IDS.flatMap((t) => DIRECTIONS.map((d) => heldFrame(t, d))),
    ...GLOWS.flatMap((g) => Array.from({ length: GLOW_FRAMES }, (_, n) => glowFrame(g, n))),
  ].sort(),
  mobs: mobFrameList()
    .map(([m, a, d, n]) => mobFrame(m, a, d, n))
    .sort(),
};

/** Each frame's pivot in packed px, which every style and the placeholder share. */
const pivots = (atlas: Atlas) =>
  Object.fromEntries(
    atlas.textures.flatMap((t) =>
      t.frames.map((f) => [
        f.filename,
        [Math.round(f.pivot.x * f.sourceSize.w), Math.round(f.pivot.y * f.sourceSize.h), f.sourceSize.w],
      ]),
    ),
  );

describe('M5b art (SPRITES 12)', () => {
  it("names a node for every resource of resources.json, under the row's sprite key", () => {
    const { resources } = json<{ resources: Record<string, { sprite: string }> }>(
      join(DATA, 'resources.json'),
    );
    for (const [id, r] of Object.entries(resources)) {
      expect(RESOURCE_IDS, id).toContain(id);
      expect(r.sprite).toBe(`node_${snakeOf(id)}`);
    }
  });

  it('draws a held tool for every recipe of recipes.json', () => {
    const { recipes } = json<{ recipes: Record<string, { out: string }> }>(join(DATA, 'recipes.json'));
    for (const r of Object.values(recipes)) expect(TOOL_IDS, r.out).toContain(r.out);
    expect(snakeOf('tinOre')).toBe('tin_ore');
  });

  it("draws every mob of mobs.json in 8 directions under the row's sprite key", () => {
    const { mobs } = json<{ mobs: Record<string, { sprite: string }> }>(join(DATA, 'mobs.json'));
    for (const [id, m] of Object.entries(mobs)) {
      expect(MOB_IDS, id).toContain(id);
      expect(m.sprite).toBe(`mob_${id}`);
    }
    expect(WANT.mobs).toHaveLength(MOB_IDS.length * DIRECTIONS.length * 14);
  });

  const roots = [...artStyles().map((s) => s.root), 'placeholder/'];
  for (const atlas of ['nodes', 'tools', 'mobs'] as const) {
    const base = pivots(json<Atlas>(join(ASSETS, 'm5b', `${atlas}.json`)));
    for (const root of roots) {
      it(`${root || '8bit/'}m5b/${atlas}.json has every frame on one page within its cap, same cells and pivots`, () => {
        const a = json<Atlas>(join(ASSETS, root, 'm5b', `${atlas}.json`));
        expect(a.textures).toHaveLength(1);
        expect(a.textures[0]!.size.w).toBeLessThanOrEqual(pageOf(atlas).w);
        expect(a.textures[0]!.size.h).toBeLessThanOrEqual(pageOf(atlas).h);
        expect(a.textures[0]!.frames.map((f) => f.filename)).toEqual(WANT[atlas]);
        expect(pivots(a)).toEqual(base);
      });
    }
  }

  for (const root of roots) {
    it(`${root || '8bit/'}manifest.json lists the M5b keys at boot`, () => {
      const m = json<{ entries: Array<{ key: string; maps?: unknown; modes?: unknown }> }>(
        join(ASSETS, root, 'manifest.json'),
      );
      for (const key of M5B_KEYS) {
        const e = m.entries.find((x) => x.key === key);
        expect(e, key).toBeDefined();
        expect(e!.maps ?? e!.modes, key).toBeUndefined();
      }
    });
  }

  it('loops both glows from anims_tools', () => {
    const a = json<{ anims: Array<{ key: string; repeat: number; frames: unknown[] }> }>(
      join(ASSETS, 'm5b', 'tools.anims.json'),
    );
    expect(a.anims.map((x) => [x.key, x.repeat, x.frames.length])).toEqual(
      GLOWS.map((g) => [`glow_${g}`, -1, GLOW_FRAMES]),
    );
  });

  it('plays each mob animation in each direction, looping all but the attack', () => {
    const a = json<{ anims: Array<{ key: string; repeat: number; frameRate: number; frames: unknown[] }> }>(
      join(ASSETS, 'm5b', 'mobs.anims.json'),
    );
    const want = MOB_IDS.flatMap((m) =>
      MOB_ANIMS.flatMap((an) =>
        DIRECTIONS.map((d) => [
          mobAnim(m, an, d),
          MOB_ANIM[an].repeat,
          MOB_ANIM[an].fps,
          MOB_ANIM[an].frames,
        ]),
      ),
    );
    expect(a.anims.map((x) => [x.key, x.repeat, x.frameRate, x.frames.length])).toEqual(want);
    expect(MOB_ANIM.attack.repeat).toBe(0);
  });

  for (const style of artStyles()) {
    it(`ships the ${style.id} files the build writes today (run \`pnpm --filter @wdi/sprites m5b\`)`, async () => {
      for (const [name, bytes] of await m5bFiles(style))
        expect(readFileSync(join(ASSETS, style.root, 'm5b', name)).equals(bytes), name).toBe(true);
    });
  }
});
