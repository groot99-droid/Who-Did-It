import type Phaser from 'phaser';
import metrics from '@wdi/content/data/metrics.json';
import { toScreen } from '@wdi/shared/iso';
import type { MobSnap } from '../net/world';
import { BIAS, depthAt } from './iso';
import { mobAnimKey, mobClip } from './m5bFrames';
import { reducedMotion as prefersReducedMotion } from './vfx/motion';

const ATLAS = 'mobs';
interface Drawn {
  obj: Phaser.GameObjects.Sprite | Phaser.GameObjects.Ellipse;
  art: boolean;
  key: string;
  dead: boolean;
}

/** How long a hit's white flash and a removed corpse's fade last, in ms (motion.md 2; a cut under reduced motion). */
const FLASH_MS = 90;
const FADE_MS = 400;
/** `Phaser.TintModes.MULTIPLY` and `FILL` (the view imports Phaser's types only, so its enum is not at hand). */
const TINT_MULTIPLY = 0;
const TINT_FILL = 1;

/**
 * Round 6, Session 6I: draws the scene's creatures from the world feed. A mob has no seat and no handle; the sprite is
 * `mob_<kind>` and its animation follows `animId` and `yaw`. The server sends a position per patch, so the view eases
 * toward it instead of snapping. A kind the atlas lacks draws a greybox disc.
 *
 * Round 8 (8G, motion.md 2): the clip also reads `state`, so a creature fleeing a light runs with the `flee` gait and
 * a killed one plays `death` once and lies there; a hit flashes it white for one beat, and a corpse leaving the feed
 * fades instead of vanishing.
 */
export class MobView {
  private readonly drawn = new Map<string, Drawn>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly reducedMotion: () => boolean = prefersReducedMotion,
  ) {}

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
      const clip = mobClip(m.animId, m.state);
      // A corpse keeps the fall it started: a later yaw must not replay it from the first frame.
      if (d.art && !d.dead) {
        const key = mobAnimKey(m.kind, m.animId, m.yaw, m.state);
        if (key !== d.key && this.scene.anims.exists(key)) {
          if (clip === 'hurt' && !d.key.includes('/hurt/')) this.flash(d.obj as Phaser.GameObjects.Sprite);
          d.key = key;
          (d.obj as Phaser.GameObjects.Sprite).play(key);
        }
      }
      d.dead = clip === 'death';
    }
    for (const [id, d] of this.drawn) {
      if (present.has(id)) continue;
      this.drawn.delete(id);
      if (d.dead && !this.reducedMotion())
        this.scene.tweens.add({
          targets: d.obj,
          alpha: 0,
          duration: FADE_MS,
          onComplete: () => d.obj.destroy(),
        });
      else d.obj.destroy();
    }
  }

  /** The hit flash: one white beat over the flinch, or nothing under reduced motion (the flinch still plays). */
  private flash(sprite: Phaser.GameObjects.Sprite): void {
    if (this.reducedMotion()) return;
    sprite.setTint(0xffffff).setTintMode(TINT_FILL);
    this.scene.time.delayedCall(FLASH_MS, () => sprite.clearTint().setTintMode(TINT_MULTIPLY));
  }

  private build(m: MobSnap, at: { x: number; y: number }): Drawn {
    const key = mobAnimKey(m.kind, m.animId, m.yaw, m.state);
    const dead = mobClip(m.animId, m.state) === 'death';
    const frame = `${key}/000`;
    const art = this.scene.textures.exists(ATLAS) && this.scene.textures.get(ATLAS).has(frame);
    if (art) {
      const sprite = this.scene.add.sprite(at.x, at.y, ATLAS, frame).setScale(metrics.iso.artScale);
      // A creature first seen dead (a client joining the scene) lies on its last frame rather than falling again.
      if (this.scene.anims.exists(key)) {
        sprite.play(key);
        if (dead) sprite.anims.setProgress(1);
      }
      return { obj: sprite, art: true, key, dead };
    }
    const disc = this.scene.add.ellipse(at.x, at.y - 10, 30, 22, 0x8a5a3a, 0.95).setStrokeStyle(2, 0x12141c);
    return { obj: disc, art: false, key: '', dead };
  }

  destroy(): void {
    for (const d of this.drawn.values()) d.obj.destroy();
    this.drawn.clear();
  }
}
