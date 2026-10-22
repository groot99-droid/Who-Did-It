import type Phaser from 'phaser';
import metrics from '@wdi/content/data/metrics.json';
import { toScreen } from '@wdi/shared/iso';
import type { MobSnap } from '../net/world';
import { BIAS, depthAt } from './iso';
import { mobAnimKey } from './m5bFrames';

const ATLAS = 'mobs';
interface Drawn {
  obj: Phaser.GameObjects.Sprite | Phaser.GameObjects.Ellipse;
  art: boolean;
  key: string;
}

/**
 * Round 6, Session 6I: draws the scene's creatures from the world feed. A mob has no seat and no handle; the sprite is
 * `mob_<kind>` and its animation follows `animId` and `yaw`. The server sends a position per patch, so the view eases
 * toward it instead of snapping. A kind the atlas lacks draws a greybox disc.
 */
export class MobView {
  private readonly drawn = new Map<string, Drawn>();

  constructor(private readonly scene: Phaser.Scene) {}

  get count(): number {
    return this.drawn.size;
  }

  update(items: readonly MobSnap[], _now: number): void {
    const present = new Set<string>();
    for (const m of items) {
      present.add(m.id);
      let d = this.drawn.get(m.id);
      const at = toScreen(m.x, m.y);
      if (!d) {
        d = this.build(m, at);
        this.drawn.set(m.id, d);
      }
      // Ease toward the patch (a third of the gap a frame), but jump across a long gap such as a respawn.
      const far = Math.hypot(d.obj.x - at.x, d.obj.y - at.y) > 256;
      d.obj.setPosition(
        far ? at.x : d.obj.x + (at.x - d.obj.x) / 3,
        far ? at.y : d.obj.y + (at.y - d.obj.y) / 3,
      );
      d.obj.setDepth(depthAt(m.x, m.y, BIAS.character));
      if (d.art) {
        const key = mobAnimKey(m.kind, m.animId, m.yaw);
        if (key !== d.key && this.scene.anims.exists(key)) {
          d.key = key;
          (d.obj as Phaser.GameObjects.Sprite).play(key);
        }
      }
    }
    for (const [id, d] of this.drawn) {
      if (present.has(id)) continue;
      d.obj.destroy();
      this.drawn.delete(id);
    }
  }

  private build(m: MobSnap, at: { x: number; y: number }): Drawn {
    const key = mobAnimKey(m.kind, m.animId, m.yaw);
    const frame = `${key}/000`;
    const art = this.scene.textures.exists(ATLAS) && this.scene.textures.get(ATLAS).has(frame);
    if (art) {
      const sprite = this.scene.add.sprite(at.x, at.y, ATLAS, frame).setScale(metrics.iso.artScale);
      if (this.scene.anims.exists(key)) sprite.play(key);
      return { obj: sprite, art: true, key };
    }
    const disc = this.scene.add.ellipse(at.x, at.y - 10, 30, 22, 0x8a5a3a, 0.95).setStrokeStyle(2, 0x12141c);
    return { obj: disc, art: false, key: '' };
  }

  destroy(): void {
    for (const d of this.drawn.values()) d.obj.destroy();
    this.drawn.clear();
  }
}
