import type Phaser from 'phaser';
import palette from '@wdi/content/data/palette.json';
import bakery from '@wdi/content/data/scenes/bakery.json';
import overworld from '@wdi/content/data/scenes/overworld.json';
import { TILE_PX } from '@wdi/shared/constants';
import { WORLD_COPY as C, fill } from '../ui/copy';
import type { PropSnap } from '../net/world';

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
/** The quick-mode bakery's furniture (GDD 3.11); plates are drawn separately, from what the feed lists. */
const BAKERY_LABELS: Record<string, string> = {
  wakeTable: 'Wake table',
  deadLoaf: 'Dead loaf',
  ledger: 'Ledger',
  oven: 'Oven',
  basin: 'Basin',
  taskSource: 'Flour sacks',
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
 * fixed set. The bakery is drawn in quick mode only: its furniture from the content, and a plate only for a
 * seat the server lists, labelled with the owner's name (`update`, GDD 3.11).
 */
export class PropView {
  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  private readonly plates = new Map<
    string,
    { objs: Phaser.GameObjects.GameObject[]; text: Phaser.GameObjects.Text; of: string }
  >();
  private readonly bakeryById = new Map(spotsOf(bakery.props).map((p) => [p.id, p]));

  constructor(
    private readonly scene: Phaser.Scene,
    sceneId: string,
    quick = false,
  ) {
    if (sceneId === 'overworld') {
      for (const p of overworldProps()) {
        const label = SHOWN[p.id];
        if (label !== undefined) this.draw(p, label, false);
      }
    } else if (sceneId === 'bakery' && quick) {
      for (const p of spotsOf(bakery.props)) {
        const label = BAKERY_LABELS[p.kind];
        if (label !== undefined) this.draw(p, label, false);
      }
    }
  }

  /** Quick mode: seat or drop a plate for every listed one, and keep its owner's name current. */
  update(listed: PropSnap[], nameOf: (seatId: string) => string, selfId: string): void {
    const present = new Set<string>();
    for (const l of listed) {
      if (l.kind !== 'plate') continue;
      const spot = this.bakeryById.get(l.id);
      if (!spot) continue;
      present.add(l.id);
      const label = fill(C['quick.plate.of'], { name: nameOf(l.of) });
      const have = this.plates.get(l.id);
      if (have) {
        if (have.of !== l.of || have.text.text !== label) have.text.setText(label);
        have.of = l.of;
        continue;
      }
      const objs = this.draw(spot, label, l.of === selfId);
      const text = objs.find((o): o is Phaser.GameObjects.Text => 'setText' in o);
      if (text) this.plates.set(l.id, { objs, text, of: l.of });
    }
    for (const [id, p] of this.plates) {
      if (present.has(id)) continue;
      for (const o of p.objs) o.destroy();
      this.plates.delete(id);
    }
  }

  private draw(p: PropSpot, label: string, own: boolean): Phaser.GameObjects.GameObject[] {
    const scene = this.scene;
    const tex = scene.textures.exists(ATLAS) ? scene.textures.get(ATLAS) : null;
    const frame = [`prop_${p.kind}`, `prop_${p.id.split('.')[1]}`].find((k) => tex?.has(k));
    const made: Phaser.GameObjects.GameObject[] = [];
    // The wake table is the block the plates stand on: no greybox for it, its art alone (the plates carry the names).
    if (!frame && p.kind === 'wakeTable') return made;
    if (frame) {
      made.push(
        scene.add
          .sprite(p.x, p.y + TILE_PX / 2, ATLAS, frame)
          .setOrigin(0.5, 1)
          .setDepth(p.y + TILE_PX / 2),
      );
      // A plate wears its owner's name even with art; other props are named by their art.
      if (p.kind !== 'plate') {
        this.objects.push(...made);
        return made;
      }
    } else {
      made.push(
        scene.add
          .rectangle(p.x, p.y, TILE_PX * 0.7, TILE_PX * 0.7, colorOf(palette.colors.slate))
          .setStrokeStyle(3, colorOf(own ? palette.colors.mustard : palette.colors.lantern))
          .setDepth(p.y),
      );
    }
    made.push(
      scene.add
        .text(p.x, frame ? p.y - TILE_PX * 0.6 : p.y, label, {
          fontFamily: 'Oswald, sans-serif',
          fontSize: '14px',
          color: own ? palette.colors.mustard : palette.colors.bone,
          align: 'center',
          wordWrap: { width: TILE_PX * 0.9 },
        })
        .setOrigin(0.5)
        .setDepth(p.y + 1),
    );
    if (p.kind === 'plate') return made; // owned by `plates`
    this.objects.push(...made);
    return made;
  }

  destroy(): void {
    for (const o of this.objects) o.destroy();
    this.objects.length = 0;
    for (const p of this.plates.values()) for (const o of p.objs) o.destroy();
    this.plates.clear();
  }
}
