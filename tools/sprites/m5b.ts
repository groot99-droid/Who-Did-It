// The M5b art (docs/round6/m5b-data.md 4; SPRITES 12): resource nodes in two states, the six tools as held
// overlays, the lantern and torch glows, in both art styles. Everything is drawn in code on the world ramps
// at display scale (m5b-draw.ts, route R5) and finished like a rig render: snapped and mode-halved for the
// 8-bit style, box-halved and alpha-bled for low poly. The ids are 6E's (content PR #49, step 1).
//
//   tsx tools/sprites/m5b.ts          both styles' atlases and the M5b block of each manifest
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas';
import { encodePng, type Rgba } from './bleed.ts';
import { DIRECTIONS, type Dir } from './keys.ts';
import { drawGlow, drawHeld, drawNode } from './m5b-draw.ts';
import { atlasJson, packFrames, type MultiAtlas, type PackInput } from './pack.ts';
import { artStyles, type ArtStyle } from './palette.ts';
import { finishRender } from './pixel.ts';

/** Resource ids (`resources.json`) in file order; a node's frames are `node_<snake id>/<state>`. */
export const RESOURCE_IDS = ['timber', 'stone', 'tinOre', 'resin', 'herb', 'mushroom'] as const;
export type ResourceId = (typeof RESOURCE_IDS)[number];
/** The craftable tools (`recipes.json`, GDD 3.5), each with a held overlay `held_<itemId>/<dir>`. */
export const TOOL_IDS = ['torch', 'snare', 'spade', 'lockpicks', 'lantern', 'crowbar'] as const;
export type ToolId = (typeof TOOL_IDS)[number];
export const NODE_STATES = ['ready', 'spent'] as const;
export const GLOWS = ['lantern', 'torch'] as const;
export const GLOW_FRAMES = 4;
export const GLOW_FPS = 8;

/** Cells at display scale (packed at half); a node's pivot is the ground point under the tile centre. */
export const NODE_CELL = 128;
export const NODE_GROUND: readonly [number, number] = [64, 96];
/** Held overlays share the characters' cell and feet (keys.ts CELL_PX, FEET_ROW_PX). */
export const HELD_CELL = 128;
export const HELD_FEET: readonly [number, number] = [64, 112];
export const GLOW_CELL = 64;

/**
 * Where the right hand sits in a look's idle frame 000, in packed px from the feet pivot, measured on the
 * round-5 characters (art plan 4.2's base body). The held frame draws its grip there; a client that puts a
 * glow on a held lantern or torch adds the same offset.
 */
export const HAND: Readonly<Record<Dir, readonly [number, number]>> = {
  n: [-11, -18],
  ne: [8, -18],
  e: [7, -20],
  se: [11, -17],
  s: [8, -15],
  sw: [1, -12],
  w: [-8, -12],
  nw: [-16, -14],
};
/** Directions whose held overlay draws under the body (the hand is on the far side). */
export const HELD_BEHIND: readonly Dir[] = ['n', 'ne', 'nw'];

export const snakeOf = (id: string): string => id.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
export const nodeFrame = (id: string, state: (typeof NODE_STATES)[number]): string =>
  `node_${snakeOf(id)}/${state}`;
export const heldFrame = (tool: string, dir: Dir): string => `held_${tool}/${dir}`;
export const glowFrame = (glow: string, n: number): string => `glow_${glow}/${n}`;

/** A frame at packed size with its pivot in packed px. */
export interface M5bFrame {
  name: string;
  img: Rgba;
  pivot: readonly [number, number];
}

function render(size: number, draw: (g: SKRSContext2D) => void): Rgba {
  const c = createCanvas(size, size);
  const g = c.getContext('2d');
  draw(g);
  const d = g.getImageData(0, 0, size, size);
  return { width: size, height: size, data: new Uint8Array(d.data.buffer.slice(0)) };
}

/** Every frame of one atlas for one style, finished at packed size. */
export function m5bFrames(atlas: 'nodes' | 'tools', style: ArtStyle): M5bFrame[] {
  const fin = (img: Rgba) => finishRender(img, style.pixelFinish);
  const half = (p: readonly [number, number]) => [p[0] / 2, p[1] / 2] as const;
  if (atlas === 'nodes')
    return RESOURCE_IDS.flatMap((id) =>
      NODE_STATES.map((state) => ({
        name: nodeFrame(id, state),
        img: fin(render(NODE_CELL, (g) => drawNode(g, id, state, NODE_GROUND))),
        pivot: half(NODE_GROUND),
      })),
    );
  const held = TOOL_IDS.flatMap((tool) =>
    DIRECTIONS.map((dir) => {
      const hand = [HELD_FEET[0] + 2 * HAND[dir][0], HELD_FEET[1] + 2 * HAND[dir][1]] as const;
      return {
        name: heldFrame(tool, dir),
        img: fin(render(HELD_CELL, (g) => drawHeld(g, tool, dir, hand))),
        pivot: half(HELD_FEET),
      };
    }),
  );
  const glows = GLOWS.flatMap((glow) =>
    Array.from({ length: GLOW_FRAMES }, (_, n) => ({
      name: glowFrame(glow, n),
      img: fin(render(GLOW_CELL, (g) => drawGlow(g, glow, n, !style.pixelFinish))),
      pivot: [GLOW_CELL / 4, GLOW_CELL / 4] as const,
    })),
  );
  return [...held, ...glows];
}

/** Page caps (SPRITES 12): both atlases fit one 512² page. */
export const M5B_PAGE = { w: 512, h: 512 } as const;

/** Pack frames onto one page and set each frame's pivot as a fraction of its source size. */
export async function packM5b(
  texture: string,
  frames: Array<{ name: string; png: Buffer; pivot: readonly [number, number] }>,
): Promise<Map<string, Buffer>> {
  const inputs: PackInput[] = frames.map((f) => ({ name: f.name, png: f.png }));
  const { atlas, pages } = await packFrames(texture, inputs, M5B_PAGE);
  if (atlas.textures.length !== 1) throw new Error(`${texture}: ${atlas.textures.length} pages, want 1`);
  setPivots(atlas, new Map(frames.map((f) => [f.name, f.pivot])));
  const out = new Map(pages);
  out.set(`${texture}.json`, Buffer.from(atlasJson(atlas)));
  return out;
}

function setPivots(atlas: MultiAtlas, pivots: Map<string, readonly [number, number]>): void {
  const r4 = (v: number) => Math.round(v * 10000) / 10000;
  for (const t of atlas.textures)
    for (const f of t.frames) {
      const p = pivots.get(f.filename)!;
      f.pivot = { x: r4(p[0] / f.sourceSize.w), y: r4(p[1] / f.sourceSize.h) };
    }
}

/** The glow loops (`anims_tools`): `glow_lantern` and `glow_torch`, `GLOW_FPS`, repeating. */
export function toolAnims(texture = 'tools'): string {
  const anims = GLOWS.map((glow) => ({
    key: `glow_${glow}`,
    frames: Array.from({ length: GLOW_FRAMES }, (_, n) => ({ key: texture, frame: glowFrame(glow, n) })),
    frameRate: GLOW_FPS,
    repeat: -1,
  }));
  return `${JSON.stringify({ anims }, null, 1)}\n`;
}

/** The files of the M5b folder (`m5b/`) for one style. */
export async function m5bFiles(style: ArtStyle): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  for (const atlas of ['nodes', 'tools'] as const) {
    const frames = m5bFrames(atlas, style).map((f) => ({ ...f, png: encodePng(f.img) }));
    for (const [k, v] of await packM5b(atlas, frames)) files.set(k, v);
  }
  files.set('tools.anims.json', Buffer.from(toolAnims()));
  return files;
}

export interface M5bManifestEntry {
  key: string;
  type: 'multiatlas' | 'animation';
  url: string;
  path?: string;
  filter?: 'nearest' | 'linear';
}

/** The M5b block of a manifest; every key loads at boot (SPRITES 12). */
export function m5bManifest(filter: 'nearest' | 'linear'): M5bManifestEntry[] {
  return [
    { key: 'nodes', type: 'multiatlas', url: 'm5b/nodes.json', path: 'm5b/', filter },
    { key: 'tools', type: 'multiatlas', url: 'm5b/tools.json', path: 'm5b/', filter },
    { key: 'anims_tools', type: 'animation', url: 'm5b/tools.anims.json' },
  ];
}
export const M5B_KEYS: readonly string[] = m5bManifest('nearest').map((e) => e.key);

const ASSETS = join(import.meta.dirname, '../../apps/client/public/assets');

/** Replace the M5b block of a style's manifest, appended at the end. */
export function writeM5bManifest(style: ArtStyle): void {
  const file = join(ASSETS, style.root, 'manifest.json');
  if (!existsSync(file)) throw new Error(`${file} is missing`);
  const doc = JSON.parse(readFileSync(file, 'utf8')) as { entries: Array<{ key: string }> };
  doc.entries = [...doc.entries.filter((e) => !M5B_KEYS.includes(e.key)), ...m5bManifest(style.filter)];
  writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const style of artStyles()) {
    const dir = join(ASSETS, style.root, 'm5b');
    for (const [name, bytes] of await m5bFiles(style)) {
      mkdirSync(dirname(join(dir, name)), { recursive: true });
      writeFileSync(join(dir, name), bytes);
    }
    writeM5bManifest(style);
    console.log(`m5b: ${style.id} -> ${dir}`);
  }
}
