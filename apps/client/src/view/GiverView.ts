import type Phaser from 'phaser';
import metrics from '@wdi/content/data/metrics.json';
import { TILE_PX } from '@wdi/shared/constants';
import { toScreen } from '@wdi/shared/iso';
import { BIAS, depthAt } from './iso';
import { giverAnimKey } from './m5bFrames';

const ATLAS = 'givers';
/** A quest giver of the scene: a static with a position in tiles and a facing (never a seat). */
export interface GiverSpot {
  id: string;
  npc: string;
  x: number;
  y: number;
  facing: string;
}

/**
 * Round 6, Session 6I: draws the scene's quest givers. Givers are scene statics, not wire state, so the view reads
 * them from the content (`scenes/*.json`, loaded lazily like the scene names) when its scene starts; `update` takes
 * the spots directly for a caller that already holds them, and then ignores the content. A giver with no art draws
 * a greybox figure with its npc id.
 */
export class GiverView {
  private readonly drawn = new Map<string, Phaser.GameObjects.GameObject>();
  private gone = false;

  constructor(
    private readonly scene: Phaser.Scene,
    sceneId?: string,
  ) {
    const id = sceneId ?? (scene as unknown as { sceneId?: string }).sceneId;
    if (id) void loadGivers(id).then((spots) => !this.gone && this.update(spots, 0));
  }

  get count(): number {
    return this.drawn.size;
  }

  update(items: readonly GiverSpot[], _now: number): void {
    const present = new Set<string>();
    for (const g of items) {
      present.add(g.id);
      if (!this.drawn.has(g.id)) this.drawn.set(g.id, this.build(g));
    }
    for (const [id, o] of this.drawn) {
      if (present.has(id)) continue;
      o.destroy();
      this.drawn.delete(id);
    }
  }

  private build(g: GiverSpot): Phaser.GameObjects.GameObject {
    const wx = (g.x + 0.5) * TILE_PX;
    const wy = (g.y + 0.5) * TILE_PX;
    const at = toScreen(wx, wy);
    const key = giverAnimKey(g.npc, g.facing);
    const frame = `${key}/000`;
    const depth = depthAt(wx, wy, BIAS.character);
    if (this.scene.textures.exists(ATLAS) && this.scene.textures.get(ATLAS).has(frame)) {
      const sprite = this.scene.add
        .sprite(at.x, at.y, ATLAS, frame)
        .setScale(metrics.iso.artScale)
        .setDepth(depth);
      if (this.scene.anims.exists(key)) sprite.play(key);
      return sprite;
    }
    const body = this.scene.add.rectangle(0, -40, 28, 80, 0xb49a6a).setStrokeStyle(3, 0x12141c);
    const label = this.scene.add
      .text(0, -92, g.npc, { fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#e8e2cf' })
      .setOrigin(0.5, 1);
    return this.scene.add.container(at.x, at.y, [body, label]).setDepth(depth);
  }

  destroy(): void {
    this.gone = true;
    for (const o of this.drawn.values()) o.destroy();
    this.drawn.clear();
  }
}

/** A scene's givers from the content, loaded on first use so the data stays out of the main bundle. */
export function loadGivers(sceneId: string): Promise<GiverSpot[]> {
  return import('@wdi/content').then(({ scenes }) => {
    const s = (scenes as unknown as Record<string, { givers?: GiverSpot[] }>)[sceneId];
    return s?.givers ?? [];
  });
}
