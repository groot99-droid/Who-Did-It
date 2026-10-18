import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CARD_H, CARD_W, BAND, ingredientCard, tileFloor } from '../onub-cards.ts';
import { MINI_FRAMES, PAGE } from '../onub-mini.ts';
import {
  ART,
  CARD_IDS,
  OUT,
  ROLE_IDS,
  SCALE,
  SCENE_IDS,
  STATION_IDS,
  assemblePrompt,
  decodeAny,
  styleOut,
  onubImages,
  ownerSource,
  readBatch,
  referenceNames,
  shipped,
} from '../onub.ts';
import { artStyle } from '../palette.ts';
import { audit } from '../pixel.ts';

const ASSETS = join(import.meta.dirname, '../../../apps/client/public/assets');
const manifest = (rel: string) =>
  JSON.parse(readFileSync(join(ASSETS, rel), 'utf8')) as {
    entries: Array<{ key: string; type: string; url: string; modes?: string[] }>;
  };

/** Contract 5.4: 4 stations, 10 scenes, the kitchen, 18 cards, 4 Location faces, 2 backs, the cloche, 15 portraits, the baker. */
const CONTRACT = [
  ...STATION_IDS.map((s) => `onub_station_${s}`),
  ...SCENE_IDS.map((s) => `onub_scene_${s}`),
  'onub_kitchen',
  ...CARD_IDS.map((c) => `onub_card_${c}`),
  ...STATION_IDS.map((s) => `onub_loc_${s}`),
  'onub_card_back_role',
  'onub_card_back_loc',
  'onub_cloche',
  ...ROLE_IDS.map((r) => `onub_portrait_${r}`),
  'onub_baker',
];

describe('ONUB art keys (contract 5.4, art plan 5.9)', () => {
  it('cover the contract: 4 stations, 10 scenes, 18 cards, 15 roles', () => {
    expect([STATION_IDS.length, SCENE_IDS.length, CARD_IDS.length, ROLE_IDS.length]).toEqual([4, 10, 18, 15]);
    expect(onubImages().map((i) => i.key)).toEqual(CONTRACT);
  });

  it("list every key and onub_mini in both manifests with modes ['onub'], and no loft key", () => {
    for (const rel of ['manifest.json', 'placeholder/manifest.json']) {
      const byKey = new Map(manifest(rel).entries.map((e) => [e.key, e]));
      for (const key of [...CONTRACT, 'onub_mini']) {
        expect(byKey.get(key)?.modes, `${rel} ${key}`).toEqual(['onub']);
        expect(byKey.get(key)?.type, `${rel} ${key}`).toBe(key === 'onub_mini' ? 'multiatlas' : 'image');
      }
      for (const key of ['loft_backdrop', 'prop_bedroll', 'prop_bedroll_self'])
        expect(byKey.has(key), key).toBe(false);
    }
  });

  it('ship every image at its size (1920 x 1080, 240 x 336, 192 x 192, 384 x 576)', async () => {
    for (const i of onubImages()) {
      const img = await decodeAny(readFileSync(join(OUT, `${i.path}.webp`)));
      const [w, h] = ART[i.kind];
      expect([img.width, img.height], i.key).toEqual([w * SCALE, h * SCALE]);
    }
  });

  it('keep every shipped pixel on the world palette with alpha 0 or 255', async () => {
    for (const i of onubImages()) {
      const a = audit(await shipped(i.path));
      expect([a.offPalette, a.partialAlpha], i.key).toEqual([0, 0]);
    }
    const page = await decodeAny(readFileSync(join(OUT, 'onub_mini-0.png')));
    const a = audit(page);
    expect([a.offPalette, a.partialAlpha]).toEqual([0, 0]);
  });

  it('keep the ONUB set within 2.5 MB (art plan 1.4)', () => {
    const size = (dir: string): number =>
      readdirSync(dir).reduce((n, f) => {
        const p = join(dir, f);
        return n + (statSync(p).isDirectory() ? size(p) : statSync(p).size);
      }, 0);
    expect(size(OUT)).toBeLessThanOrEqual(2.5 * 1024 * 1024);
  });

  it('pack every onub_mini frame at its art box on one 512 page', () => {
    const doc = JSON.parse(readFileSync(join(OUT, 'onub_mini.json'), 'utf8')) as {
      textures: Array<{
        size: { w: number; h: number };
        frames: Array<{ filename: string; frame: { w: number; h: number } }>;
      }>;
    };
    expect(doc.textures).toHaveLength(1);
    expect(doc.textures[0]!.size).toEqual({ w: PAGE, h: PAGE });
    const frames = new Map(doc.textures[0]!.frames.map((f) => [f.filename, f.frame]));
    for (const f of MINI_FRAMES)
      expect(frames.get(f.name), f.name).toEqual(expect.objectContaining({ w: f.w, h: f.h }));
    expect(frames.size).toBe(MINI_FRAMES.length);
  });
});

describe('ONUB low-poly style (art plan 1.9, DECISIONS A79)', () => {
  const LOW = styleOut(artStyle('lowpoly'));
  const size = (dir: string): number =>
    readdirSync(dir).reduce((n, f) => {
      const p = join(dir, f);
      return n + (statSync(p).isDirectory() ? size(p) : statSync(p).size);
    }, 0);

  it('lists every key of the 8-bit block with the same url and modes, the atlas linear', () => {
    const base = new Map(manifest('manifest.json').entries.map((e) => [e.key, e]));
    const low = manifest('lowpoly/manifest.json').entries.filter((e) => e.key.startsWith('onub_'));
    expect(low.map((e) => e.key)).toEqual([...CONTRACT, 'onub_mini']);
    for (const e of low)
      expect([e.url, e.modes], e.key).toEqual([base.get(e.key)!.url, base.get(e.key)!.modes]);
    expect(low.at(-1)).toMatchObject({ key: 'onub_mini', filter: 'linear' });
  });

  it('ships every image at the 8-bit size, smooth and unsnapped', async () => {
    let offPalette = 0;
    for (const i of onubImages()) {
      const img = await decodeAny(readFileSync(join(LOW, `${i.path}.webp`)));
      const [w, h] = ART[i.kind];
      expect([img.width, img.height], i.key).toEqual([w * SCALE, h * SCALE]);
      if (i.kind === 'portrait') offPalette += audit(img).offPalette;
    }
    expect(offPalette).toBeGreaterThan(0);
  });

  it('packs onub_mini with the 8-bit frame names and rectangles', () => {
    const frames = (dir: string) => readFileSync(join(dir, 'onub_mini.json'), 'utf8');
    expect(frames(LOW)).toBe(frames(OUT));
  });

  it('keeps the low-poly ONUB set within 4 MiB', () => {
    expect(size(LOW)).toBeLessThanOrEqual(4 * 1024 * 1024);
  });
});

describe('ONUB cards (art plan 5.5)', () => {
  it('match the card art grid', () => expect([CARD_W, CARD_H]).toEqual([...ART.card]));

  it('leave the text band blank paper with its rule (5C writes on it)', () => {
    const card = ingredientCard('sawdust', tileFloor(), null);
    const [bx, by, bw, bh] = BAND;
    const at = (x: number, y: number) => [
      ...card.data.subarray((y * CARD_W + x) * 4, (y * CARD_W + x) * 4 + 3),
    ];
    for (let y = by; y < by + bh; y++)
      for (let x = bx; x < bx + bw; x++)
        expect(at(x, y)).toEqual(y === by ? [0xb2, 0xaa, 0x99] : [0xd9, 0xd2, 0xc2]);
  });

  it('mark a Sabotage card and not a good one (public after prep by design)', () => {
    const corner = (id: string) => [
      ...ingredientCard(id, tileFloor(), null).data.subarray(
        (2 * CARD_W + 78) * 4,
        (2 * CARD_W + 78) * 4 + 3,
      ),
    ];
    expect(corner('sawdust')).toEqual([0x12, 0x14, 0x1c]);
    expect(corner('t55Flour')).not.toEqual([0x12, 0x14, 0x1c]);
  });
});

describe('the 5M batch (art plan 2.2, 2.3)', () => {
  const batch = readBatch();

  it("record jobs and a pick for every item (the oven is the owner's pick D)", () => {
    for (const item of batch.items) {
      expect(item.jobs.length, item.key).toBeGreaterThanOrEqual(item.count);
      expect(item.jobs, item.key).toContain(item.pick);
      if (item.key === 'onub_station_oven') expect(item.pick).toBe(item.jobs[3]);
      if (item.template === 'T5') expect(item.cutout, item.key).toMatch(/^[0-9a-f-]{36}$/);
    }
    expect(batch.items.reduce((n, i) => n + i.jobs.length, 0)).toBeLessThanOrEqual(100);
  });

  it('assemble prompts with the key colour, no stray placeholder and at most four references', () => {
    for (const item of batch.items) {
      const prompt = assemblePrompt(item);
      expect(prompt, item.key).not.toContain('{KEY}');
      if (item.template === 'T5') expect(prompt).toContain('pure #FF00FF background');
      expect(referenceNames(item).length, item.key).toBeLessThanOrEqual(4);
    }
    const oven = batch.items.find((i) => i.key === 'onub_station_oven')!;
    expect(referenceNames(oven)).toEqual([
      'station_mixer.jpg',
      'station_fridge.jpg',
      'scene_front_of_house.jpg',
      'station_proofing.jpg',
    ]);
    expect(assemblePrompt(batch.items.find((i) => i.key === 'onub_portrait_croissant')!)).toContain(
      'one pastry',
    );
  });

  it("map every room key to the owner's image (the oven has none)", () => {
    expect(ownerSource('onub_scene_subBasement')).toBe('assets/source/concepts/onub/scene_sub_basement.jpg');
    expect(ownerSource('onub_station_oven')).toBeNull();
    for (const s of SCENE_IDS)
      expect(() =>
        statSync(join(import.meta.dirname, '../../..', ownerSource(`onub_scene_${s}`)!)),
      ).not.toThrow();
  });
});
