import type Phaser from 'phaser';
import metrics from '@wdi/content/data/metrics.json';
import { toScreen } from '@wdi/shared/iso';
import type { NodeSnap } from '../net/world';
import { BIAS, depthAt } from './iso';
import { drawScale } from './texels';
import { nodeFrame } from './m5bFrames';

const ATLAS = 'nodes';
interface Drawn {
  obj: Phaser.GameObjects.Sprite | Phaser.GameObjects.Ellipse;
  art: boolean;
  resource: string;
  active: boolean;
}

/**
 * Round 6, Session 6I (docs/round6/m5b-data.md 3): draws the scene's resource nodes from the world feed, one sprite
 * each, ready or spent. A frame the atlas lacks draws a greybox disc, so a scene is playable without art.
 */
export class NodeView {
  private readonly drawn = new Map<string, Drawn>();
  constructor(private readonly scene: Phaser.Scene) {}

  get count(): number {
    return this.drawn.size;
  }

  has(id: string): boolean {
    return this.drawn.has(id);
  }

  update(items: readonly NodeSnap[], _now: number): void {
    const present = new Set<string>();
    for (const n of items) {
      present.add(n.id);
      let d = this.drawn.get(n.id);
      if (!d) {
        d = this.build(n);
        this.drawn.set(n.id, d);
      }
      if (d.active !== n.active) this.pose(d, n.resource, n.active);
    }
    for (const [id, d] of this.drawn) {
      if (present.has(id)) continue;
      d.obj.destroy();
      this.drawn.delete(id);
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
      return { obj: sprite, art: true, resource: n.resource, active: n.active };
    }
    const disc = this.scene.add
      .ellipse(at.x, at.y, 56, 28, n.active ? 0x7a9a5a : 0x4a4f5c, 0.9)
      .setStrokeStyle(2, 0x12141c)
      .setDepth(depth);
    return { obj: disc, art: false, resource: n.resource, active: n.active };
  }

  private pose(d: Drawn, resource: string, active: boolean): void {
    d.active = active;
    if (d.art) (d.obj as Phaser.GameObjects.Sprite).setFrame(nodeFrame(resource, active));
    else (d.obj as Phaser.GameObjects.Ellipse).setFillStyle(active ? 0x7a9a5a : 0x4a4f5c, 0.9);
  }

  destroy(): void {
    for (const d of this.drawn.values()) d.obj.destroy();
    this.drawn.clear();
  }
}
