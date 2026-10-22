import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DIRECTIONS } from '../keys.ts';
import {
  GLOW_FRAMES,
  GLOWS,
  M5B_KEYS,
  M5B_PAGE,
  NODE_STATES,
  RESOURCE_IDS,
  TOOL_IDS,
  glowFrame,
  heldFrame,
  m5bFiles,
  nodeFrame,
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

  const roots = [...artStyles().map((s) => s.root), 'placeholder/'];
  for (const atlas of ['nodes', 'tools'] as const) {
    const base = pivots(json<Atlas>(join(ASSETS, 'm5b', `${atlas}.json`)));
    for (const root of roots) {
      it(`${root || '8bit/'}m5b/${atlas}.json has every frame on one page within 512², same cells and pivots`, () => {
        const a = json<Atlas>(join(ASSETS, root, 'm5b', `${atlas}.json`));
        expect(a.textures).toHaveLength(1);
        expect(a.textures[0]!.size.w).toBeLessThanOrEqual(M5B_PAGE.w);
        expect(a.textures[0]!.size.h).toBeLessThanOrEqual(M5B_PAGE.h);
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

  for (const style of artStyles()) {
    it(`ships the ${style.id} files the build writes today (run \`pnpm --filter @wdi/sprites m5b\`)`, async () => {
      for (const [name, bytes] of await m5bFiles(style))
        expect(readFileSync(join(ASSETS, style.root, 'm5b', name)).equals(bytes), name).toBe(true);
    });
  }
});
