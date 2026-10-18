// Review sheet for the body on the floor (docs/SPRITES.md 8): the last frame of `die` in all 8
// directions, one row per scarf tint plus a Bloody row, in the die cells (2x for a finished folder).
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import { ZOOM, cellOf, drawTinted, drawZoomed, load } from './contact.ts';
import type { FeetManifest } from './gen-anims.ts';
import { DIRECTIONS, V1_CLIPS, frameFileName } from './keys.ts';
import { PALETTE } from './placeholder.ts';

const LABEL_W = 160;
const ROWS = [
  { label: 'red scarf', tint: PALETTE.blood, blood: false },
  { label: 'green scarf', tint: PALETTE.teal, blood: false },
  { label: 'blue scarf', tint: PALETTE.moon, blood: false },
  { label: 'bloody, red scarf', tint: PALETTE.blood, blood: true },
] as const;

export async function bodyContactSheet(dir: string, zoom = ZOOM): Promise<Buffer> {
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as FeetManifest;
  const body = manifest.body;
  const cell = cellOf(manifest, 'die') * zoom;
  const last = V1_CLIPS.die.frames - 1;
  const canvas = createCanvas(LABEL_W + DIRECTIONS.length * cell, (ROWS.length + 0.25) * cell);
  const g = canvas.getContext('2d');
  g.fillStyle = PALETTE.slate;
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.font = '600 16px sans-serif';
  g.fillStyle = PALETTE.bone;
  DIRECTIONS.forEach((d, i) => g.fillText(d, LABEL_W + i * cell + cell / 2 - 8, 40));
  for (const [r, row] of ROWS.entries()) {
    const y = cell / 4 + r * cell;
    g.fillStyle = PALETTE.bone;
    g.fillText(row.label, 8, y + cell / 2);
    for (const [i, d] of DIRECTIONS.entries()) {
      const stem = frameFileName({ body, anim: 'die', dir: d, index: last });
      const x = LABEL_W + i * cell;
      const base = await load(dir, 'body', stem);
      if (!base) throw new Error(`missing body frame ${stem}`);
      drawZoomed(g, base, x, y, zoom);
      if (row.blood) {
        const blood = await load(dir, 'blood', stem);
        if (blood) drawZoomed(g, blood, x, y, zoom);
      }
      const scarf = await load(dir, 'scarf', stem);
      if (scarf) drawTinted(g, scarf, x, y, row.tint, zoom);
    }
  }
  return canvas.toBuffer('image/png');
}

// CLI: tsx tools/sprites/body-contact.ts <render dir with the die clip> <out.png>
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [renderDir, out] = process.argv.slice(2);
  if (!renderDir || !out) {
    console.error('usage: tsx body-contact.ts <render dir> <out.png>');
    process.exit(2);
  }
  writeFileSync(out, await bodyContactSheet(renderDir));
  console.log(`body-contact: ${out}`);
}
