// Round 9 (9W, N3): draws the selected townsfolk kind's stations over the current scene: a numbered marker per stop in
// route order, a line between them, and the kinds the phase does not use dimmed. Everything comes from the model.
import Phaser from 'phaser';
import palette from '@wdi/content/data/palette.json';
import { scenes } from '@wdi/content';
import { TILE_PX } from '@wdi/shared/constants';
import { toScreen } from '@wdi/shared/iso';
import { tileDiamond } from '../../view/iso';
import type { NpcModel } from './NpcModel';
import { phaseClassOf, routeOf } from './routes';

const DEPTH = 2_100_000;
const colorOf = (hex: string) => Number.parseInt(hex.slice(1), 16);

export class NpcView {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly texts: Phaser.GameObjects.Text[] = [];
  private framed = '';
  private readonly redraw = () => this.draw();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly model: NpcModel,
    private readonly sceneId: () => string | null,
  ) {
    this.g = scene.add.graphics().setDepth(DEPTH);
    model.bus.addEventListener('change', this.redraw);
    this.draw();
  }

  draw(): void {
    this.g.clear();
    for (const t of this.texts.splice(0)) t.destroy();
    const id = this.sceneId();
    const world =
      id === null ? undefined : (scenes as Record<string, (typeof scenes)[keyof typeof scenes]>)[id];
    const row = this.model.routines.townsfolk[this.model.figure];
    if (world === undefined || row === undefined) return;
    const cls = phaseClassOf(this.model.phase, this.model.routines);
    const stops = row.fixed ? [] : routeOf(world, row, this.model.routines, cls);
    const centre = (x: number, y: number) => toScreen((x + 0.5) * TILE_PX, (y + 0.5) * TILE_PX);
    const live = stops.filter((s) => s.active);
    this.frame(
      stops.map((st) => centre(st.x, st.y)),
      id!,
    );
    this.g.lineStyle(2, colorOf(palette.colors.teal), 0.8);
    this.g.beginPath();
    live.forEach((s, i) => {
      const p = centre(s.x, s.y);
      if (i === 0) this.g.moveTo(p.x, p.y);
      else this.g.lineTo(p.x, p.y);
    });
    this.g.strokePath();
    for (const s of stops) {
      const p = centre(s.x, s.y);
      const colour = colorOf(s.active ? palette.colors.lantern : palette.colors.bone);
      this.g.fillStyle(colour, s.active ? 0.5 : 0.15);
      this.g.lineStyle(1, colour, s.active ? 1 : 0.4);
      const d = tileDiamond(s.x, s.y);
      const pts = d.map((q) => new Phaser.Math.Vector2(q.x, q.y));
      this.g.fillPoints(pts, true);
      this.g.strokePoints(pts, true);
      this.texts.push(
        this.scene.add
          .text(p.x, p.y, String(s.n), { fontSize: '12px', color: palette.colors.bone })
          .setOrigin(0.5)
          .setDepth(DEPTH + 1)
          .setAlpha(s.active ? 1 : 0.4),
      );
    }
  }

  /** Brings the route into the camera when the figure, phase or scene changes, so the markers are in view. */
  private frame(points: Array<{ x: number; y: number }>, sceneId: string): void {
    const key = `${sceneId}|${this.model.figure}|${this.model.phase}`;
    if (key === this.framed || points.length === 0) return;
    this.framed = key;
    const xs = points.map((q) => q.x);
    const ys = points.map((q) => q.y);
    const w = Math.max(...xs) - Math.min(...xs) + 160;
    const h = Math.max(...ys) - Math.min(...ys) + 160;
    const cam = this.scene.cameras.main;
    cam.stopFollow();
    cam.setZoom(Math.min(1, Math.max(0.25, Math.min((cam.width * 0.5) / w, cam.height / h))));
    cam.centerOn((Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2);
  }

  destroy(): void {
    this.model.bus.removeEventListener('change', this.redraw);
    for (const t of this.texts.splice(0)) t.destroy();
    this.g.destroy();
  }
}
