import type Phaser from 'phaser';
import palette from '@wdi/content/data/palette.json';
import overworld from '@wdi/content/data/scenes/overworld.json';
import { TILE_PX } from '@wdi/shared/constants';
import { toScreen } from '@wdi/shared/iso';
import { BIAS, depthAt } from './iso';

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

const spotsOf = (props: Array<{ id: string; kind: string; x: number; y: number }>): PropSpot[] =>
  props.map((p) => ({ id: p.id, kind: p.kind, x: (p.x + 0.5) * TILE_PX, y: (p.y + 0.5) * TILE_PX }));

/** The overworld's props with their pixel centres (the bell's reach is measured from here). */
export function overworldProps(): PropSpot[] {
  return spotsOf(overworld.props);
}

const colorOf = (hex: string) => Number.parseInt(hex.slice(1), 16);

/**
 * Draws a scene's props by key `prop_<kind>` then `prop_<id tail>` from the `props` atlas; a labelled greybox
 * block stands in for any frame the manifest lacks (P ships the art, N ships the verbs). The square draws its
 * fixed set; no other scene draws props.
 */
export class PropView {
  private readonly objects: Phaser.GameObjects.GameObject[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    sceneId: string,
  ) {
    if (sceneId === 'overworld') {
      for (const p of overworldProps()) {
        const label = SHOWN[p.id];
        if (label !== undefined) this.draw(p, label);
      }
    }
  }

  private draw(p: PropSpot, label: string): void {
    const scene = this.scene;
    // The ground point under the tile centre; frame pivots arrive with the art (SPRITES 10.5).
    const at = toScreen(p.x, p.y);
    const tex = scene.textures.exists(ATLAS) ? scene.textures.get(ATLAS) : null;
    const frame = [`prop_${p.kind}`, `prop_${p.id.split('.')[1]}`].find((k) => tex?.has(k));
    if (frame) {
      // A prop with art is named by its art.
      this.objects.push(
        scene.add
          .sprite(at.x, at.y, ATLAS, frame)
          .setOrigin(0.5, 1)
          .setDepth(depthAt(p.x, p.y, BIAS.kit)),
      );
      return;
    }
    this.objects.push(
      scene.add
        .rectangle(at.x, at.y - TILE_PX / 2, TILE_PX * 0.7, TILE_PX * 0.7, colorOf(palette.colors.slate))
        .setStrokeStyle(3, colorOf(palette.colors.lantern))
        .setDepth(depthAt(p.x, p.y, BIAS.kit)),
      scene.add
        .text(at.x, at.y - TILE_PX / 2, label, {
          fontFamily: 'Oswald, sans-serif',
          fontSize: '14px',
          color: palette.colors.bone,
          align: 'center',
          wordWrap: { width: TILE_PX * 0.9 },
        })
        .setOrigin(0.5)
        .setDepth(depthAt(p.x, p.y, BIAS.kit) + 0.01),
    );
  }

  destroy(): void {
    for (const o of this.objects) o.destroy();
    this.objects.length = 0;
  }
}
