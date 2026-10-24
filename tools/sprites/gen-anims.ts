// Per-frame origins and Phaser anim definitions from the rig's manifest.json (docs/SPRITES.md 4, 5).
import { R8_CLIPS, FPS, parseFrameFileName, type Clip, type ClipSpec } from './keys.ts';
import type { MultiAtlas } from './pack.ts';

export interface FeetManifest {
  version: number;
  body: string;
  cell: number;
  fps: number;
  passes: string[];
  frames: Record<string, { feet: [number, number]; cell?: number; clipped?: boolean }>;
}

/** Map an atlas frame name (pass/body/anim/dir/nnn) back to its rendered file stem. */
export function fileStemOf(frameName: string): string {
  const parts = frameName.split('/');
  if (parts.length !== 5) throw new Error(`frame ${frameName} is not <prefix>/<body>/<anim>/<dir>/<nnn>`);
  const [, body, anim, dir, index] = parts as [string, string, string, string, string];
  return `char_${body}_${anim}_${dir}_${index}`;
}

/**
 * Write `pivot` (feet / untrimmed cell size) into every frame. Overlay frames share the body frame's
 * pivot because all passes come from the same render. Phaser sets a frame's custom pivot as origin.
 */
export function applyPivots(atlas: MultiAtlas, manifest: FeetManifest): void {
  for (const t of atlas.textures) {
    for (const f of t.frames) {
      const entry = manifest.frames[fileStemOf(f.filename)];
      if (!entry) throw new Error(`no Feet entry for ${f.filename}`);
      const { w, h } = f.sourceSize;
      f.pivot = { x: round4(entry.feet[0] / w), y: round4(entry.feet[1] / h) };
    }
  }
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

export interface PhaserAnim {
  key: string;
  frames: { key: string; frame: string }[];
  frameRate: number;
  repeat: number;
}

/**
 * One anim per <prefix>/<body>/<anim>/<dir>, frames in order. Loops repeat forever; one-shot clips
 * stop on (and hold) their last frame.
 */
export function buildAnims(textures: { key: string; atlas: MultiAtlas }[]): { anims: PhaserAnim[] } {
  const groups = new Map<string, { texture: string; frames: string[] }>();
  for (const { key, atlas } of textures) {
    for (const t of atlas.textures) {
      for (const f of t.frames) {
        const animKey = f.filename.slice(0, f.filename.lastIndexOf('/'));
        const g = groups.get(animKey) ?? { texture: key, frames: [] };
        g.frames.push(f.filename);
        groups.set(animKey, g);
      }
    }
  }
  const anims: PhaserAnim[] = [];
  for (const animKey of [...groups.keys()].sort()) {
    const g = groups.get(animKey)!;
    g.frames.sort();
    const anim = parseFrameFileName(fileStemOf(g.frames[0]!)).anim;
    const clip = R8_CLIPS[anim as Clip] as ClipSpec | undefined;
    anims.push({
      key: animKey,
      frames: g.frames.map((frame) => ({ key: g.texture, frame })),
      frameRate: FPS,
      repeat: clip && !clip.loop ? 0 : -1,
    });
  }
  return { anims };
}
