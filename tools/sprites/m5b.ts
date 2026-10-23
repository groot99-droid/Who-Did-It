// The M5b art (docs/round6/m5b-data.md 4; SPRITES 12): resource nodes in two states, the six tools as held
// overlays, the lantern and torch glows, and the four mobs in eight directions and the quest givers, in both art styles. Everything is drawn in code on the world ramps
// at display scale (m5b-draw.ts, m5b-mobs.ts, m5b-givers.ts; route R5) and finished like a rig render: snapped and mode-halved for the
// 8-bit style, box-halved and alpha-bled for low poly. The ids are 6E's (content PR #49, steps 1 to 3).
//
//   tsx tools/sprites/m5b.ts          both styles' atlases and the M5b block of each manifest
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas';
import { encodePng, type Rgba } from './bleed.ts';
import { DIRECTIONS, type Dir } from './keys.ts';
import { BREAK_FPS, BREAK_FRAMES, drawGlow, drawHeld, drawNode, drawNodeBreak } from './m5b-draw.ts';
import { GIVER_IDLE, GIVER_IDS, drawGiver } from './m5b-givers.ts';
import { MOB_ANIM, MOB_ANIMS, MOB_IDS, drawMob, type MobAnim } from './m5b-mobs.ts';
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
/** Mobs share the characters' cell and feet too, so the client places them like an avatar. */
export const MOB_CELL = 128;
export const MOB_FEET: readonly [number, number] = [64, 112];
export { MOB_ANIM, MOB_ANIMS, MOB_IDS, GIVER_IDLE, GIVER_IDS };

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
/** A node's break (round 8, 8G): the animation `node_<snake id>/break` and its frames `<key>/<nnn>`. */
export const nodeBreakAnim = (id: string): string => `node_${snakeOf(id)}/break`;
export const nodeBreakFrame = (id: string, n: number): string =>
  `${nodeBreakAnim(id)}/${String(n).padStart(3, '0')}`;
export { BREAK_FPS, BREAK_FRAMES };
export const heldFrame = (tool: string, dir: Dir): string => `held_${tool}/${dir}`;
export const glowFrame = (glow: string, n: number): string => `glow_${glow}/${n}`;
/** A mob's animation key, `mob_<id>/<anim>/<dir>` (the row's `sprite` stem), and its frame `<key>/<nnn>`. */
export const mobAnim = (mob: string, anim: MobAnim, dir: Dir): string => `mob_${mob}/${anim}/${dir}`;
export const mobFrame = (mob: string, anim: MobAnim, dir: Dir, n: number): string =>
  `${mobAnim(mob, anim, dir)}/${String(n).padStart(3, '0')}`;

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

export type M5bAtlas = 'nodes' | 'tools' | 'mobs' | 'givers';
export const M5B_ATLASES: readonly M5bAtlas[] = ['nodes', 'tools', 'mobs', 'givers'];

/** Every frame of one atlas for one style, finished at packed size. */
export function m5bFrames(atlas: M5bAtlas, style: ArtStyle): M5bFrame[] {
  const fin = (img: Rgba) => finishRender(img, style.pixelFinish);
  const half = (p: readonly [number, number]) => [p[0] / 2, p[1] / 2] as const;
  if (atlas === 'givers')
    return giverFrameList().map(([id, dir, n]) => ({
      name: giverFrame(id, dir, n),
      img: fin(render(MOB_CELL, (g) => drawGiver(g, id, dir, n, MOB_FEET))),
      pivot: half(MOB_FEET),
    }));
  if (atlas === 'mobs')
    return mobFrameList().map(([mob, anim, dir, n]) => ({
      name: mobFrame(mob, anim, dir, n),
      img: fin(render(MOB_CELL, (g) => drawMob(g, mob, anim, dir, n, MOB_FEET))),
      pivot: half(MOB_FEET),
    }));
  if (atlas === 'nodes')
    return RESOURCE_IDS.flatMap((id) => [
      ...NODE_STATES.map((state) => ({
        name: nodeFrame(id, state),
        img: fin(render(NODE_CELL, (g) => drawNode(g, id, state, NODE_GROUND))),
        pivot: half(NODE_GROUND),
      })),
      ...Array.from({ length: BREAK_FRAMES }, (_, n) => ({
        name: nodeBreakFrame(id, n),
        img: fin(render(NODE_CELL, (g) => drawNodeBreak(g, id, n, NODE_GROUND))),
        pivot: half(NODE_GROUND),
      })),
    ]);
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

/** Every mob frame as `[mob, anim, dir, n]`, in a fixed order. */
export function mobFrameList(): Array<[(typeof MOB_IDS)[number], MobAnim, Dir, number]> {
  return MOB_IDS.flatMap((mob) =>
    MOB_ANIMS.flatMap((anim) =>
      DIRECTIONS.flatMap((dir) =>
        Array.from(
          { length: MOB_ANIM[anim].frames },
          (_, n) => [mob, anim, dir, n] as [typeof mob, MobAnim, Dir, number],
        ),
      ),
    ),
  );
}

/** A giver's idle key, `giver_<npcId>/idle/<dir>`, and its frame `<key>/<nnn>`. */
export const giverAnim = (npc: string, dir: Dir): string => `giver_${npc}/idle/${dir}`;
export const giverFrame = (npc: string, dir: Dir, n: number): string =>
  `${giverAnim(npc, dir)}/${String(n).padStart(3, '0')}`;

/** Every giver frame as `[npc, dir, n]`, in a fixed order. */
export function giverFrameList(): Array<[(typeof GIVER_IDS)[number], Dir, number]> {
  return GIVER_IDS.flatMap((npc) =>
    DIRECTIONS.flatMap((dir) =>
      Array.from({ length: GIVER_IDLE.frames }, (_, n) => [npc, dir, n] as [typeof npc, Dir, number]),
    ),
  );
}

/** Page caps (SPRITES 12): nodes and tools fit one 512² page each, the givers one 512 x 1024 and the mobs one 1024². */
export const M5B_PAGE = { w: 512, h: 512 } as const;
/** The nodes page with its break frames: held to 512 x 256 so the breaks cost a tenth of a resident page (A142). */
export const NODE_PAGE = { w: 512, h: 256 } as const;
export const MOB_PAGE = { w: 1024, h: 1024 } as const;
export const GIVER_PAGE = { w: 512, h: 1024 } as const;
export const pageOf = (atlas: M5bAtlas) =>
  atlas === 'mobs' ? MOB_PAGE : atlas === 'givers' ? GIVER_PAGE : atlas === 'nodes' ? NODE_PAGE : M5B_PAGE;

/** Pack frames onto one page and set each frame's pivot as a fraction of its source size. */
export async function packM5b(
  texture: string,
  frames: Array<{ name: string; png: Buffer; pivot: readonly [number, number] }>,
  page: { w: number; h: number } = M5B_PAGE,
): Promise<Map<string, Buffer>> {
  const inputs: PackInput[] = frames.map((f) => ({ name: f.name, png: f.png }));
  const { atlas, pages } = await packFrames(texture, inputs, page);
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

/** The node breaks (`anims_nodes`): one per resource, `BREAK_FPS`, once; the client plays it backwards to regrow. */
export function nodeAnims(texture = 'nodes'): string {
  const anims = RESOURCE_IDS.map((id) => ({
    key: nodeBreakAnim(id),
    frames: Array.from({ length: BREAK_FRAMES }, (_, n) => ({ key: texture, frame: nodeBreakFrame(id, n) })),
    frameRate: BREAK_FPS,
    repeat: 0,
  }));
  return `${JSON.stringify({ anims }, null, 1)}\n`;
}

/** The mob animations (`anims_mobs`): one per mob, animation and direction, rates and loops of `MOB_ANIM`. */
export function mobAnims(texture = 'mobs'): string {
  const anims = MOB_IDS.flatMap((mob) =>
    MOB_ANIMS.flatMap((anim) =>
      DIRECTIONS.map((dir) => ({
        key: mobAnim(mob, anim, dir),
        frames: Array.from({ length: MOB_ANIM[anim].frames }, (_, n) => ({
          key: texture,
          frame: mobFrame(mob, anim, dir, n),
        })),
        frameRate: MOB_ANIM[anim].fps,
        repeat: MOB_ANIM[anim].repeat,
      })),
    ),
  );
  return `${JSON.stringify({ anims }, null, 1)}\n`;
}

/** The giver idles (`anims_givers`): one per npc and direction, looping. */
export function giverAnims(texture = 'givers'): string {
  const anims = GIVER_IDS.flatMap((npc) =>
    DIRECTIONS.map((dir) => ({
      key: giverAnim(npc, dir),
      frames: Array.from({ length: GIVER_IDLE.frames }, (_, n) => ({
        key: texture,
        frame: giverFrame(npc, dir, n),
      })),
      frameRate: GIVER_IDLE.fps,
      repeat: GIVER_IDLE.repeat,
    })),
  );
  return `${JSON.stringify({ anims }, null, 1)}\n`;
}

/** The files of the M5b folder (`m5b/`) for one style. */
export async function m5bFiles(style: ArtStyle): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  for (const atlas of M5B_ATLASES) {
    const frames = m5bFrames(atlas, style).map((f) => ({ ...f, png: encodePng(f.img) }));
    for (const [k, v] of await packM5b(atlas, frames, pageOf(atlas))) files.set(k, v);
  }
  files.set('nodes.anims.json', Buffer.from(nodeAnims()));
  files.set('tools.anims.json', Buffer.from(toolAnims()));
  files.set('mobs.anims.json', Buffer.from(mobAnims()));
  files.set('givers.anims.json', Buffer.from(giverAnims()));
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
    { key: 'anims_nodes', type: 'animation', url: 'm5b/nodes.anims.json' },
    { key: 'tools', type: 'multiatlas', url: 'm5b/tools.json', path: 'm5b/', filter },
    { key: 'anims_tools', type: 'animation', url: 'm5b/tools.anims.json' },
    { key: 'mobs', type: 'multiatlas', url: 'm5b/mobs.json', path: 'm5b/', filter },
    { key: 'anims_mobs', type: 'animation', url: 'm5b/mobs.anims.json' },
    { key: 'givers', type: 'multiatlas', url: 'm5b/givers.json', path: 'm5b/', filter },
    { key: 'anims_givers', type: 'animation', url: 'm5b/givers.anims.json' },
  ];
}
export const M5B_KEYS: readonly string[] = m5bManifest('nearest').map((e) => e.key);

const ASSETS = join(import.meta.dirname, '../../apps/client/public/assets');

/**
 * The styles the M5b build draws for: those whose manifest ships (the 8-bit root always does). A style joins once
 * its manifest exists; until then its M5b keys fall back to the 8-bit entries (A80), as HD's do before its renders.
 */
export const m5bStyles = (): ArtStyle[] =>
  artStyles().filter((s) => existsSync(join(ASSETS, s.root, 'manifest.json')));

/** Replace the M5b block of a style's manifest, appended at the end. */
export function writeM5bManifest(style: ArtStyle): void {
  const file = join(ASSETS, style.root, 'manifest.json');
  if (!existsSync(file)) throw new Error(`${file} is missing`);
  const doc = JSON.parse(readFileSync(file, 'utf8')) as { entries: Array<{ key: string }> };
  doc.entries = [...doc.entries.filter((e) => !M5B_KEYS.includes(e.key)), ...m5bManifest(style.filter)];
  writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const style of m5bStyles()) {
    const dir = join(ASSETS, style.root, 'm5b');
    for (const [name, bytes] of await m5bFiles(style)) {
      mkdirSync(dirname(join(dir, name)), { recursive: true });
      writeFileSync(join(dir, name), bytes);
    }
    writeM5bManifest(style);
    console.log(`m5b: ${style.id} -> ${dir}`);
  }
}
