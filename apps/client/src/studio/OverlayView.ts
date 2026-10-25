// Round 9 (9T, docs/round9/admin-studio.md 2): paints the Studio overlays over the world. The shapes come from
// `overlayData.ts`; this only draws them, and redraws when the scene, the profile, the time of day or a toggle changes.
import Phaser from 'phaser';
import palette from '@wdi/content/data/palette.json';
import { TILE_PX } from '@wdi/shared/constants';
import { radiusEllipse, toScreen, toWorld } from '@wdi/shared/iso';
import type { StudioSnapshot } from '../admin/StudioNet';
import { tileDiamond } from '../view/iso';
import {
  footprints,
  hiddenAtProfile,
  idLabels,
  lightRings,
  type OverlayId,
  solidTiles,
  visionTiles,
  walkLinks,
} from './overlayData';

const DEPTH = 2_000_000;
const colorOf = (hex: string) => Number.parseInt(hex.slice(1), 16);
const poly = (pts: Array<{ x: number; y: number }>) => pts.map((p) => new Phaser.Math.Vector2(p.x, p.y));
const centre = (tx: number, ty: number) => toScreen((tx + 0.5) * TILE_PX, (ty + 0.5) * TILE_PX);

export class OverlayView {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly texts: Phaser.GameObjects.Text[] = [];
  private readonly cursor: Phaser.GameObjects.Text;
  private sig = '';

  constructor(private readonly scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(DEPTH);
    this.cursor = this.label('', 14)
      .setDepth(DEPTH + 2)
      .setVisible(false);
  }

  private label(text: string, size = 11): Phaser.GameObjects.Text {
    return this.scene.add
      .text(0, 0, text, {
        fontFamily: 'Inter, sans-serif',
        fontSize: `${size}px`,
        color: palette.colors.bone,
        backgroundColor: '#14110fcc',
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH + 1);
  }

  /** Redraws when something it shows changed, and keeps the cursor's tile label under the pointer. */
  update(on: ReadonlySet<OverlayId>, s: StudioSnapshot, pointer: { x: number; y: number } | null): void {
    const sig = `${[...on].sort().join()}|${s.sceneId}|${s.profile}|${s.time.phase}|${s.tx},${s.ty}`;
    if (sig !== this.sig) {
      this.sig = sig;
      this.redraw(on, s);
    }
    const show = on.has('coords') && pointer !== null;
    this.cursor.setVisible(show);
    if (show && pointer !== null) {
      const wp = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const w = toWorld(wp.x, wp.y);
      const tx = Math.floor(w.x / TILE_PX);
      const ty = Math.floor(w.y / TILE_PX);
      this.cursor.setText(`${tx},${ty}`).setPosition(wp.x, wp.y - 6);
    }
  }

  private redraw(on: ReadonlySet<OverlayId>, s: StudioSnapshot): void {
    const g = this.g.clear();
    for (const t of this.texts.splice(0)) t.destroy();
    const tile = (x: number, y: number, fill: number, alpha: number) => {
      g.fillStyle(fill, alpha).fillPoints(poly(tileDiamond(x, y)), true);
    };
    const text = (str: string, x: number, y: number) => this.texts.push(this.label(str).setPosition(x, y));
    if (on.has('collision'))
      for (const t of solidTiles(s.sceneId, s.profile)) tile(t.x, t.y, colorOf(palette.colors.blood), 0.35);
    if (on.has('nav')) {
      g.lineStyle(1, colorOf(palette.colors.mustard), 0.8);
      for (const [a, b] of walkLinks(s.sceneId, s.profile)) {
        const p = centre(a.x, a.y);
        const q = centre(b.x, b.y);
        g.lineBetween(p.x, p.y, q.x, q.y);
      }
    }
    if (on.has('footprints')) {
      g.lineStyle(2, colorOf(palette.colors.bone), 0.9);
      for (const f of footprints(s.sceneId)) {
        const pts = [
          toScreen(f.x * TILE_PX, f.y * TILE_PX),
          toScreen((f.x + f.w) * TILE_PX, f.y * TILE_PX),
          toScreen((f.x + f.w) * TILE_PX, (f.y + f.h) * TILE_PX),
          toScreen(f.x * TILE_PX, (f.y + f.h) * TILE_PX),
        ];
        g.strokePoints(poly(pts), true, true);
      }
    }
    if (on.has('lights')) {
      g.lineStyle(2, colorOf(palette.colors.mustard), 0.9);
      for (const l of lightRings(s.sceneId)) {
        const c = centre(l.x, l.y);
        const e = radiusEllipse(l.r);
        g.strokeEllipse(c.x, c.y, e.rx * 2, e.ry * 2);
      }
    }
    if (on.has('sight')) {
      const c = toScreen(s.x, s.y);
      const e = radiusEllipse(visionTiles(s.time.phase));
      g.lineStyle(2, colorOf(palette.colors.bone), 0.9).strokeEllipse(c.x, c.y, e.rx * 2, e.ry * 2);
    }
    if (on.has('gating')) {
      for (const h of hiddenAtProfile(s.sceneId, s.profile)) {
        tile(h.x, h.y, colorOf(palette.colors.blood), 0.6);
        const c = centre(h.x, h.y);
        text(`${h.id}: hidden at ${h.hiddenAt.join(', ')}`, c.x, c.y - 10);
      }
    }
    if (on.has('ids')) {
      for (const l of idLabels(s.sceneId)) {
        const c = centre(l.x, l.y);
        text(l.id, c.x, c.y - 4);
      }
    }
  }

  destroy(): void {
    this.g.destroy();
    for (const t of this.texts.splice(0)) t.destroy();
    this.cursor.destroy();
  }
}
