// Placeholder stand-ins owned by Session 5M (art plan 1.2 item 6): a labelled greybox for every ONUB key of
// contract 5.4 at its shipped size, and the `onub_mini` atlas with a labelled greybox per frame. The loft
// images left with M1 (ruling C12). placeholder.ts collects `placeholderEntries()`.
import { encodePng } from './bleed.ts';
import { ART, SCALE, greybox, onubImages, onubManifest, upscaleNearest } from './onub.ts';
import { MINI_FRAMES, packMini } from './onub-mini.ts';
import type { PlaceholderEntry } from './placeholder-kit.ts';

/** Every ONUB image as a labelled greybox PNG at its file size, keyed by its path under the folder. */
export function onubImagesPng(): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  for (const i of onubImages()) {
    const [w, h] = ART[i.kind];
    out.set(
      `onub/${i.path}.png`,
      encodePng(upscaleNearest(greybox(w, h, i.key.replace(/^onub_/, '')), SCALE)),
    );
  }
  const frames = new Map(MINI_FRAMES.map((f) => [f.name, greybox(f.w, f.h, '')]));
  const { page, json } = packMini(frames);
  out.set('onub/onub_mini-0.png', encodePng(page));
  out.set('onub/onub_mini.json', Buffer.from(`${JSON.stringify(json, null, 1)}\n`));
  return out;
}

// ---------------------------------------------------------------- manifest

export function placeholderEntries(): PlaceholderEntry[] {
  return [{ order: 90, entries: onubManifest('png'), files: () => onubImagesPng() }];
}
