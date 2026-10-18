import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas, Image } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { decodePng, type Rgba } from '../bleed.ts';
import { finishEnabled } from '../palette.ts';
import { audit } from '../pixel.ts';
import { ASSETS, realPages } from './realAssets.ts';

/** Main-mode rig renders keep the rig's colours and partial alpha while the main finish is off (S3.1). */
const RIG_PREFIXES = ['iso_ground_', 'iso_kit_', 'bld_', 'props', 'clues', 'char_', 'ovl_', 'vfx'];
const SATURATED_CAP = 0.1;
/** Overlay pages are masks (the bone scarf, tinted at runtime, and the flat blood mask shown while Bloody,
 * SPRITES 3): they keep the world colours and hard alpha, and the cap applies to the drawn `char_` pages. */
const MASK_PREFIXES = ['ovl_'];

function decode(file: string): Rgba {
  const buf = readFileSync(file);
  if (file.endsWith('.png')) return decodePng(buf);
  const img = new Image();
  img.src = buf;
  const ctx = createCanvas(img.width, img.height).getContext('2d');
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, img.width, img.height);
  return { width: d.width, height: d.height, data: new Uint8Array(d.data.buffer) };
}

describe('world palette on every exported image (docs/ASSETS.md 6.1, art plan 1.7)', () => {
  const finished = finishEnabled('main');
  const pages = realPages().filter((p) => finished || !RIG_PREFIXES.some((x) => p.key.startsWith(x)));

  for (const p of pages) {
    it(`${p.key}: ${p.file.slice(ASSETS.length + 1)} is world colours, alpha 0 or 255, saturated <= 10%`, () => {
      const a = audit(decode(p.file));
      expect(a.offPalette, 'pixels off the world palette').toBe(0);
      expect(a.partialAlpha, 'pixels with partial alpha').toBe(0);
      if (!MASK_PREFIXES.some((x) => p.key.startsWith(x)))
        expect(a.saturatedShare).toBeLessThanOrEqual(SATURATED_CAP);
    });
  }

  it.skipIf(!finished)('the IsoCam calibration sheet is finished (world colours, alpha 0 or 255)', () => {
    const a = audit(decodePng(readFileSync(join(ASSETS, 'calibration/calibration_sheet.png'))));
    expect(a.offPalette).toBe(0);
    expect(a.partialAlpha).toBe(0);
  });
});
