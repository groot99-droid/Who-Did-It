// Review sheets and portraits of Session 5L (art plan 4.4-4.5, 7):
//
//   tsx lineup.ts sheets <finished root> <review dir>    looks-lineup.png and looks-silhouettes.png
//   tsx lineup.ts portrait <generated image> <lookId> <assets dir> [--style <id>]   <root>portraits/portrait_<lookId>.webp
//   tsx lineup.ts portraits <assets dir> <review dir>    portraits-main.png (every portrait at 1x)
//   tsx lineup.ts gate-b <finished root> <assets dir> <review dir>   gate-b-character.png
//
// The lineup puts every world look side by side in `s` and `ne` idle, at 1x and 2x, with each scarf tint;
// the silhouettes sheet fills the same lineup solid ink, so every look must read by shape alone. A portrait
// is a T4 generation finished to 128 x 192 art (`finishIllustration`), x3 nearest, lossless WebP; in the low-poly
// style (DECISIONS A79) the same generation is cropped and smooth-downscaled to 384 x 576 without the snap,
// lossy WebP at `offWebpQuality`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage, type Image, type SKRSContext2D } from '@napi-rs/canvas';
import type { Rgba } from './bleed.ts';
import { contactSheet, drawTinted, drawZoomed, load } from './contact.ts';
import { frameFileName } from './keys.ts';
import { artStyle, defaultArtStyle, pixelSettings, type ArtStyle } from './palette.ts';
import { boxResize, crop, finishIllustration, offWebpQuality, upscaleNearest, writeWebp } from './pixel.ts';
import { worldLooks } from './placeholder-chars.ts';
import { PALETTE } from './placeholder.ts';

/** Portrait art box (art plan 1.3): 128 x 192 art, x3 to 384 x 576. */
export const PORTRAIT = { w: 128, h: 192 } as const;
const TINTS = [PALETTE.blood, PALETTE.teal, PALETTE.moon] as const;
const COVERS = ['killer', 'accomplice', 'drifter'] as const;

/** Every portrait key: the 10 world looks and the 3 cover cards (looks.json order). */
export function portraitLooks(): string[] {
  const doc = JSON.parse(
    readFileSync(join(import.meta.dirname, '../../packages/content/data/looks.json'), 'utf8'),
  ) as { looks: Record<string, unknown> };
  return Object.keys(doc.looks);
}

function toRgba(img: Image): Rgba {
  const c = createCanvas(img.width, img.height);
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, img.width, img.height);
  return { width: d.width, height: d.height, data: new Uint8Array(d.data.buffer) };
}

/** Finish one T4 generation into `<style root>portraits/portrait_<lookId>.webp` (8-bit: lossless, x3). */
export async function finishPortrait(
  src: string,
  lookId: string,
  assets: string,
  style: ArtStyle = defaultArtStyle(),
): Promise<string> {
  const img = toRgba(await loadImage(readFileSync(src)));
  const out = join(assets, style.root, 'portraits', `portrait_${lookId}.webp`);
  if (style.pixelFinish) {
    const art = finishIllustration(img, PORTRAIT.w, PORTRAIT.h);
    await writeWebp(upscaleNearest(art, pixelSettings.illustrationScale), out);
  } else {
    const [w, h] = [
      PORTRAIT.w * pixelSettings.illustrationScale,
      PORTRAIT.h * pixelSettings.illustrationScale,
    ];
    await writeWebp(boxResize(crop(img, undefined, w, h), w, h), out, offWebpQuality);
  }
  return out;
}

function label(g: SKRSContext2D, text: string, x: number, y: number): void {
  g.fillStyle = PALETTE.bone;
  g.font = '600 12px sans-serif';
  g.fillText(text, x, y);
}

/** Draw a frame filled solid ink (alpha kept): the silhouette test. */
function drawInk(g: SKRSContext2D, img: Image, x: number, y: number, zoom: number): void {
  const c = createCanvas(img.width, img.height);
  const cg = c.getContext('2d');
  cg.drawImage(img, 0, 0);
  cg.globalCompositeOperation = 'source-in';
  cg.fillStyle = PALETTE.ink;
  cg.fillRect(0, 0, img.width, img.height);
  drawZoomed(g, c as unknown as Image, x, y, zoom);
}

/** The lineup (or, with `ink`, the silhouettes) of every world look found under `root`. */
export async function lineupSheet(root: string, ink = false): Promise<Buffer> {
  const looks = worldLooks()
    .map((l) => l.id)
    .filter((id) => existsSync(join(root, id, 'manifest.json')));
  const cell = 64;
  const views = ['s', 'ne'] as const;
  const rows = ink
    ? [{ zoom: 2, tint: '' }]
    : [1, 2].flatMap((zoom) => TINTS.map((tint) => ({ zoom, tint })));
  const colW = views.length * cell * 2 + 8;
  const height = rows.reduce((h, r) => h + cell * r.zoom + 4, 20);
  const canvas = createCanvas(16 + looks.length * colW, height);
  const g = canvas.getContext('2d');
  g.fillStyle = ink ? PALETTE.bone : PALETTE.slate;
  g.fillRect(0, 0, canvas.width, canvas.height);
  for (const [i, look] of looks.entries()) {
    const x0 = 16 + i * colW;
    if (!ink) label(g, look, x0, 14);
    let y = 20;
    for (const row of rows) {
      for (const [k, dir] of views.entries()) {
        const stem = frameFileName({ body: look, anim: 'idle', dir, index: 0 });
        const x = x0 + k * cell * row.zoom;
        const body = await load(join(root, look), 'body', stem);
        const scarf = await load(join(root, look), 'scarf', stem);
        if (!body) continue;
        if (ink) {
          drawInk(g, body, x, y, row.zoom);
          if (scarf) drawInk(g, scarf, x, y, row.zoom);
        } else {
          drawZoomed(g, body, x, y, row.zoom);
          if (scarf) drawTinted(g, scarf, x, y, row.tint, row.zoom);
        }
      }
      y += cell * row.zoom + 4;
    }
  }
  return canvas.toBuffer('image/png');
}

/** All 13 portraits at 1x (384 x 576 each), world looks then covers. */
export async function portraitsSheet(assets: string): Promise<Buffer> {
  const ids = portraitLooks().filter((id) => existsSync(join(assets, 'portraits', `portrait_${id}.webp`)));
  const w = PORTRAIT.w * 3;
  const h = PORTRAIT.h * 3;
  const cols = 7;
  const canvas = createCanvas(cols * (w + 8) + 8, Math.ceil(ids.length / cols) * (h + 28) + 8);
  const g = canvas.getContext('2d');
  g.fillStyle = PALETTE.slate;
  g.fillRect(0, 0, canvas.width, canvas.height);
  for (const [i, id] of ids.entries()) {
    const x = 8 + (i % cols) * (w + 8);
    const y = 8 + Math.floor(i / cols) * (h + 28);
    g.drawImage(await loadImage(readFileSync(join(assets, 'portraits', `portrait_${id}.webp`))), x, y);
    label(g, (COVERS as readonly string[]).includes(id) ? `${id} (cover)` : id, x, y + h + 18);
  }
  return canvas.toBuffer('image/png');
}

/** Gate B (art plan 7): the Baker's contact sheet and the lineup beside portrait_baker. */
export async function gateBSheet(root: string, assets: string): Promise<Buffer> {
  const contact = await loadImage(await contactSheet(join(root, 'baker')));
  const lineup = await loadImage(await lineupSheet(root));
  const portrait = await loadImage(readFileSync(join(assets, 'portraits', 'portrait_baker.webp')));
  const w = contact.width + 16 + Math.max(portrait.width, lineup.width);
  const h = Math.max(contact.height, portrait.height + 16 + lineup.height);
  const canvas = createCanvas(w, h);
  const g = canvas.getContext('2d');
  g.fillStyle = PALETTE.slate;
  g.fillRect(0, 0, w, h);
  g.drawImage(contact, 0, 0);
  g.drawImage(portrait, contact.width + 16, 0);
  g.drawImage(lineup, contact.width + 16, portrait.height + 16);
  return canvas.toBuffer('image/png');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--style');
  const style = at >= 0 ? artStyle(args.splice(at, 2)[1] ?? '') : defaultArtStyle();
  const [cmd, a, b, c] = args;
  const write = (dir: string, name: string, bytes: Buffer) => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), bytes);
    console.log(`lineup: ${join(dir, name)}`);
  };
  if (cmd === 'sheets' && a && b) {
    write(b, 'looks-lineup.png', await lineupSheet(a));
    write(b, 'looks-silhouettes.png', await lineupSheet(a, true));
  } else if (cmd === 'portrait' && a && b && c) {
    console.log(`lineup: ${await finishPortrait(a, b, c, style)}`);
  } else if (cmd === 'portraits' && a && b) {
    write(b, 'portraits-main.png', await portraitsSheet(a));
  } else if (cmd === 'gate-b' && a && b && c) {
    write(c, 'gate-b-character.png', await gateBSheet(a, b));
  } else {
    console.error(
      'usage: tsx lineup.ts sheets <finished root> <review dir> | portrait <image> <lookId> <assets dir> [--style <id>] |' +
        ' portraits <assets dir> <review dir> | gate-b <finished root> <assets dir> <review dir>',
    );
    process.exit(2);
  }
}
