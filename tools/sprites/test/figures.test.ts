// The figure drops (round 11, F2 to Fn): each shipped figure atlas has every key the sprite world loads, today's
// cell and pivot, no cover card, a page in the character page cap, and passes the tone check (look.md 3.3).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { FIGURES_DIR, figureEntry, figureLooks } from '../figures.ts';
import { INK_FLOOR, TONE, fromOklab, inkFloor, kmeans, toneReport } from '../figure-tone.ts';
import { decodePng } from '../bleed.ts';
import { CHAR_PAGE, DIRECTIONS } from '../keys.ts';
import { oklab, type Lab } from '../oklab.ts';

const CONTENT = join(import.meta.dirname, '../../../packages/content/data');
const BATCH = join(import.meta.dirname, '../batches/11F.json');
const MODELS = join(import.meta.dirname, '../../blender/models/models.lock.json');

/** The figure clips and their frame counts (tools/blender/figures FIGURE_CLIPS). */
const CLIPS = { idle: 24, walk: 8 } as const;
/** The packed cell and pivot of today's character atlas (SPRITES 1, 10.3): 64 px, the feet at row 56. */
const CELL = 64;
const PIVOT = { x: 0.5, y: 0.875 };

interface Frame {
  filename: string;
  sourceSize: { w: number; h: number };
  frame: { x: number; y: number; w: number; h: number };
  pivot?: { x: number; y: number };
}
interface Atlas {
  textures: { image: string; size: { w: number; h: number }; frames: Frame[] }[];
}
interface LooksJson {
  looks: Record<string, { bodyAtlas: string | null }>;
  villagers: Record<string, unknown>;
  figures: Record<string, unknown>;
}
interface Batch {
  figures: { model: string; look: string; drop: string }[];
  gaps: { model?: string; look?: string }[];
}

const json = <T>(path: string) => JSON.parse(readFileSync(path, 'utf8')) as T;
const looksJson = json<LooksJson>(join(CONTENT, 'looks.json'));
const covers = Object.keys(looksJson.looks).filter((l) => !looksJson.looks[l]!.bodyAtlas);
const worldLooks = [
  ...Object.keys(looksJson.looks).filter((l) => !covers.includes(l)),
  ...Object.keys(looksJson.villagers),
  ...Object.keys(looksJson.figures),
];
const shipped = existsSync(FIGURES_DIR) ? figureLooks(FIGURES_DIR) : [];
const atlasOf = (look: string) => json<Atlas>(join(FIGURES_DIR, `char_${look}.json`));

describe('the figure batch (tools/sprites/batches/11F.json)', () => {
  const batch = json<Batch>(BATCH);
  const models = json<{ models: { id: string; kind: string }[] }>(MODELS).models.filter(
    (m) => m.kind === 'character',
  );

  it('maps each model to a world look, once, and never to a cover card', () => {
    const looks = batch.figures.map((f) => f.look);
    expect(new Set(looks).size).toBe(looks.length);
    for (const f of batch.figures) {
      expect(worldLooks, f.look).toContain(f.look);
      expect(
        models.map((m) => m.id),
        f.model,
      ).toContain(f.model);
    }
    expect(covers.sort()).toEqual(['accomplice', 'drifter', 'killer']);
  });

  it('names every Higgsfield model with no world look, and every world look with no model, as a gap', () => {
    const mapped = new Set(batch.figures.map((f) => f.model));
    const gapModels = batch.gaps.flatMap((g) => (g.model ? [g.model] : []));
    const gapLooks = batch.gaps.flatMap((g) => (g.look ? [g.look] : []));
    const ids = new Set(models.map((m) => m.id));
    for (const look of worldLooks.filter((l) => !ids.has(l))) expect(gapLooks, look).toContain(look);
    const higgsfield = json<{ models: { id: string; source: string; kind: string }[] }>(MODELS).models.filter(
      (m) => m.kind === 'character' && m.source === 'higgsfield',
    );
    for (const m of higgsfield) expect(mapped.has(m.id) || gapModels.includes(m.id), m.id).toBe(true);
  });

  it('ships exactly the figures of the drops that have landed', () => {
    for (const look of shipped)
      expect(
        batch.figures.map((f) => f.look),
        look,
      ).toContain(look);
  });
});

describe('the figure atlases (apps/client/public/assets/figures)', () => {
  it('list each shipped atlas in the folder manifest, loaded by no map until the sprite world asks', () => {
    if (shipped.length === 0) return;
    const manifest = json<{ entries: unknown[] }>(join(FIGURES_DIR, 'manifest.json'));
    expect(manifest.entries).toEqual(shipped.map(figureEntry));
  });

  it.each(shipped)(
    '%s has every idle and walk key in all eight directions, at the cell and pivot of today',
    (look) => {
      expect(covers).not.toContain(look);
      expect(worldLooks).toContain(look);
      const atlas = atlasOf(look);
      const frames = new Map(atlas.textures.flatMap((t) => t.frames.map((f) => [f.filename, f] as const)));
      const want = Object.entries(CLIPS).flatMap(([anim, n]) =>
        DIRECTIONS.flatMap((d) =>
          Array.from({ length: n }, (_, i) => `char/${look}/${anim}/${d}/${String(i).padStart(3, '0')}`),
        ),
      );
      expect([...frames.keys()].sort()).toEqual(want.sort());
      for (const f of frames.values()) {
        expect(f.sourceSize, f.filename).toEqual({ w: CELL, h: CELL });
        expect(f.pivot, f.filename).toEqual(PIVOT);
      }
      for (const t of atlas.textures) {
        expect(existsSync(join(FIGURES_DIR, t.image)), t.image).toBe(true);
        expect(t.size.w * t.size.h, t.image).toBeLessThanOrEqual(CHAR_PAGE.w * CHAR_PAGE.h);
      }
    },
  );

  it.each(shipped)('%s passes the tone check against the palette (look.md 3.3)', (look) => {
    for (const t of atlasOf(look).textures) {
      const frames = t.frames.map((f) => ({ name: f.filename, ...f.frame }));
      const report = toneReport(readFileSync(join(FIGURES_DIR, t.image)), frames);
      for (const d of report.dominant)
        expect(d.deltaE, `${t.image} ${d.lab.join(',')}`).toBeLessThanOrEqual(TONE.nearDeltaE);
      expect(report.saturated, t.image).toEqual([]);
      expect(report.darkerThanInk, t.image).toBe(0);
    }
  });
});

describe('the tone check (figure-tone.ts)', () => {
  it('finds the dominant colours of a page, the same on every run', () => {
    const red = oklab(200, 40, 40);
    const grey = oklab(120, 120, 120);
    const points: Lab[] = [...Array<Lab>(30).fill(red), ...Array<Lab>(70).fill(grey)];
    const a = kmeans(points, 2);
    expect(a).toEqual(kmeans(points, 2));
    const byCount = [...a].sort((p, q) => q.count - p.count);
    expect(byCount.map((c) => c.count)).toEqual([70, 30]);
    expect(byCount[0]!.centre[0]).toBeCloseTo(grey[0], 6);
  });

  it('fails a saturated frame, a colour far from the palette and a pixel darker than ink', () => {
    const png = solidPng(4, 4, [230, 20, 200, 255]);
    const report = toneReport(png, [{ name: 'magenta', x: 0, y: 0, w: 4, h: 4 }]);
    expect(report.saturated.map((s) => s.name)).toEqual(['magenta']);
    expect(Math.max(...report.dominant.map((d) => d.deltaE))).toBeGreaterThan(TONE.nearDeltaE);
    expect(
      toneReport(solidPng(2, 2, [0, 0, 0, 255]), [{ name: 'k', x: 0, y: 0, w: 2, h: 2 }]).darkerThanInk,
    ).toBe(4);
    expect(
      toneReport(solidPng(2, 2, [0, 0, 0, 0]), [{ name: 'clear', x: 0, y: 0, w: 2, h: 2 }]).darkerThanInk,
    ).toBe(0);
  });

  it('lifts a pixel darker than ink to ink and leaves a lighter one untouched (the ink floor)', () => {
    const samples: [number, number, number][] = [
      [200, 40, 40],
      [18, 20, 28],
      [111, 122, 140],
    ];
    for (const rgb of samples) {
      expect(fromOklab(oklab(...rgb))).toEqual(rgb);
    }
    const black = toneReport(inkFloor(solidPng(2, 2, [0, 0, 0, 255])), [
      { name: 'k', x: 0, y: 0, w: 2, h: 2 },
    ]);
    expect(black.darkerThanInk).toBe(0);
    const coat = inkFloor(solidPng(1, 1, [30, 24, 20, 255]));
    expect(inkFloor(solidPng(1, 1, [30, 24, 20, 255]))).toEqual(coat);
    const light = decodePng(inkFloor(solidPng(1, 1, [120, 110, 100, 255]))).data;
    expect(oklab(120, 110, 100)[0]).toBeGreaterThan(INK_FLOOR.knee);
    expect([...light]).toEqual([120, 110, 100, 255]);
  });
});

/** A minimal RGBA PNG of one colour (filter 0 on every row). */
function solidPng(w: number, h: number, rgba: [number, number, number, number]): Buffer {
  const { deflateSync, crc32 } = zlib;
  const chunk = (type: string, body: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])) >>> 0, 0);
    return Buffer.concat([head, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => rgba).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
