import Phaser from 'phaser';
import { toScreen } from '@wdi/shared/iso';
import palette from '@wdi/content/data/palette.json';
import traits from '@wdi/content/data/traits.json';
import { ClueKind } from '@wdi/shared/constants';
import type { ClueSnap } from '../net/world';
import { DEPTH, decalHolder } from './iso';

const ATLAS = 'clues';
const HEIGHT_CODE = ['s', 'm', 't'];
const SCARF_ID = traits.axes.scarf.values.map((v) => v.id);
/** Five prints along `dir`, this far apart in world pixels. */
const PRINTS = 5;
const PRINT_STEP = 34;
const teal = Number.parseInt(palette.colors.teal.slice(1), 16);

/** World unit vector of a `DIRECTIONS` index (0 = n = -y, then clockwise; SPRITES 10.4). */
export function dirVector(dir: number): { x: number; y: number } {
  const a = (dir * Math.PI) / 4;
  return { x: Math.sin(a), y: -Math.cos(a) };
}

interface Drawn {
  root: Phaser.GameObjects.Container;
  glow: Phaser.GameObjects.Arc;
  claimed: boolean;
}

/**
 * Clues of the scene: Footprints are `clue_footprint_<s|m|t>_mid` five times along `dir` from the tile,
 * a Thread is `clue_thread_<red|green|blue>` (keys from docs/SPRITES.md 8). A key the atlas lacks draws a
 * greybox mark. `x`/`y` are pixel centres, used unscaled. An unclaimed clue glows teal (GDD 2 step 5).
 */
export class ClueView {
  private readonly drawn = new Map<string, Drawn>();
  private readonly ring: Phaser.GameObjects.Graphics;
  private readonly ringRoot: Phaser.GameObjects.Container;

  constructor(private readonly scene: Phaser.Scene) {
    // The collect ring lies on the ground like a decal, above the darkness (SPRITES 10.6).
    const { root, inner } = decalHolder(scene, 0, 0);
    this.ring = scene.add.graphics();
    inner.add(this.ring);
    this.ringRoot = root.setDepth(DEPTH.marks).setVisible(false);
  }

  has(id: string): boolean {
    return this.drawn.has(id);
  }

  get count(): number {
    return this.drawn.size;
  }

  update(clues: ClueSnap[], now: number): void {
    const present = new Set<string>();
    for (const c of clues) {
      present.add(c.id);
      let d = this.drawn.get(c.id);
      if (!d) {
        d = this.build(c);
        this.drawn.set(c.id, d);
      }
      if (d.claimed !== c.claimed) {
        d.claimed = c.claimed;
        d.root.setAlpha(c.claimed ? 0.55 : 1);
      }
      d.glow.setVisible(!c.claimed).setAlpha(0.2 + 0.15 * Math.sin(now / 260));
    }
    for (const [id, d] of this.drawn) {
      if (present.has(id)) continue;
      d.root.destroy();
      this.drawn.delete(id);
    }
  }

  /** The collect ring around a clue: `progress` 0..1 of the hold, or null to clear it. */
  setHold(at: { x: number; y: number } | null, progress = 0): void {
    this.ring.clear();
    this.ringRoot.setVisible(at !== null);
    if (!at) return;
    const s = toScreen(at.x, at.y);
    this.ringRoot.setPosition(s.x, s.y);
    this.ring.lineStyle(6, teal, 0.95);
    this.ring.beginPath();
    this.ring.arc(0, 0, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, progress), false);
    this.ring.strokePath();
  }

  private frame(key: string): boolean {
    return this.scene.textures.exists(ATLAS) && this.scene.textures.get(ATLAS).has(key);
  }

  private build(c: ClueSnap): Drawn {
    const s = this.scene;
    // The clue lies on the ground: children sit at world offsets inside the decal holder (SPRITES 10.5).
    const { root, inner } = decalHolder(s, c.x, c.y);
    const glow = s.add.circle(0, 0, 44, teal, 0.25);
    inner.add(glow);
    if (c.kind === ClueKind.footprints) {
      const key = `clue_footprint_${HEIGHT_CODE[c.value] ?? 'm'}_mid`;
      const v = dirVector(c.dir);
      const theta = (c.dir * Math.PI) / 4;
      for (let i = 0; i < PRINTS; i++) {
        // Alternate left and right of the line so the trail reads as strides.
        const side = (i % 2 === 0 ? 1 : -1) * 7;
        const px = v.x * PRINT_STEP * i - v.y * side;
        const py = v.y * PRINT_STEP * i + v.x * side;
        inner.add(this.mark(key, px, py, theta));
      }
    } else if (c.kind === ClueKind.thread) {
      inner.add(this.mark(`clue_thread_${SCARF_ID[c.value] ?? 'red'}`, 0, 0, 0));
    } else {
      inner.add(this.mark('', 0, 0, 0));
    }
    root.setDepth(DEPTH.decal);
    return { root, glow, claimed: false };
  }

  private mark(key: string, x: number, y: number, rotation: number): Phaser.GameObjects.GameObject {
    if (key !== '' && this.frame(key)) return this.scene.add.sprite(x, y, ATLAS, key).setRotation(rotation);
    return this.scene.add.circle(x, y, 7, teal, 0.9).setStrokeStyle(2, 0x12141c);
  }

  destroy(): void {
    for (const d of this.drawn.values()) d.root.destroy();
    this.drawn.clear();
    this.ringRoot.destroy();
  }
}
