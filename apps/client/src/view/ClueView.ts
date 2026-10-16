import Phaser from 'phaser';
import palette from '@wdi/content/data/palette.json';
import traits from '@wdi/content/data/traits.json';
import { ClueKind } from '@wdi/shared/constants';
import type { ClueSnap } from '../net/world';

const ATLAS = 'clues';
const HEIGHT_CODE = ['s', 'm', 't'];
const SCARF_ID = traits.axes.scarf.values.map((v) => v.id);
/** Five prints along `dir`, this far apart in world pixels. */
const PRINTS = 5;
const PRINT_STEP = 34;
const teal = Number.parseInt(palette.colors.teal.slice(1), 16);

/** Unit vector of a `DIRECTIONS` index (0 = n, then clockwise) in screen space. */
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

  constructor(private readonly scene: Phaser.Scene) {
    this.ring = scene.add.graphics().setDepth(999_990);
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
    if (!at) return;
    this.ring.lineStyle(6, teal, 0.95);
    this.ring.beginPath();
    this.ring.arc(at.x, at.y, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, progress), false);
    this.ring.strokePath();
  }

  private frame(key: string): boolean {
    return this.scene.textures.exists(ATLAS) && this.scene.textures.get(ATLAS).has(key);
  }

  private build(c: ClueSnap): Drawn {
    const s = this.scene;
    const glow = s.add.circle(0, 0, 44, teal, 0.25);
    const parts: Phaser.GameObjects.GameObject[] = [glow];
    if (c.kind === ClueKind.footprints) {
      const key = `clue_footprint_${HEIGHT_CODE[c.value] ?? 'm'}_mid`;
      const v = dirVector(c.dir);
      for (let i = 0; i < PRINTS; i++) {
        // Alternate left and right of the line so the trail reads as strides.
        const side = (i % 2 === 0 ? 1 : -1) * 7;
        const px = v.x * PRINT_STEP * i - v.y * side;
        const py = v.y * PRINT_STEP * i + v.x * side;
        parts.push(this.mark(key, px, py, (c.dir * Math.PI) / 4));
      }
    } else if (c.kind === ClueKind.thread) {
      parts.push(this.mark(`clue_thread_${SCARF_ID[c.value] ?? 'red'}`, 0, 0, 0));
    } else {
      parts.push(this.mark('', 0, 0, 0));
    }
    const root = s.add.container(c.x, c.y, parts).setDepth(c.y - 2);
    return { root, glow, claimed: false };
  }

  private mark(key: string, x: number, y: number, rotation: number): Phaser.GameObjects.GameObject {
    if (key !== '' && this.frame(key)) return this.scene.add.sprite(x, y, ATLAS, key).setRotation(rotation);
    return this.scene.add.circle(x, y, 7, teal, 0.9).setStrokeStyle(2, 0x12141c);
  }

  destroy(): void {
    for (const d of this.drawn.values()) d.root.destroy();
    this.drawn.clear();
    this.ring.destroy();
  }
}
