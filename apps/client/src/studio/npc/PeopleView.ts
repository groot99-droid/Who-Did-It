// Round 9 (9W, N4): draws the current scene's quest givers (a diamond and the NPC's name on each tile) and moves the
// selected one to a clicked tile. Everything it draws comes from the model's working scene.
import Phaser from 'phaser';
import palette from '@wdi/content/data/palette.json';
import { TILE_PX } from '@wdi/shared/constants';
import { toScreen, toWorld } from '@wdi/shared/iso';
import { tileDiamond } from '../../view/iso';
import type { PeopleModel } from './PeopleModel';
import { moveGiver } from './people';

const DEPTH = 2_100_000;
const colorOf = (hex: string) => Number.parseInt(hex.slice(1), 16);

export class PeopleView {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly texts: Phaser.GameObjects.Text[] = [];
  private framed: string | null = null;
  private readonly redraw = () => this.draw();
  private readonly down = (p: Phaser.Input.Pointer) => {
    const m = this.model;
    const scene = m.scene;
    if (m.selected === null || scene === null) return;
    const w = toWorld(p.worldX, p.worldY);
    m.editScene(moveGiver(scene, m.selected, Math.floor(w.x / TILE_PX), Math.floor(w.y / TILE_PX)));
  };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly model: PeopleModel,
  ) {
    this.g = scene.add.graphics().setDepth(DEPTH);
    model.bus.addEventListener('change', this.redraw);
    scene.input.on('pointerdown', this.down);
    this.draw();
  }

  draw(): void {
    this.g.clear();
    for (const t of this.texts.splice(0)) t.destroy();
    const pick = this.model.scene?.givers?.find((o) => o.id === this.model.selected);
    if (pick !== undefined && pick.id !== this.framed) {
      const c = toScreen((pick.x + 0.5) * TILE_PX, (pick.y + 0.5) * TILE_PX);
      this.scene.cameras.main.stopFollow().centerOn(c.x, c.y);
    }
    this.framed = pick?.id ?? null;
    for (const g of this.model.scene?.givers ?? []) {
      const on = g.id === this.model.selected;
      const colour = colorOf(on ? palette.colors.mustard : palette.colors.teal);
      this.g.fillStyle(colour, on ? 0.6 : 0.35).lineStyle(2, colour, 1);
      const pts = tileDiamond(g.x, g.y).map((q) => new Phaser.Math.Vector2(q.x, q.y));
      this.g.fillPoints(pts, true).strokePoints(pts, true);
      const p = toScreen((g.x + 0.5) * TILE_PX, (g.y + 0.5) * TILE_PX);
      const name = this.model.quests.npcs[g.npc]?.name ?? g.npc;
      this.texts.push(
        this.scene.add
          .text(p.x, p.y - 14, name, { fontSize: '12px', color: palette.colors.bone })
          .setOrigin(0.5)
          .setDepth(DEPTH + 1),
      );
    }
  }

  destroy(): void {
    this.model.bus.removeEventListener('change', this.redraw);
    this.scene.input.off('pointerdown', this.down);
    for (const t of this.texts.splice(0)) t.destroy();
    this.g.destroy();
  }
}
