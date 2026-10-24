import { describe, expect, it } from 'vitest';
import { artStyles } from '../palette.ts';
import { villagerLooks } from '../placeholder-chars.ts';
import { hasManifest, type Page, realPages } from './realAssets.ts';

/**
 * Art plan 1.4 (SPRITES 10.14): the page caps, the resident limit and the DOM byte caps, for each art style
 * separately (1.9: one style is resident at a time). The resident cap went from 6 to 8 page-equivalents in round 8
 * (DECISIONS A141, 6Z's ruling): the four-heads figures' overlay pages and 8G's node page are inside it. It is 9
 * since the owner's option B of 2026-10-24 (A161): the round-8 clips at plan B's frame counts, limp and stagger in
 * four directions and the townsfolk's shorter clip set; a look's lazy clip pages are transient and outside the sum.
 */
const PAGE = 2048 * 2048;
const RESIDENT_CAP = 9.0;
/** The deck's ten world looks plus the villager family, resident on every map for the townsfolk (A161). */
const LOOKS_COUNTED = 10 + villagerLooks().length;

/** [prefix, width cap, height cap]; the first matching prefix wins, so `props_` precedes `props`. */
const CAPS: Array<[string, number, number]> = [
  ['iso_ground_', 1280, 1792],
  ['iso_kit_', 1024, 1024],
  ['bld_', 2048, 1024],
  ['props_', 1024, 1024],
  ['props', 1024, 1024],
  ['clues', 512, 512],
  ['vfx', 512, 2048],
  ['char_', 1024, 1024],
  ['ovl_', 1024, 512],
];
/** DOM images are not GPU pages; their cap is bytes per set. */
const DOM_BYTES: Array<[string, number]> = [
  ['portrait_', 0.8e6],
  ['thumb_', 0.2e6],
];

const isDom = (p: Page) => DOM_BYTES.some(([x]) => p.key.startsWith(x)) && p.entry.type === 'image';
const equiv = (ps: Page[]) => ps.reduce((n, p) => n + (p.width * p.height) / PAGE, 0);
const lookOf = (key: string) => /^(?:char|ovl)_([a-z][a-z0-9]*)$/.exec(key)?.[1];
/** A look's lazy pair (SPRITES 3, A161): one page each, outside the resident sum. */
const lazyOf = (key: string) => /^(?:char|ovl)_([a-z][a-z0-9]*)_2$/.exec(key)?.[1];

describe.each(artStyles().filter((s) => hasManifest(s.root)))(
  'texture budget, $id (art plan 1.4, SPRITES 10.14)',
  (style) => {
    const pages = realPages(style.root);
    const gpu = pages.filter((p) => !isDom(p));

    for (const p of gpu) {
      const cap = CAPS.find(([x]) => p.key.startsWith(x));
      if (!cap) continue;
      // A low-poly body at the round-8 clip table may take one page twice as tall (6Z's decision on #194, A161).
      const tall = cap[0] === 'char_' && !style.pixelFinish && lookOf(p.key) !== undefined;
      const h = tall ? cap[2] * 2 : cap[2];
      it(`${p.key} page ${p.width} x ${p.height} is within ${cap[1]} x ${h}`, () => {
        expect(p.width).toBeLessThanOrEqual(cap[1]);
        expect(p.height).toBeLessThanOrEqual(h);
      });
    }

    it('keeps each look within one body page and one overlay page, and its lazy pair the same', () => {
      const counts = new Map<string, number>();
      for (const p of gpu)
        if (lookOf(p.key) || lazyOf(p.key)) counts.set(p.key, (counts.get(p.key) ?? 0) + 1);
      expect([...counts.keys()].some((k) => lazyOf(k))).toBe(true);
      for (const [key, n] of counts) expect(n, key).toBe(1);
    });

    it('keeps the lazy pairs outside the resident sum: they load with no map', () => {
      for (const p of gpu) if (lazyOf(p.key)) expect(p.entry.maps, p.key).toEqual([]);
    });

    it(`fits each map's environment, the boot atlases and the ${LOOKS_COUNTED} largest looks in ${RESIDENT_CAP} pages`, () => {
      const looks = new Map<string, number>();
      for (const p of gpu) {
        const look = lookOf(p.key);
        if (look) looks.set(look, (looks.get(look) ?? 0) + equiv([p]));
      }
      const lookTotal = [...looks.values()]
        .sort((a, b) => b - a)
        .slice(0, LOOKS_COUNTED)
        .reduce((a, b) => a + b, 0);
      const boot = equiv(gpu.filter((p) => !lookOf(p.key) && !p.entry.maps));
      const maps = new Set(gpu.flatMap((p) => p.entry.maps ?? []));
      for (const map of maps.size ? maps : new Set([''])) {
        const env = equiv(gpu.filter((p) => p.entry.maps?.includes(map)));
        expect(env + boot + lookTotal, map || 'no map yet').toBeLessThanOrEqual(RESIDENT_CAP);
      }
    });

    for (const [prefix, cap] of DOM_BYTES) {
      it(`keeps the ${prefix}* DOM images within ${cap} bytes`, () => {
        const bytes = pages
          .filter((p) => isDom(p) && p.key.startsWith(prefix))
          .reduce((n, p) => n + p.bytes, 0);
        expect(bytes).toBeLessThanOrEqual(cap);
      });
    }
  },
);
