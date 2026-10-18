// The reference crops (docs/ASSETS.md 6.4): every style.json `references` entry, cut from the owner's
// image before upload as a Higgsfield `image_references` input. Writes build/refs/<composition>-<n>-<stem>.png.
import { readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { encodePng, type Rgba } from './bleed.ts';
import { styleFile } from './palette.ts';
import { crop } from './pixel.ts';
import { writeFiles } from './pack.ts';

/** The repository root, which `references[].file` paths are relative to. */
export const REPO = join(import.meta.dirname, '../..');

export type Box = readonly [number, number, number, number];

export interface RefEntry {
  composition: string;
  index: number;
  file: string;
  crop?: Box;
  /** Output name: <composition>-<index>-<file stem>.png */
  out: string;
}

/** Every `references` entry of style.json, in file order. */
export function referenceList(): RefEntry[] {
  return Object.entries(styleFile.references).flatMap(([composition, refs]) =>
    refs.map((r, index) => ({
      composition,
      index,
      file: r.file,
      ...(r.crop ? { crop: r.crop } : {}),
      out: `${composition}-${index}-${basename(r.file).replace(/\.(jpg|png)$/, '')}.png`,
    })),
  );
}

/** Decode a JPEG or PNG from the repository into straight RGBA (the owner images are opaque JPEGs). */
export async function loadRgba(file: string): Promise<Rgba> {
  const image = await loadImage(readFileSync(join(REPO, file)));
  const canvas = createCanvas(image.width, image.height);
  const g = canvas.getContext('2d');
  g.drawImage(image, 0, 0);
  const { data } = g.getImageData(0, 0, image.width, image.height);
  return { width: image.width, height: image.height, data: new Uint8Array(data) };
}

/** Whether a crop box lies inside a w x h image. */
export function boxInside(box: Box, w: number, h: number): boolean {
  const [x, y, bw, bh] = box;
  return (
    Number.isInteger(x + y + bw + bh) && x >= 0 && y >= 0 && bw > 0 && bh > 0 && x + bw <= w && y + bh <= h
  );
}

/** Every reference, cropped, as PNG bytes keyed by output name. Uncropped entries are written whole. */
export async function buildRefs(): Promise<Map<string, Buffer>> {
  const out = new Map<string, Buffer>();
  for (const ref of referenceList()) {
    const img = await loadRgba(ref.file);
    if (ref.crop && !boxInside(ref.crop, img.width, img.height)) {
      throw new Error(`refs: ${ref.out} crop [${ref.crop.join(', ')}] is outside ${img.width}x${img.height}`);
    }
    out.set(ref.out, encodePng(ref.crop ? crop(img, ref.crop, 1, 1) : img));
  }
  return out;
}

// CLI: tsx tools/sprites/refs.ts [out dir, default build/refs]
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outDir = process.argv[2] ?? 'build/refs';
  const files = await buildRefs();
  writeFiles(outDir, files);
  console.log(`refs: ${files.size} images -> ${outDir}`);
}
