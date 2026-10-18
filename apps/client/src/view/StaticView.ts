import Phaser from 'phaser';
import metrics from '@wdi/content/data/metrics.json';
import palette from '@wdi/content/data/palette.json';
import { toScreen } from '@wdi/shared/iso';
import { TILE_PX } from '@wdi/shared/constants';
import type { Rect } from './iso';
import {
  FADED_ALPHA,
  type StaticDef,
  cullRect,
  defDepth,
  moved,
  overlaps,
  prismRect,
  shouldFade,
  stepFade,
} from './statics';

interface Item {
  def: StaticDef;
  obj: Phaser.GameObjects.Sprite | Phaser.GameObjects.Graphics;
  /** Screen bounds, fixed at build time: a static never moves. */
  bounds: Rect;
  alpha: number;
}

const colorOf = (hex: string) => Number.parseInt(hex.slice(1), 16);

/** `hex` with each channel scaled by `f`, for the three faces of a greybox block. */
function shade(hex: number, f: number): number {
  const c = (shift: number) => Math.min(255, Math.round(((hex >> shift) & 0xff) * f));
  return (c(16) << 16) | (c(8) << 8) | c(0);
}

/**
 * Every static world sprite of the scene (SPRITES 10.5 to 10.7): kit pieces, building slices, tall props. Each sorts by
 * its own ground point, hides when outside the view grown by two tiles, and fades to `occluderFadeAlpha` while it
 * covers the viewer's own character. A def whose frame is missing draws a greybox block, so the game plays before
 * the art lands (SPRITES 10.13).
 */
export class StaticView {
  private items: Item[] = [];
  private lastCull: { x: number; y: number } | null = null;

  constructor(private readonly scene: Phaser.Scene) {}

  get count(): number {
    return this.items.length;
  }

  /** How many are drawn right now (inside the cull rectangle). */
  get visibleCount(): number {
    return this.items.reduce((n, i) => n + (i.obj.visible ? 1 : 0), 0);
  }

  /** Replaces the statics. The next `update` culls them. */
  set(defs: StaticDef[]): void {
    this.clear();
    this.items = defs.map((def) => this.build(def));
    this.lastCull = null;
  }

  /**
   * `viewer` is your feet in world px (null while you are not drawn), `dtS` the frame time, `view` the camera's world
   * view (screen px).
   */
  update(viewer: { x: number; y: number } | null, dtS: number, view: Rect): void {
    const centre = { x: view.x + view.width / 2, y: view.y + view.height / 2 };
    if (moved(this.lastCull, centre)) {
      this.lastCull = centre;
      const keep = cullRect(view);
      for (const i of this.items) i.obj.setVisible(overlaps(i.bounds, keep));
    }
    for (const i of this.items) {
      if (!i.def.occluder || !i.obj.visible) continue;
      const target = viewer !== null && shouldFade(i.def, i.bounds, viewer.x, viewer.y) ? FADED_ALPHA : 1;
      if (i.alpha === target) continue;
      i.alpha = stepFade(i.alpha, target, dtS);
      i.obj.setAlpha(i.alpha);
    }
  }

  private build(def: StaticDef): Item {
    const s = this.scene;
    const at = toScreen(def.x, def.y);
    const tex = s.textures.exists(def.atlas) ? s.textures.get(def.atlas) : null;
    if (tex?.has(def.frame)) {
      const sprite = s.add.sprite(at.x, at.y, def.atlas, def.frame).setScale(metrics.iso.artScale);
      // Frames carry their own pivot (the ground point, SPRITES 10.5); a frame without one stands on its bottom edge.
      if (!tex.get(def.frame).customPivot) sprite.setOrigin(0.5, 1);
      sprite.setDepth(defDepth(def));
      return { def, obj: sprite, bounds: sprite.getBounds(), alpha: 1 };
    }
    const g = s.add.graphics({ x: at.x, y: at.y }).setDepth(defDepth(def));
    const bounds = this.greybox(g, def, at);
    return { def, obj: g, bounds, alpha: 1 };
  }

  /** A slate prism standing on the def's footprint: the greybox slate block of SPRITES 10.13. Returns its bounds. */
  private greybox(g: Phaser.GameObjects.Graphics, def: StaticDef, at: { x: number; y: number }): Rect {
    const hw = (def.tilesW * TILE_PX) / 2;
    const hh = (def.tilesH * TILE_PX) / 2;
    const nw = toScreen(-hw, -hh);
    const ne = toScreen(hw, -hh);
    const se = toScreen(hw, hh);
    const sw = toScreen(-hw, hh);
    const up = (p: { x: number; y: number }) => new Phaser.Math.Vector2(p.x, p.y - def.heightPx);
    const flat = (p: { x: number; y: number }) => new Phaser.Math.Vector2(p.x, p.y);
    const base = colorOf(def.occluder ? palette.colors.slate : palette.colors.ink);
    g.lineStyle(1, colorOf(palette.colors.ink), 0.6);
    const face = (pts: Phaser.Math.Vector2[], colour: number) => {
      g.fillStyle(colour, 1);
      g.fillPoints(pts, true);
      g.strokePoints(pts, true);
    };
    face([flat(sw), flat(se), up(se), up(sw)], shade(base, 0.7));
    face([flat(se), flat(ne), up(ne), up(se)], shade(base, 0.85));
    face([up(nw), up(ne), up(se), up(sw)], shade(base, 1.15));
    return prismRect(def, at);
  }

  private clear(): void {
    for (const i of this.items) i.obj.destroy();
    this.items = [];
  }

  destroy(): void {
    this.clear();
  }
}
