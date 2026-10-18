// Placeholder stand-ins owned by Session 5M (art plan 1.2 item 6): today the dark-loft images, which M1
// removes with the loft. placeholder.ts collects `placeholderEntries()`; 5M adds its keys' stand-ins here.
import { createCanvas } from '@napi-rs/canvas';
import { IMAGE_SIZES } from './images.ts';
import { LOFT_KEYS } from './keys.ts';
import { PALETTE, shape, type PlaceholderEntry } from './placeholder-kit.ts';

/** The dark-loft images as flat marks at the real sizes: the loft's floor and window, and bedrolls. */
export function loftImages(): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  for (const key of LOFT_KEYS) {
    const [w, h] = IMAGE_SIZES[key]!;
    const c = createCanvas(w, h);
    const g = c.getContext('2d');
    if (key === 'loft_backdrop') {
      g.fillStyle = PALETTE.ink;
      g.fillRect(0, 0, w, h);
      g.fillStyle = PALETTE.slate;
      g.fillRect(0, h * 0.3, w, h * 0.7);
      for (let y = h * 0.3; y < h; y += 24) {
        g.fillStyle = PALETTE.ink;
        g.fillRect(0, y, w, 2);
      }
      shape(g, 'moon', () => g.ellipse(w * 0.58, h * 0.17, 60, 46, 0, 0, 2 * Math.PI));
      shape(g, 'lantern', () => g.rect(w * 0.15, h * 0.72, 80, 64));
    } else {
      shape(g, 'slate', () => g.roundRect(6, 6, w - 12, h - 12, 18));
      shape(g, 'bone', () => g.arc(w / 2, 34, 18, 0, 2 * Math.PI));
      shape(g, 'fog', () => g.roundRect(14, 64, w - 28, h - 80, 12));
      if (key === 'prop_bedroll_self') {
        g.fillStyle = PALETTE.moon;
        g.fillRect(14, 80, w - 28, 8);
      }
    }
    out.set(`${key}.png`, c.toBuffer('image/png'));
  }
  return out;
}

// ---------------------------------------------------------------- manifest

export function placeholderEntries(): PlaceholderEntry[] {
  return [
    {
      order: 50,
      entries: LOFT_KEYS.map((key) => ({
        key,
        type: 'image' as const,
        url: `loft/${key}.png`,
        filter: 'linear' as const,
      })),
      files: () => new Map([...loftImages()].map(([name, bytes]) => [`loft/${name}`, bytes])),
    },
  ];
}
