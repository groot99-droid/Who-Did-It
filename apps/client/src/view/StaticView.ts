import Phaser from 'phaser';
import metrics from '@wdi/content/data/metrics.json';
import palette from '@wdi/content/data/palette.json';
import { toScreen } from '@wdi/shared/iso';
import { shade, tokenColour } from './greyboxColours';
import { drawScale } from './texels';
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
  propOccludes,
  shouldFade,
  stepFade,
} from './statics';

interface Item {
  def: StaticDef;
  obj: Phaser.GameObjects.Sprite | Phaser.GameObjects.Graphics;
  /** A label over a greybox block. */
  label: Phaser.GameObjects.Text | null;
  /** Drawn at all (`setShown`); the cull may still hide it. */
  shown: boolean;
  inView: boolean;
  /** Screen bounds, fixed at build time: a static never moves. */
  bounds: Rect;
  alpha: number;
}

/**
 * Every static world sprite of the scene (SPRITES 10.5 to 10.7): kit pieces, building slices, tall props. Each sorts by
 * its own ground point, hides when outside the view grown by two tiles, and fades to `occluderFadeAlpha` while it
 * covers the viewer's own character. A def whose frame is missing draws a greybox block, so the game plays before
 * the art lands (SPRITES 10.13).
 */
export class StaticView {
  private items: Item[] = [];
  private byId = new Map<string, Item>();
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
    this.byId = new Map(this.items.map((i) => [i.def.id, i]));
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
      for (const i of this.items) {
        i.inView = overlaps(i.bounds, keep);
        this.show(i);
      }
    }
    for (const i of this.items) {
      if (!i.def.occluder || !i.obj.visible) continue;
      const target = viewer !== null && shouldFade(i.def, i.bounds, viewer.x, viewer.y) ? FADED_ALPHA : 1;
      if (i.alpha === target) continue;
      i.alpha = stepFade(i.alpha, target, dtS);
      i.obj.setAlpha(i.alpha);
    }
  }

  /** Shows or hides one static by id (the boarded overlay of a portal). */
  setShown(id: string, shown: boolean): void {
    const i = this.byId.get(id);
    if (!i || i.shown === shown) return;
    i.shown = shown;
    this.show(i);
  }

  /** Lantern posts and the like: the lit frame when `lit`, else the def's `frameAlt`. */
  setLit(lit: boolean): void {
    for (const i of this.items) {
      const alt = i.def.frameAlt;
      if (alt === undefined || !(i.obj instanceof Phaser.GameObjects.Sprite)) continue;
      const name = lit ? i.def.frame : alt;
      if (i.obj.texture.has(name)) i.obj.setFrame(name);
    }
  }

  /**
   * Round 8, 8G (granted): swaps one static's frame (an HQ station's tier, motion.md 2) and says where it stands
   * (world px). A greybox static, or a frame its atlas lacks, stays as it is (null). Its bounds, and whether it hides
   * you, follow the new art.
   */
  setFrame(id: string, frame: string): { x: number; y: number } | null {
    const i = this.byId.get(id);
    if (!i || !(i.obj instanceof Phaser.GameObjects.Sprite) || !i.obj.texture.has(frame)) return null;
    const at = { x: i.def.x, y: i.def.y };
    if (i.obj.frame.name === frame) return at;
    i.obj.setFrame(frame);
    if (!i.obj.texture.get(frame).customPivot) i.obj.setOrigin(0.5, 1);
    if (i.def.autoOccluder) i.def = { ...i.def, occluder: propOccludes(i.obj.displayHeight * i.obj.originY) };
    i.bounds = i.obj.getBounds();
    this.lastCull = null;
    return at;
  }

  private show(i: Item): void {
    const on = i.shown && i.inView;
    i.obj.setVisible(on);
    i.label?.setVisible(on);
  }

  private build(def: StaticDef): Item {
    const s = this.scene;
    const at = toScreen(def.x, def.y);
    const tex = s.textures.exists(def.atlas) ? s.textures.get(def.atlas) : null;
    const depth = defDepth(def);
    const item = { def, label: null, shown: def.hidden !== true, inView: true, alpha: 1 };
    if (tex?.has(def.frame)) {
      const sprite = s.add
        .sprite(at.x, at.y, def.atlas, def.frame)
        .setScale(drawScale(def.atlas, metrics.iso.artScale))
        .setDepth(depth);
      // Frames carry their own pivot (the ground point, SPRITES 10.5); a frame without one stands on its bottom edge.
      if (!tex.get(def.frame).customPivot) sprite.setOrigin(0.5, 1);
      if (def.flipX === true) sprite.setFlipX(true);
      // A prop's art decides whether it hides you: a frame that rises more than 96 px above its pivot does.
      const owned = def.autoOccluder
        ? { ...def, occluder: propOccludes(sprite.displayHeight * sprite.originY) }
        : def;
      sprite.setVisible(item.shown);
      return { ...item, def: owned, obj: sprite, bounds: sprite.getBounds() };
    }
    const g = s.add.graphics({ x: at.x, y: at.y }).setDepth(depth);
    const bounds = this.greybox(g, def, at);
    g.setVisible(item.shown);
    let label: Phaser.GameObjects.Text | null = null;
    if (def.label !== undefined) {
      label = s.add
        .text(at.x, at.y - def.heightPx - 4, def.label, {
          fontFamily: 'Oswald, sans-serif',
          fontSize: '14px',
          color: palette.colors.bone,
          stroke: palette.colors.ink,
          strokeThickness: 3,
        })
        .setOrigin(0.5, 1)
        .setDepth(depth + 0.01)
        .setVisible(item.shown);
    }
    return { ...item, label, obj: g, bounds };
  }

  /** A prism standing on the def's footprint: the greybox block of SPRITES 10.13. Returns its screen bounds. */
  private greybox(g: Phaser.GameObjects.Graphics, def: StaticDef, at: { x: number; y: number }): Rect {
    const hw = (def.tilesW * TILE_PX) / 2;
    const hh = (def.tilesH * TILE_PX) / 2;
    const nw = toScreen(-hw, -hh);
    const ne = toScreen(hw, -hh);
    const se = toScreen(hw, hh);
    const sw = toScreen(-hw, hh);
    const up = (p: { x: number; y: number }) => new Phaser.Math.Vector2(p.x, p.y - def.heightPx);
    const flat = (p: { x: number; y: number }) => new Phaser.Math.Vector2(p.x, p.y);
    const base = tokenColour(def.colour ?? (def.occluder ? 'slate' : 'ink'));
    g.lineStyle(1, tokenColour('ink'), 0.6);
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
    for (const i of this.items) {
      i.obj.destroy();
      i.label?.destroy();
    }
    this.items = [];
    this.byId.clear();
  }

  destroy(): void {
    this.clear();
  }
}
