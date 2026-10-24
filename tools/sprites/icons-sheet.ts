// The review sheet of the round-8 icons (8N, teardown.md 3) for the owner's look: each master in the three art
// styles, at HUD size (the 48 px file as the client draws it) and enlarged four times so the drawing can be judged.
// Labels are Inter (OFL), the placeholder tools' font.
//
//   tsx tools/sprites/icons-sheet.ts <out.png> [key ...]     every master, or the keys given, in that order
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, ImageData, type SKRSContext2D } from '@napi-rs/canvas';
import { encodePng, type Rgba } from './bleed.ts';
import { GRID, GROUND, type IconStyleId, masterKeys, readMaster, renderIcon } from './icons.ts';
import { paletteFile } from './palette.ts';
import { FONT, registerFont } from './placeholder-kit.ts';
import { upscaleNearest } from './pixel.ts';

const STYLES: ReadonlyArray<[IconStyleId, string]> = [
  ['8bit', '8-bit'],
  ['lowpoly', 'Low poly'],
  ['hd', 'HD'],
];

const HUD = GRID;
const BIG = GRID * 4;
const PAD = 24;
const LABEL_W = 150;
const COL_W = HUD + 16 + BIG + 40;

/** Composites a render over the sheet (putImageData would replace the slate under its transparent corners). */
function blit(g: SKRSContext2D, img: Rgba, x: number, y: number): void {
  const tmp = createCanvas(img.width, img.height);
  tmp
    .getContext('2d')
    .putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  g.drawImage(tmp, x, y);
}

/** The HUD-size and enlarged renders of one icon in one style. */
async function cell(svg: string, style: IconStyleId): Promise<[Rgba, Rgba]> {
  if (style === 'hd') return [await renderIcon(svg, 'hd', HUD), await renderIcon(svg, 'hd', BIG)];
  const shipped = await renderIcon(svg, style);
  return [shipped, upscaleNearest(shipped, BIG / HUD)];
}

export async function sheet(keys: readonly string[]): Promise<Buffer> {
  registerFont();
  const w = PAD + LABEL_W + STYLES.length * COL_W;
  const h = PAD + 36 + keys.length * (BIG + PAD) + 24;
  const canvas = createCanvas(w, h);
  const g = canvas.getContext('2d');
  g.fillStyle = paletteFile.colors['slate']!;
  g.fillRect(0, 0, w, h);
  g.fillStyle = paletteFile.colors['bone']!;
  g.font = `18px ${FONT}`;
  STYLES.forEach(([, label], i) => g.fillText(label, PAD + LABEL_W + i * COL_W, PAD + 14));
  g.font = `13px ${FONT}`;
  g.fillStyle = paletteFile.colors['fog']!;
  STYLES.forEach(([style], i) => {
    const note = style === 'hd' ? 'the SVG master, drawn at size' : 'the generated 48 px file, and at 4x';
    g.fillText(note, PAD + LABEL_W + i * COL_W, PAD + 32);
  });
  for (const [row, key] of keys.entries()) {
    const svg = readMaster(key);
    const y = PAD + 36 + row * (BIG + PAD);
    g.fillStyle = paletteFile.colors['bone']!;
    g.font = `18px ${FONT}`;
    g.fillText(label(key), PAD, y + 24);
    g.fillStyle = paletteFile.colors['fog']!;
    g.font = `13px ${FONT}`;
    g.fillText(key, PAD, y + 44);
    for (const [col, [style]] of STYLES.entries()) {
      const x = PAD + LABEL_W + col * COL_W;
      const [small, big] = await cell(svg, style);
      blit(g, small, x, y);
      blit(g, big, x + HUD + 16, y);
    }
  }
  // The ground under every icon, said on the sheet so the owner can ask for pure white instead.
  g.fillStyle = paletteFile.colors['fog']!;
  g.font = `13px ${FONT}`;
  g.fillText(
    `Ground: ${GROUND}, the warm white of the bone ramp (the palette has no pure white in art); pure white on request.`,
    PAD,
    h - 14,
  );
  const d = g.getImageData(0, 0, w, h);
  return encodePng({ width: w, height: h, data: new Uint8Array(d.data.buffer.slice(0)) });
}

/** A key read as words: `icon_effect_knockedOut` is "knocked out". */
const label = (key: string): string => {
  const w = key
    .replace(/^icon_[a-z]+_/, '')
    .replace(/([A-Z])/g, ' $1')
    .toLowerCase();
  return w.charAt(0).toUpperCase() + w.slice(1);
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [out, ...keys] = process.argv.slice(2);
  if (!out) {
    console.error('usage: tsx icons-sheet.ts <out.png> [key ...]');
    process.exit(2);
  }
  writeFileSync(resolve(out), await sheet(keys.length > 0 ? keys : masterKeys()));
}
