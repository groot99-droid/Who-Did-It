import Phaser from 'phaser';
import { toScreen } from '@wdi/shared/iso';
import { h } from '../ui/dom';
import { type DayPart } from './dayPart';
import { tokenColour, type PaletteToken } from './greyboxColours';
import { DEPTH } from './iso';
import {
  type SceneLight,
  ambientFor,
  burnsIn,
  flickerRadius,
  glowAlpha,
  lightAlphaAt,
  poolOnScreen,
  visionTiles,
} from './lightMath';

const LIGHT_KEY = 'gen_light';
const LIGHT_PX = 256;
const DARK_KEY = 'gen_dark';

/** What the layer draws this frame. */
export interface LightState {
  /** False outside world phases and while the World sleeps for a meeting. */
  visible: boolean;
  /** Your feet in world px, or null while you are not drawn. */
  viewer: { x: number; y: number } | null;
  darkness: number;
  part: DayPart;
}

/** `gen_light`: a radial alpha gradient, opaque out to `lightCore` of the radius and linear to 0 at the edge. */
function ensureLightTexture(textures: Phaser.Textures.TextureManager): void {
  if (textures.exists(LIGHT_KEY)) return;
  const tex = textures.createCanvas(LIGHT_KEY, LIGHT_PX, LIGHT_PX);
  if (!tex) return;
  const g = tex.getContext();
  const c = LIGHT_PX / 2;
  const grad = g.createRadialGradient(c, c, 0, c, c, c);
  for (let i = 0; i <= 10; i++) grad.addColorStop(i / 10, `rgba(255,255,255,${lightAlphaAt(i / 10)})`);
  g.fillStyle = grad;
  g.fillRect(0, 0, LIGHT_PX, LIGHT_PX);
  tex.refresh();
}

interface Glow {
  light: SceneLight;
  image: Phaser.GameObjects.Image;
}

/**
 * The darkness layer (SPRITES 10.11, GDD 3.13): one dynamic texture the size of the canvas, filled with the ambient
 * darkness and cut by a pool for your vision and one for each light that burns in the current part of the day.
 * Lit lights also glow, additively, in the world. It replaces the old DOM night mask; a 1 x 1 px DOM element keeps
 * `data-testid="night-mask"` and `data-darkness` for the specs.
 */
export class Lighting {
  readonly root: HTMLElement;
  private readonly dark: Phaser.Textures.DynamicTexture;
  private readonly image: Phaser.GameObjects.Image;
  private glows: Glow[] = [];
  private state: LightState = { visible: false, viewer: null, darkness: 0, part: 'day' };
  private inDarkScene = false;
  private hidden = false;
  private following = false;
  private lastDraw = -1;
  private readonly carried = new Map<string, number>();

  constructor(
    private readonly scene: Phaser.Scene,
    parent: HTMLElement,
  ) {
    this.root = h('div', { class: 'wdi-night-mask', 'aria-hidden': 'true', 'data-testid': 'night-mask' });
    parent.append(this.root);
    ensureLightTexture(scene.textures);
    const cam = scene.cameras.main;
    const dark = scene.textures.addDynamicTexture(DARK_KEY, Math.max(2, cam.width), Math.max(2, cam.height));
    if (!dark) throw new Error('no dynamic texture for the darkness layer');
    this.dark = dark;
    this.image = scene.add
      .image(0, 0, DARK_KEY)
      .setScrollFactor(0)
      .setDepth(DEPTH.darkness)
      .setVisible(false);
    cam.on(Phaser.Cameras.Scene2D.Events.FOLLOW_UPDATE, this.redraw, this);
    cam.on(Phaser.Cameras.Scene2D.Events.PRE_RENDER, this.preRender, this);
    this.resize();
  }

  /** The scene's lights and whether it is a dark scene; call once per scene run. */
  setScene(lights: SceneLight[], dark: boolean): void {
    this.inDarkScene = dark;
    for (const g of this.glows) g.image.destroy();
    this.glows = lights.map((light) => ({
      light,
      image: this.scene.add
        .image(0, 0, LIGHT_KEY)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(tokenColour(light.colour as PaletteToken))
        .setDepth(DEPTH.glow)
        .setVisible(false),
    }));
  }

  /** The camera follows you from now on: redraw on its follow update, not before it (SPRITES 10.11). */
  setFollowing(on: boolean): void {
    this.following = on;
  }

  /** Sets what to draw; the next camera update draws it. */
  set(state: LightState): void {
    this.state = state;
    this.root.dataset.darkness = (this.inDarkScene ? 1 : state.darkness).toFixed(2);
    this.syncHidden();
  }

  /**
   * The slot for a carried light (SPRITES 10.11): `rTiles` for an avatar handle, null to take it away. Nothing calls
   * it in M5a; M5b's lantern does.
   */
  setCarried(handle: string, rTiles: number | null): void {
    if (rTiles === null) this.carried.delete(handle);
    else this.carried.set(handle, rTiles);
  }

  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    this.syncHidden();
  }

  /** Follows a canvas resize: the texture is as big as the canvas. */
  resize(): void {
    const cam = this.scene.cameras.main;
    this.dark.setSize(Math.max(2, cam.width), Math.max(2, cam.height));
    this.lastDraw = -1;
  }

  private syncHidden(): void {
    const show = this.state.visible && !this.hidden;
    this.image.setVisible(show);
    this.root.hidden = !show;
    for (const g of this.glows) if (!show) g.image.setVisible(false);
  }

  private readonly preRender = (): void => {
    if (!this.following) this.redraw();
  };

  private readonly redraw = (): void => {
    const s = this.state;
    if (!s.visible || this.hidden) return;
    const cam = this.scene.cameras.main;
    const frame = this.scene.game.getFrame();
    if (frame === this.lastDraw) return;
    this.lastDraw = frame;
    const zoom = cam.zoom;
    const darkness = this.inDarkScene ? 1 : s.darkness;
    // A scrollFactor 0 image is zoomed with the camera: centre it and undo the zoom to draw 1:1.
    this.image.setPosition(cam.width / 2, cam.height / 2).setScale(1 / zoom);
    const ambient = ambientFor(darkness, this.inDarkScene);
    const view = cam.worldView;
    const t = this.dark;
    t.clear();
    t.fill(ambient.colour, ambient.alpha);
    const cut = (wx: number, wy: number, rTiles: number) => {
      const p = poolOnScreen(wx, wy, rTiles, zoom, view);
      t.stamp(LIGHT_KEY, undefined, p.x, p.y, {
        scaleX: p.width / LIGHT_PX,
        scaleY: p.height / LIGHT_PX,
        blendMode: Phaser.BlendModes.ERASE,
      });
    };
    if (s.viewer) cut(s.viewer.x, s.viewer.y, visionTiles(darkness, this.inDarkScene));
    const now = this.scene.time.now;
    for (const g of this.glows) {
      const burning = burnsIn(g.light.phases, s.part);
      const r = flickerRadius(g.light.kind, g.light.radiusTiles, now, g.light.id);
      if (burning) cut(g.light.x, g.light.y, r);
      this.placeGlow(g, burning, r, darkness);
    }
    t.render();
    this.root.dataset.darkness = darkness.toFixed(2);
  };

  /** The glow of a lit light: the same ellipse, tinted, added over the world at `glowAlpha` times the darkness. */
  private placeGlow(g: Glow, burning: boolean, rTiles: number, darkness: number): void {
    const a = glowAlpha(darkness);
    g.image.setVisible(burning && a > 0);
    if (!burning || a <= 0) return;
    const at = toScreen(g.light.x, g.light.y);
    const p = poolOnScreen(g.light.x, g.light.y, rTiles, 1, { x: 0, y: 0 });
    g.image.setPosition(at.x, at.y).setDisplaySize(p.width, p.height).setAlpha(a);
  }

  destroy(): void {
    const cam = this.scene.cameras.main;
    cam.off(Phaser.Cameras.Scene2D.Events.FOLLOW_UPDATE, this.redraw, this);
    cam.off(Phaser.Cameras.Scene2D.Events.PRE_RENDER, this.preRender, this);
    for (const g of this.glows) g.image.destroy();
    this.glows = [];
    this.image.destroy();
    this.scene.textures.remove(DARK_KEY);
    this.root.remove();
  }
}
