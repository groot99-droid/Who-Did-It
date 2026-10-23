// The drawing kit and the module contract of the placeholder art (placeholder.ts). Part of the core:
// the placeholder modules (placeholder-world.ts, placeholder-chars.ts, placeholder-m5b.ts) import it, and no art session edits it (art plan 1.2 item 6).
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { GlobalFonts, type SKRSContext2D } from '@napi-rs/canvas';

// docs/ASSETS.md 6.1. TODO: read packages/content/data/palette.json once @wdi/content merges.
export const PALETTE = {
  ink: '#12141C',
  slate: '#2C3240',
  fog: '#6F7A8C',
  bone: '#D9D2C2',
  mustard: '#F2B33D',
  teal: '#2EC4B6',
  magenta: '#E04E9A',
  blood: '#B3121F',
  lantern: '#FFB457',
  moon: '#7FA8FF',
} as const;
export type Token = keyof typeof PALETTE;

export const FONT = 'WdiInter';
let fontReady = false;
export function registerFont(): void {
  if (fontReady) return;
  const require = createRequire(import.meta.url);
  const dir = dirname(require.resolve('@fontsource/inter/package.json'));
  GlobalFonts.registerFromPath(join(dir, 'files', 'inter-latin-600-normal.woff2'), FONT);
  fontReady = true;
}

/** Deterministic PRNG (mulberry32), same as @wdi/shared. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedOf(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

export function shape(g: SKRSContext2D, fill: Token, draw: () => void, stroke = true): void {
  g.beginPath();
  draw();
  g.fillStyle = PALETTE[fill];
  g.fill();
  if (stroke) {
    g.lineWidth = 2;
    g.lineJoin = g.lineCap = 'round';
    g.strokeStyle = PALETTE.ink;
    g.stroke();
  }
}

export function label(g: SKRSContext2D, text: string, x: number, y: number, size = 9): void {
  g.font = `${size}px ${FONT}`;
  const w = Math.ceil(g.measureText(text).width) + 4;
  g.fillStyle = PALETTE.bone;
  g.fillRect(Math.round(x - w / 2), y - size, w, size + 3);
  g.fillStyle = PALETTE.ink;
  g.textAlign = 'center';
  g.fillText(text, x, y);
}

/** One row of the placeholder `manifest.json` (docs/SPRITES.md 5). */
export interface ManifestEntry {
  key: string;
  type: 'multiatlas' | 'image' | 'animation';
  url: string;
  path?: string;
  filter?: 'linear' | 'nearest';
  origin?: [number, number];
  /** Map ids: the entry loads with the match's map, not at boot (SPRITES 5, 10.13). */
  maps?: string[];
  /** Modes: the entry loads at match start when the match's mode is listed (SPRITES 5, 10.13). */
  modes?: 'main'[];
}

/**
 * One stand-in of a placeholder module: the manifest rows it adds and the files they point at. A session
 * adds its keys' greybox stand-ins (same cell, pivot and size as the real art) to its own module and
 * removes its retired keys there.
 */
export interface PlaceholderEntry {
  /**
   * Position in `manifest.json`: stand-ins are sorted by it, ties keeping module order (world, chars).
   * Today's blocks: 10 villager, 20 clues, 30 props, 40 vfx, 60 buildings, 70 tiles.
   * A new block takes a number of its own.
   */
  order: number;
  /** The manifest rows, in order (an atlas and its animation JSON go together). */
  entries: ManifestEntry[];
  /** The files, keyed by their path under the placeholder folder (`chars/char_villager.json`). */
  files(): Map<string, Buffer> | Promise<Map<string, Buffer>>;
}

/** Prefix every file name of a packer's output with its folder (`props/`). */
export function inFolder(folder: string, files: Map<string, Buffer>): Map<string, Buffer> {
  return new Map([...files].map(([name, bytes]) => [`${folder}${name}`, bytes]));
}
