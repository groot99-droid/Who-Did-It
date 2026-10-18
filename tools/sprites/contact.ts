// Contact sheet for art review (art plan 4.4, `looks-contact-<id>.png`): every clip of one body in 8
// directions at 2x, the body pass with the scarf tinted moon, frames left to right on a slate ground,
// plus one strip of every pass alone and the bloody composite (idle, s, frame 0). Reads a finished
// render folder (the `pixel` CLI's output, packed-size cells) or a raw one; cells come from its manifest.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage, type Image, type SKRSContext2D } from '@napi-rs/canvas';
import type { FeetManifest } from './gen-anims.ts';
import { DIRECTIONS, PASSES, V1_CLIPS, frameFileName, type Anim, type Pass } from './keys.ts';
import { PALETTE } from './placeholder.ts';

const LABEL_W = 120;
export const ZOOM = 2;
const SCARF_TINT = PALETTE.moon;

export async function load(dir: string, pass: Pass, stem: string): Promise<Image | null> {
  try {
    return await loadImage(readFileSync(join(dir, pass, `${stem}.png`)));
  } catch {
    return null;
  }
}

/** Draw a grey overlay tinted by multiply, clipped to its own alpha, scaled by `zoom` (nearest). */
export function drawTinted(g: SKRSContext2D, img: Image, x: number, y: number, tint: string, zoom = 1): void {
  const c = createCanvas(img.width, img.height);
  const cg = c.getContext('2d');
  cg.drawImage(img, 0, 0);
  cg.globalCompositeOperation = 'multiply';
  cg.fillStyle = tint;
  cg.fillRect(0, 0, img.width, img.height);
  cg.globalCompositeOperation = 'destination-in';
  cg.drawImage(img, 0, 0);
  g.imageSmoothingEnabled = false;
  g.drawImage(c, x, y, img.width * zoom, img.height * zoom);
}

export function drawZoomed(g: SKRSContext2D, img: Image, x: number, y: number, zoom = 1): void {
  g.imageSmoothingEnabled = false;
  g.drawImage(img, x, y, img.width * zoom, img.height * zoom);
}

/** The cell of a clip in this render folder: the manifest's `cell`, or a frame's own `cell` (die). */
export function cellOf(manifest: FeetManifest, anim: Anim): number {
  const stem = frameFileName({ body: manifest.body, anim, dir: 's', index: 0 });
  return manifest.frames[stem]?.cell ?? manifest.cell;
}

export async function contactSheet(dir: string, zoom = ZOOM): Promise<Buffer> {
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as FeetManifest;
  const body = manifest.body;
  const anims = (Object.keys(V1_CLIPS) as Anim[]).filter((a) =>
    Object.keys(manifest.frames).some((k) => k.startsWith(`char_${body}_${a}_`)),
  );
  const rows = anims.flatMap((anim) =>
    DIRECTIONS.map((d) => ({ anim, dir: d, cell: cellOf(manifest, anim) * zoom })),
  );
  const step = manifest.cell * zoom;
  const maxFrames = Math.max(...anims.map((a) => V1_CLIPS[a].frames));
  const width = LABEL_W + maxFrames * Math.max(...rows.map((r) => r.cell));
  const height = rows.reduce((h, r) => h + r.cell, 0) + step;
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
      drawZoomed(g, base, x, y, zoom);
      const scarf = await load(dir, 'scarf', stem);
      if (scarf) drawTinted(g, scarf, x, y, SCARF_TINT, zoom);
    }
    y += row.cell;
  }
  // One strip of every pass alone, then the bloody composite with a blood-red scarf.
  const stem = frameFileName({ body, anim: 'idle', dir: 's', index: 0 });
  g.fillStyle = PALETTE.bone;
  g.fillText('passes', 8, y + step / 2);
  let x = LABEL_W;
  for (const pass of PASSES) {
    const img = await load(dir, pass, stem);
    if (img) drawZoomed(g, img, x, y, zoom);
    x += step;
  }
  const base = await load(dir, 'body', stem);
  if (base) {
    drawZoomed(g, base, x, y, zoom);
    const blood = await load(dir, 'blood', stem);
    if (blood) drawZoomed(g, blood, x, y, zoom);
    const scarf = await load(dir, 'scarf', stem);
    if (scarf) drawTinted(g, scarf, x, y, PALETTE.blood, zoom);
  }
  return canvas.toBuffer('image/png');
}

// CLI: tsx tools/sprites/contact.ts <finished render dir, e.g. build/finished/baker> <out.png> [zoom]
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [renderDir, out, zoom] = process.argv.slice(2);
  if (!renderDir || !out) {
    console.error('usage: tsx contact.ts <render dir> <out.png> [zoom]');
    process.exit(2);
  }
  writeFileSync(out, await contactSheet(renderDir, zoom ? Number(zoom) : ZOOM));
  console.log(`contact: ${out}`);
}
