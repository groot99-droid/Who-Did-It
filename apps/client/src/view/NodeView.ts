import type Phaser from 'phaser';
import metrics from '@wdi/content/data/metrics.json';
import { toScreen } from '@wdi/shared/iso';
import type { NodeSnap } from '../net/world';
import { BIAS, depthAt } from './iso';
import { drawScale } from './texels';
import { nodeBreakKey, nodeChange, nodeFrame } from './m5bFrames';
import { reducedMotion as prefersReducedMotion } from './vfx/motion';

const ATLAS = 'nodes';
interface Drawn {
  obj: Phaser.GameObjects.Sprite | Phaser.GameObjects.Ellipse;
  art: boolean;
  resource: string;
  active: boolean;
  /** Bumped on every change, so a break that finishes after a newer change does not set a stale frame. */
  seq: number;
}

/**
 * Round 6, Session 6I (docs/round6/m5b-data.md 3): draws the scene's resource nodes from the world feed, one sprite
 * each, ready or spent. A frame the atlas lacks draws a greybox disc, so a scene is playable without art.
 *
 * Round 8 (8G, motion.md 2): when the yield is taken the node plays its `break` once and rests on `spent`; as it
 * regrows the break plays backwards and rests on `ready`. Under reduced motion it cuts straight to the frame. A coins
 * heap, which the server removes when it is picked up, plays its break as it leaves.
 */
export class NodeView {
  private readonly drawn = new Map<string, Drawn>();
  /** Swept-up nodes still playing their break. */
  private readonly leaving = new Set<Phaser.GameObjects.Sprite>();
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly reducedMotion: () => boolean = prefersReducedMotion,
  ) {}

  get count(): number {
    return this.drawn.size;
  }

  has(id: string): boolean {
    return this.drawn.has(id);
  }

  update(items: readonly NodeSnap[], _now: number): void {
    const present = new Set<string>();
    const fresh = new Set<string>();
    for (const n of items) {
      present.add(n.id);
      let d = this.drawn.get(n.id);
      if (!d) {
        fresh.add(n.id);
        d = this.build(n);
        this.drawn.set(n.id, d);
      }
      if (d.active !== n.active) this.pose(d, n.resource, n.active);
    }
    // A pickup takes one heap from a feed that otherwise carries on. A feed whose old nodes are all gone has changed
    // scene behind the portal fade or been reset by a reconnect, and nothing it drops plays a break (6Z, #189).
    let kept = false;
    for (const id of this.drawn.keys()) if (present.has(id) && !fresh.has(id)) kept = true;
    for (const [id, d] of this.drawn) {
      if (present.has(id)) continue;
      this.drawn.delete(id);
      this.sweep(d, kept);
    }
  }

  private frame(key: string): boolean {
    return this.scene.textures.exists(ATLAS) && this.scene.textures.get(ATLAS).has(key);
  }

  private build(n: NodeSnap): Drawn {
    const at = toScreen(n.x, n.y);
    const key = nodeFrame(n.resource, n.active);
    const depth = depthAt(n.x, n.y, BIAS.kit);
    if (this.frame(key)) {
      const sprite = this.scene.add
        .sprite(at.x, at.y, ATLAS, key)
        .setScale(drawScale(ATLAS, metrics.iso.artScale))
        .setDepth(depth);
      return { obj: sprite, art: true, resource: n.resource, active: n.active, seq: 0 };
    }
    const disc = this.scene.add
      .ellipse(at.x, at.y, 56, 28, n.active ? 0x7a9a5a : 0x4a4f5c, 0.9)
      .setStrokeStyle(2, 0x12141c)
      .setDepth(depth);
    return { obj: disc, art: false, resource: n.resource, active: n.active, seq: 0 };
  }

  private pose(d: Drawn, resource: string, active: boolean): void {
    d.active = active;
    const seq = ++d.seq;
    if (!d.art) {
      (d.obj as Phaser.GameObjects.Ellipse).setFillStyle(active ? 0x7a9a5a : 0x4a4f5c, 0.9);
      return;
    }
    const sprite = d.obj as Phaser.GameObjects.Sprite;
    const key = nodeBreakKey(resource);
    const rest = nodeFrame(resource, active);
    const change = nodeChange(active, this.scene.anims.exists(key), this.reducedMotion());
    if (change === 'cut') {
      sprite.stop();
      sprite.setFrame(rest);
      return;
    }
    sprite.once('animationcomplete', () => {
      if (d.seq === seq) sprite.setFrame(rest);
    });
    if (change === 'break') sprite.play(key);
    else sprite.playReverse(key);
  }

  /**
   * A node gone from the feed: the coins heap a pickup took whole (8C, `sim/economy/coins.ts`). It plays its break
   * once where it lay, then goes, but only while the feed carried on (`kept`) and the heap was on the viewer's
   * screen; anything else, or under reduced motion, goes at once. The server keeps its pickup event to itself
   * (8C's `econ.coinsTaken`), so the leave is the only cue.
   */
  private sweep(d: Drawn, kept: boolean): void {
    const key = nodeBreakKey(d.resource);
    const seen = this.scene.cameras.main.worldView.contains(d.obj.x, d.obj.y);
    if (!kept || !seen || !d.art || !d.active || this.reducedMotion() || !this.scene.anims.exists(key)) {
      d.obj.destroy();
      return;
    }
    const sprite = d.obj as Phaser.GameObjects.Sprite;
    this.leaving.add(sprite);
    sprite.once('animationcomplete', () => {
      this.leaving.delete(sprite);
      sprite.destroy();
    });
    sprite.play(key);
  }

  destroy(): void {
    for (const s of this.leaving) s.destroy();
    this.leaving.clear();
    for (const d of this.drawn.values()) d.obj.destroy();
    this.drawn.clear();
  }
}
