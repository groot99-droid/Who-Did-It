import type Phaser from 'phaser';
import palette from '@wdi/content/data/palette.json';
import overworld from '@wdi/content/data/scenes/overworld.json';
import { TILE_PX } from '@wdi/shared/constants';

const ATLAS = 'props';
/** The props that stand in the village square; the rest of overworld.json's props are decor art (P). */
const SHOWN: Record<string, string> = {
  'ov.bell': 'Bell',
  'ov.pump': 'Pump',
  'ov.board': 'Board',
  'ov.chest': 'Chest',
  'ov.lantern_0': 'Lamp',
  'ov.lantern_1': 'Lamp',
  'ov.lantern_2': 'Lamp',
  'ov.lantern_3': 'Lamp',
};

export interface PropSpot {
  id: string;
  kind: string;
  /** Pixel centre of the prop's tile. */
  x: number;
  y: number;
}

/** The overworld's props with their pixel centres (the bell's reach is measured from here). */
export function overworldProps(): PropSpot[] {
  return overworld.props.map((p) => ({
    id: p.id,
    kind: p.kind,
    x: (p.x + 0.5) * TILE_PX,
    y: (p.y + 0.5) * TILE_PX,
  }));
}

/**
 * Draws the square's props by key `prop_<kind>` from the `props` atlas; a labelled greybox block stands in
 * for any frame the manifest lacks (P ships the art, N ships the verbs).
 */
export class PropView {
  private readonly objects: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene, sceneId: string) {
    if (sceneId !== 'overworld') return;
    const tex = scene.textures.exists(ATLAS) ? scene.textures.get(ATLAS) : null;
    for (const p of overworldProps()) {
      const label = SHOWN[p.id];
      if (label === undefined) continue;
      const frame = [`prop_${p.kind}`, `prop_${p.id.split('.')[1]}`].find((k) => tex?.has(k));
      if (frame) {
        this.objects.push(
          scene.add
            .sprite(p.x, p.y + TILE_PX / 2, ATLAS, frame)
            .setOrigin(0.5, 1)
            .setDepth(p.y + TILE_PX / 2),
        );
        continue;
      }
      const block = scene.add
        .rectangle(p.x, p.y, TILE_PX * 0.7, TILE_PX * 0.7, Number.parseInt(palette.colors.slate.slice(1), 16))
        .setStrokeStyle(3, Number.parseInt(palette.colors.lantern.slice(1), 16))
        .setDepth(p.y);
      const text = scene.add
        .text(p.x, p.y, label, {
          fontFamily: 'Oswald, sans-serif',
          fontSize: '14px',
          color: palette.colors.bone,
        })
        .setOrigin(0.5)
        .setDepth(p.y + 1);
      this.objects.push(block, text);
    }
  }

  destroy(): void {
    for (const o of this.objects) o.destroy();
    this.objects.length = 0;
  }
}
