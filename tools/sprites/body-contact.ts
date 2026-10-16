// Review sheet for the body on the floor (docs/SPRITES.md 8): the last frame of `die` in all 8
// directions, one row per trait look (scarf tint and hat), plus a Bloody row, in the 256 px die cells.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import { drawTinted, load } from './contact.ts';
import type { FeetManifest } from './gen-anims.ts';
import { CLIP_CELL, DIRECTIONS, V1_CLIPS, frameFileName } from './keys.ts';
import { PALETTE } from './placeholder.ts';

const LABEL_W = 160;
const ROWS = [
  { label: 'red scarf, bare', tint: PALETTE.blood, hat: null, blood: false },
  { label: 'green scarf, cap', tint: PALETTE.teal, hat: 'hat_cap', blood: false },
  { label: 'blue scarf, bowler', tint: PALETTE.moon, hat: 'hat_bowler', blood: false },
  { label: 'bloody, cap', tint: PALETTE.blood, hat: 'hat_cap', blood: true },
] as const;

export async function bodyContactSheet(dir: string): Promise<Buffer> {
  const { body } = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as FeetManifest;
  const cell = CLIP_CELL.die?.[0] ?? 256;
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
      g.drawImage(base, x, y);
      if (row.blood) {
        const blood = await load(dir, 'blood', stem);
        if (blood) g.drawImage(blood, x, y);
      }
      const scarf = await load(dir, 'scarf', stem);
      if (scarf) drawTinted(g, scarf, x, y, row.tint);
      if (row.hat) {
        const hat = await load(dir, row.hat, stem);
        if (hat) g.drawImage(hat, x, y);
      }
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
