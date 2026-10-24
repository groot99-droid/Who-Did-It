// The review sheet of the round-8 status icons (8N, teardown.md 3) for the owner's look sign-off: each icon of the
// first sheet in the three art styles, at HUD size (the 24 px cell drawn at 2x, as the client draws it) and
// enlarged eight times so the drawing can be judged. Labels are Inter (OFL), the placeholder tools' font.
//
//   tsx tools/sprites/icons-sheet.ts <out dir>        writes sheet-01.png and one PNG per icon and style
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, ImageData, type SKRSContext2D } from '@napi-rs/canvas';
import { encodePng, type Rgba } from './bleed.ts';
import {
  CELL,
  type EffectIconId,
  FIRST_SHEET,
  GRID,
  GROUND,
  type IconStyleId,
  iconSvg,
  rasterise,
  renderIcon,
} from './icons.ts';
import { paletteFile } from './palette.ts';
import { FONT, registerFont } from './placeholder-kit.ts';
import { upscaleNearest } from './pixel.ts';

const STYLES: ReadonlyArray<[IconStyleId, string]> = [
  ['8bit', '8-bit'],
  ['lowpoly', 'Low poly'],
  ['hd', 'HD'],
];
/** The label of each icon on the sheet: the effect's name as the HUD will read it. */
const NAMES: Record<string, string> = {
  bleeding: 'Bleeding',
  wounded: 'Wounded',
  poisoned: 'Poisoned',
  stunned: 'Stunned',
  dazed: 'Dazed',
  knockedOut: 'Knocked out',
  slowed: 'Slowed',
  weakened: 'Weakened',
  fatigued: 'Fatigued',
  famished: 'Famished',
  indebted: 'Indebted',
};

const HUD = CELL * 2;
const BIG = CELL * 8;
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
async function cell(id: EffectIconId, style: IconStyleId): Promise<[Rgba, Rgba]> {
  if (style === 'hd')
    return [await rasterise(iconSvg(id, 'hd', HUD), HUD), await rasterise(iconSvg(id, 'hd', BIG), BIG)];
  const packed = await renderIcon(id, style);
  return [upscaleNearest(packed, 2), upscaleNearest(packed, 8)];
}

export async function sheet(
  ids: readonly EffectIconId[],
): Promise<{ png: Buffer; cells: Map<string, Rgba> }> {
  registerFont();
  const w = PAD + LABEL_W + STYLES.length * COL_W;
  const h = PAD + 36 + ids.length * (BIG + PAD) + 24;
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
    const note = style === 'hd' ? 'vector, drawn at size' : 'the 24 px cell at 2x, and at 8x';
    g.fillText(note, PAD + LABEL_W + i * COL_W, PAD + 32);
  });
  const cells = new Map<string, Rgba>();
  for (const [row, id] of ids.entries()) {
    const y = PAD + 36 + row * (BIG + PAD);
    g.fillStyle = paletteFile.colors['bone']!;
    g.font = `18px ${FONT}`;
    g.fillText(NAMES[id] ?? id, PAD, y + 24);
    g.fillStyle = paletteFile.colors['fog']!;
    g.font = `13px ${FONT}`;
    g.fillText(`icon_effect_${id}`, PAD, y + 44);
    for (const [col, [style]] of STYLES.entries()) {
      const x = PAD + LABEL_W + col * COL_W;
      const [small, big] = await cell(id, style);
      blit(g, small, x, y);
      blit(g, big, x + HUD + 16, y);
      cells.set(
        `${id}.${style}`,
        style === 'hd' ? await rasterise(iconSvg(id, 'hd', GRID), GRID) : await renderIcon(id, style),
      );
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
  const png = encodePng({ width: w, height: h, data: new Uint8Array(d.data.buffer.slice(0)) });
  return { png, cells };
}

async function main(out: string): Promise<void> {
  mkdirSync(out, { recursive: true });
  const { png, cells } = await sheet(FIRST_SHEET);
  writeFileSync(join(out, 'sheet-01.png'), png);
  for (const [key, img] of cells) {
    const [id, style] = key.split('.') as [EffectIconId, IconStyleId];
    writeFileSync(join(out, `icon_effect_${id}.${style}.png`), encodePng(img));
    if (style === 'hd') writeFileSync(join(out, `icon_effect_${id}.hd.svg`), iconSvg(id, 'hd'));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv[2];
  if (!out) {
    console.error('usage: tsx icons-sheet.ts <out dir>');
    process.exit(2);
  }
  await main(resolve(out));
}
