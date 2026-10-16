// Contact sheet for art review (docs/ASSETS.md 6.3): every clip and direction of one body, the body
// pass with the scarf (tinted) and cap overlays composited, frames left to right, on a slate ground,
// plus one strip of every pass alone (idle, s, frame 0).
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage, type Image, type SKRSContext2D } from '@napi-rs/canvas';
import type { FeetManifest } from './gen-anims.ts';
import {
  CELL_PX,
  CLIP_CELL,
  DIRECTIONS,
  PASSES,
  V1_CLIPS,
  frameFileName,
  type Anim,
  type Pass,
} from './keys.ts';
import { PALETTE } from './placeholder.ts';

const LABEL_W = 96;
const SCARF_TINT = PALETTE.teal;

export async function load(dir: string, pass: Pass, stem: string): Promise<Image | null> {
  try {
    return await loadImage(readFileSync(join(dir, pass, `${stem}.png`)));
  } catch {
    return null;
  }
}

/** Draw a grey overlay tinted by multiply, clipped to its own alpha. */
export function drawTinted(g: SKRSContext2D, img: Image, x: number, y: number, tint: string): void {
  const c = createCanvas(img.width, img.height);
  const cg = c.getContext('2d');
  cg.drawImage(img, 0, 0);
  cg.globalCompositeOperation = 'multiply';
  cg.fillStyle = tint;
  cg.fillRect(0, 0, img.width, img.height);
  cg.globalCompositeOperation = 'destination-in';
  cg.drawImage(img, 0, 0);
  g.drawImage(c, x, y);
}

export async function contactSheet(dir: string): Promise<Buffer> {
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as FeetManifest;
  const body = manifest.body;
  const anims = Object.keys(V1_CLIPS) as Anim[];
  const rows: { anim: Anim; dir: (typeof DIRECTIONS)[number]; cell: number }[] = [];
  for (const anim of anims) {
    const cell = CLIP_CELL[anim]?.[0] ?? CELL_PX;
    for (const d of DIRECTIONS) rows.push({ anim, dir: d, cell });
  }
  const maxFrames = Math.max(...anims.map((a) => V1_CLIPS[a].frames));
  const width = LABEL_W + maxFrames * CELL_PX * 2;
  const height = rows.reduce((h, r) => h + r.cell, 0) + CELL_PX;
  const canvas = createCanvas(width, height);
  const g = canvas.getContext('2d');
  g.fillStyle = PALETTE.slate;
  g.fillRect(0, 0, width, height);
  g.font = '600 14px sans-serif';

  let y = 0;
  for (const row of rows) {
    g.fillStyle = PALETTE.bone;
    g.fillText(`${row.anim} ${row.dir}`, 8, y + row.cell / 2);
    for (let i = 0; i < V1_CLIPS[row.anim].frames; i++) {
      const stem = frameFileName({ body, anim: row.anim, dir: row.dir, index: i });
      const x = LABEL_W + i * row.cell;
      const base = await load(dir, 'body', stem);
      if (!base) continue;
      g.drawImage(base, x, y);
      const scarf = await load(dir, 'scarf', stem);
      if (scarf) drawTinted(g, scarf, x, y, SCARF_TINT);
      const cap = await load(dir, 'hat_cap', stem);
      if (cap) g.drawImage(cap, x, y);
    }
    y += row.cell;
  }
  // One strip of every pass alone, then the bowler and blood variant composited.
  const stem = frameFileName({ body, anim: 'idle', dir: 's', index: 0 });
  g.fillStyle = PALETTE.bone;
  g.fillText('passes', 8, y + CELL_PX / 2);
  let x = LABEL_W;
  for (const pass of PASSES) {
    const img = await load(dir, pass, stem);
    if (img) g.drawImage(img, x, y);
    x += CELL_PX;
  }
  const base = await load(dir, 'body', stem);
  if (base) {
    g.drawImage(base, x, y);
    for (const pass of ['blood', 'hat_bowler'] as const) {
      const img = await load(dir, pass, stem);
      if (img) g.drawImage(img, x, y);
    }
    const scarf = await load(dir, 'scarf', stem);
    if (scarf) drawTinted(g, scarf, x, y, PALETTE.blood);
  }
  return canvas.toBuffer('image/png');
}

// CLI: tsx tools/sprites/contact.ts <render dir, e.g. build/render/villager> <out.png>
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [renderDir, out] = process.argv.slice(2);
  if (!renderDir || !out) {
    console.error('usage: tsx contact.ts <render dir> <out.png>');
    process.exit(2);
  }
  writeFileSync(out, await contactSheet(renderDir));
  console.log(`contact: ${out}`);
}
