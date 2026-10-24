import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodePng } from '../bleed.ts';
import { ICONS_DIR, RASTER_STYLES, flatten, masterKeys, readMaster, renderIcon } from '../icons.ts';
import { paletteFile } from '../palette.ts';

const SPRITES = join(import.meta.dirname, '../../../docs/SPRITES.md');
const world = new Set(
  [
    ...Object.values(paletteFile.world.ramps as Record<string, string[]>).flat(),
    paletteFile.colors['ink']!,
  ].map((h) => h.toUpperCase()),
);

describe('round-8 icon masters (docs/SPRITES.md 9.1)', () => {
  const keys = masterKeys();

  it('are the keys listed in SPRITES.md 9.1 (each `icon_` and a name of its table)', () => {
    const section = readFileSync(SPRITES, 'utf8').split('### 9.1')[1]!.split('\n## ')[0]!;
    const rows = section.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Family'));
    const listed = rows.flatMap((r) => [...r.matchAll(/`([a-z]+_[A-Za-z]+)`/g)].map((m) => `icon_${m[1]}`));
    expect(keys).toEqual(listed.sort());
  });

  it('each have both generated rasters, and no raster lacks its master', () => {
    for (const style of RASTER_STYLES) {
      const pngs = readdirSync(join(ICONS_DIR, style)).filter((f) => f.endsWith('.png'));
      expect(pngs.map((f) => f.slice(0, -4)).sort(), style).toEqual(keys);
    }
  });

  for (const key of keys) {
    const svg = readMaster(key);
    it(`${key} is on the 48 grid, in the world palette, with both looks well formed`, () => {
      expect(svg).toMatch(
        /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 48 48" width="48" height="48">/,
      );
      for (const [hex] of svg.matchAll(/#[0-9A-Fa-f]{6}\b/g))
        expect(world.has(hex.toUpperCase()), hex).toBe(true);
      expect(svg).not.toMatch(/<text|font-family|<image|href=|<g[ >]|<style/);
      // A look marker is the first attribute of a self-closing element, so the flat look can drop or show it.
      for (const [tag] of svg.matchAll(/<[^>]*class="[^"]*"[^>]*>/g)) {
        expect(tag, tag).toMatch(/^<[a-z]+ class="(hd|flat)"/);
        expect(tag, tag).toMatch(/\/>$/);
        if (tag.includes('class="flat"')) expect(tag).toContain('class="flat" display="none"');
      }
      const flat = flatten(svg);
      expect(flat).not.toMatch(/url\(#|class=|display="none"|<defs/);
    });

    it(`${key}'s rasters are current (48 px, generated from the master, never hand-edited)`, async () => {
      for (const style of RASTER_STYLES) {
        const png = decodePng(readFileSync(join(ICONS_DIR, style, `${key}.png`)));
        const fresh = await renderIcon(svg, style);
        expect([png.width, png.height]).toEqual([48, 48]);
        expect(Buffer.from(png.data).equals(Buffer.from(fresh.data)), `${style}/${key}.png`).toBe(true);
      }
    });
  }
});

describe('flatten', () => {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">',
    '<defs>',
    '  <linearGradient id="g0" data-flat="#D9D2C2" x1="0"><stop offset="0" stop-color="#FFF1DC"/></linearGradient>',
    '</defs>',
    '<rect x="1" fill="url(#g0)"/>',
    '<ellipse class="hd" cx="2" fill="#FFF1DC"/>',
    '<path class="flat" display="none" d="M0,0" fill="#12141C"/>',
    '</svg>',
  ].join('\n');

  it('drops the HD-only elements and the gradients, and shows the flat-only ones', () => {
    expect(flatten(svg)).toBe(
      [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">',
        '<rect x="1" fill="#D9D2C2"/>',
        '<path d="M0,0" fill="#12141C"/>',
        '</svg>',
      ].join('\n'),
    );
  });

  it('refuses a gradient with no flat colour', () => {
    expect(() => flatten(svg.replace(' data-flat="#D9D2C2"', ''))).toThrow(/g0/);
  });
});
