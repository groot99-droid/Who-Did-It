// Round 9 (9T, docs/round9/admin-studio.md 3): draws the editable objects of the session's scene over the world and
// turns clicks and drags into session calls. Everything it draws comes from `session.scene`, so edits show at once.
import Phaser from 'phaser';
import palette from '@wdi/content/data/palette.json';
import { TILE_PX } from '@wdi/shared/constants';
import { radiusEllipse, toScreen, toWorld } from '@wdi/shared/iso';
import { tileDiamond } from '../../view/iso';
import { KINDS, listOf, type Kind } from './sceneEdit';
import type { EditorSession } from './session';

const DEPTH = 2_100_000;
const colorOf = (hex: string) => Number.parseInt(hex.slice(1), 16);
const poly = (pts: Array<{ x: number; y: number }>) => pts.map((p) => new Phaser.Math.Vector2(p.x, p.y));
const KIND_COLOUR: Record<Kind, string> = {
  props: palette.colors.teal,
  portals: palette.colors.mustard,
  spawns: palette.colors.bone,
  spots: palette.colors.magenta,
  lights: palette.colors.lantern,
};

const GRID_COLOUR: Record<string, string> = {
  '#': palette.colors.blood,
  D: palette.colors.mustard,
  S: palette.colors.teal,
  H: palette.colors.moon,
  B: palette.colors.magenta,
};

type Fp = { x: number; y: number; w: number; h: number };

export class EditorView {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly texts: Phaser.GameObjects.Text[] = [];
  private grab: { x: number; y: number } | null = null;
  /** The tiles a brush stroke has crossed, or the corner a rectangle began at. */
  private trail: Array<{ x: number; y: number }> | null = null;
  private readonly redraw = () => this.draw();
  private readonly down = (p: Phaser.Input.Pointer) => {
    const t = this.tileOf(p);
    if (this.session.tool === 'brush' || this.session.tool === 'rect' || this.session.tool === 'gate') {
      this.trail = [t];
      return;
    }
    this.session.click(t.x, t.y);
    this.grab = this.session.palette === null && this.session.selection !== null ? t : null;
  };
  private readonly move = (p: Phaser.Input.Pointer) => {
    if (this.trail === null || !p.isDown || this.session.tool !== 'brush') return;
    const t = this.tileOf(p);
    const last = this.trail[this.trail.length - 1]!;
    if (last.x !== t.x || last.y !== t.y) this.trail.push(t);
  };
  private readonly up = (p: Phaser.Input.Pointer) => {
    const trail = this.trail;
    this.trail = null;
    if (trail !== null) {
      if (this.session.tool === 'rect') this.session.paintRect(trail[0]!, this.tileOf(p));
      else if (this.session.tool === 'gate') this.session.addGateBetween(trail[0]!, this.tileOf(p));
      else this.session.paintTiles(trail);
      return;
    }
    const from = this.grab;
    this.grab = null;
    if (from === null) return;
    const t = this.tileOf(p);
    if (t.x !== from.x || t.y !== from.y) this.session.moveSelected(t.x, t.y);
  };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly session: EditorSession,
  ) {
    this.g = scene.add.graphics().setDepth(DEPTH);
    session.bus.on('change', this.redraw);
    scene.input.on('pointerdown', this.down);
    scene.input.on('pointermove', this.move);
    scene.input.on('pointerup', this.up);
    this.draw();
  }

  private tileOf(p: Phaser.Input.Pointer): { x: number; y: number } {
    const w = toWorld(p.worldX, p.worldY);
    return { x: Math.floor(w.x / TILE_PX), y: Math.floor(w.y / TILE_PX) };
  }

  private draw(): void {
    const s = this.session;
    const g = this.g.clear();
    for (const t of this.texts.splice(0)) t.destroy();
    if (s.tool !== 'objects') {
      s.scene.grid.forEach((row, y) =>
        [...row].forEach((ch, x) => {
          if (ch === '.') return;
          g.fillStyle(colorOf(GRID_COLOUR[ch] ?? palette.colors.bone), 0.35).fillPoints(
            poly(tileDiamond(x, y)),
            true,
          );
        }),
      );
    }
    for (const gate of s.scene.gates)
      for (let j = 0; j < gate.h; j++)
        for (let i = 0; i < gate.w; i++)
          g.lineStyle(2, colorOf(palette.colors.mustard), 0.9).strokePoints(
            poly(tileDiamond(gate.x + i, gate.y + j)),
            true,
            true,
          );
    const loops = [...s.scene.paths.map((p) => p.points), s.draft];
    for (const pts of loops) {
      if (pts.length === 0) continue;
      const line = pts.map((q) => toScreen((q.x + 0.5) * TILE_PX, (q.y + 0.5) * TILE_PX));
      g.lineStyle(2, colorOf(palette.colors.teal), 0.9).strokePoints(
        line.map((q) => new Phaser.Math.Vector2(q.x, q.y)),
        pts !== s.draft,
        pts !== s.draft,
      );
    }
    for (const kind of KINDS) {
      for (const o of listOf(s.scene, kind)) {
        const picked = s.selection?.kind === kind && s.selection.id === o.id;
        const colour = colorOf(KIND_COLOUR[kind]);
        const fp = (o as { footprint?: Fp }).footprint;
        const tiles =
          fp === undefined
            ? [{ x: o.x, y: o.y }]
            : Array.from({ length: fp.w * fp.h }, (_, i) => ({
                x: fp.x + (i % fp.w),
                y: fp.y + Math.floor(i / fp.w),
              }));
        for (const t of tiles) {
          g.fillStyle(colour, picked ? 0.7 : 0.4).fillPoints(poly(tileDiamond(t.x, t.y)), true);
          if (picked)
            g.lineStyle(3, colorOf(palette.colors.bone), 1).strokePoints(
              poly(tileDiamond(t.x, t.y)),
              true,
              true,
            );
        }
        const r = (o as { radiusTiles?: number }).radiusTiles;
        const c = toScreen((o.x + 0.5) * TILE_PX, (o.y + 0.5) * TILE_PX);
        if (r !== undefined) {
          const e = radiusEllipse(r);
          g.lineStyle(picked ? 3 : 1, colour, 0.9).strokeEllipse(c.x, c.y, e.rx * 2, e.ry * 2);
        }
        this.texts.push(
          this.scene.add
            .text(c.x, c.y - 8, o.id, {
              fontFamily: 'Inter, sans-serif',
              fontSize: '10px',
              color: palette.colors.bone,
              backgroundColor: '#14110fcc',
            })
            .setOrigin(0.5, 1)
            .setDepth(DEPTH + 1),
        );
      }
    }
  }

  destroy(): void {
    this.session.bus.off('change', this.redraw);
    this.scene.input.off('pointerdown', this.down);
    this.scene.input.off('pointermove', this.move);
    this.scene.input.off('pointerup', this.up);
    this.g.destroy();
    for (const t of this.texts.splice(0)) t.destroy();
  }
}
