import Phaser from 'phaser';
import balance from '@wdi/content/data/balance.json';
import items from '@wdi/content/data/items.json';
import { toScreen } from '@wdi/shared/iso';
import { REG_WORLD, type WorldFeed } from '../net/world';
import { h } from '../ui/dom';
import { type DayPart } from './dayPart';
import { tokenColour, type PaletteToken } from './greyboxColours';
import { DEPTH } from './iso';
import { lanternCarriers, type Carrier } from './m5bFrames';
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
/** Round 6 (6I): a carried light's pool, in tiles, is the lantern item's own radius (GDD 3.5); the carrier's own sight gains `vision.lanternTiles` (GDD 3.7). */
const CARRIED_TILES = items.items.lantern.lightRadiusTiles;
const LANTERN_FRAME = 'glow_lantern/0';
const LANTERN_ANIM = 'glow_lantern';

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
  /** Kept: the scene's camera manager is gone by the time the scene shuts down. */
  private readonly cam: Phaser.Cameras.Scene2D.Camera;
  private glows: Glow[] = [];
  private state: LightState = { visible: false, viewer: null, darkness: 0, part: 'day' };
  private inDarkScene = false;
  private hidden = false;
  private following = false;
  private lastDraw = -1;
  private readonly carried = new Map<string, Phaser.GameObjects.Image>();

  constructor(
    private readonly scene: Phaser.Scene,
    parent: HTMLElement,
  ) {
    this.root = h('div', { class: 'wdi-night-mask', 'aria-hidden': 'true', 'data-testid': 'night-mask' });
    parent.append(this.root);
    ensureLightTexture(scene.textures);
    const cam = scene.cameras.main;
    this.cam = cam;
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

  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    this.syncHidden();
  }

  /** Follows a canvas resize: the texture is as big as the canvas. */
  resize(): void {
    const cam = this.scene.cameras.main;
    this.dark.setSize(Math.max(2, cam.width), Math.max(2, cam.height));
    // The image keeps the size and origin of the frame it was made with: without this it stays centred on the old
    // size and leaves a strip of the canvas uncovered on the left and top after a resize (the owner's "shadow").
    this.image.setSizeToFrame().updateDisplayOrigin();
    this.lastDraw = -1;
  }

  private syncHidden(): void {
    const show = this.state.visible && !this.hidden;
    this.image.setVisible(show);
    this.root.hidden = !show;
    for (const g of this.glows) if (!show) g.image.setVisible(false);
    for (const img of this.carried.values()) if (!show) img.setVisible(false);
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
    const feed = this.scene.registry.get(REG_WORLD) as WorldFeed | undefined;
    const me = feed?.snapshot().find((p) => p.id === feed.selfId)?.presence;
    const carriers = feed
      ? lanternCarriers(feed.avatars(), feed.selfHandle(), s.viewer, me?.statusBits ?? 0)
      : [];
    const ownLit = carriers.some((c) => c.own);
    if (s.viewer)
      cut(
        s.viewer.x,
        s.viewer.y,
        visionTiles(darkness, this.inDarkScene) + (ownLit ? balance.vision.lanternTiles : 0),
      );
    for (const c of carriers) if (!c.own) cut(c.x, c.y, CARRIED_TILES);
    const now = this.scene.time.now;
    for (const g of this.glows) {
      const burning = burnsIn(g.light.phases, s.part);
      const r = flickerRadius(g.light.kind, g.light.radiusTiles, now, g.light.id);
      if (burning) cut(g.light.x, g.light.y, r);
      this.placeGlow(g, burning, r, darkness);
    }
    this.placeCarried(carriers, darkness);
    t.render();
    this.root.dataset.darkness = darkness.toFixed(2);
  };

  /** The glow over each lit carried light: the lantern's looping frames, added over the world like a scene light. */
  private placeCarried(carriers: readonly Carrier[], darkness: number): void {
    const a = glowAlpha(darkness);
    const keep = new Set<string>();
    for (const c of carriers) {
      keep.add(c.key);
      let img = this.carried.get(c.key);
      if (!img) {
        const art =
          this.scene.textures.exists('tools') && this.scene.textures.get('tools').has(LANTERN_FRAME);
        img = art
          ? this.scene.add.sprite(0, 0, 'tools', LANTERN_FRAME)
          : this.scene.add.image(0, 0, LIGHT_KEY).setTint(tokenColour('lantern'));
        img.setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.glow);
        if (art && this.scene.anims.exists(LANTERN_ANIM))
          (img as Phaser.GameObjects.Sprite).play(LANTERN_ANIM);
        this.carried.set(c.key, img);
      }
      const at = toScreen(c.x, c.y);
      const p = poolOnScreen(c.x, c.y, CARRIED_TILES, 1, { x: 0, y: 0 });
      img
        .setPosition(at.x, at.y)
        .setDisplaySize(p.width, p.height)
        .setAlpha(a)
        .setVisible(a > 0);
    }
    for (const [key, img] of this.carried) {
      if (keep.has(key)) continue;
      img.destroy();
      this.carried.delete(key);
    }
  }

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
    this.cam.off(Phaser.Cameras.Scene2D.Events.FOLLOW_UPDATE, this.redraw, this);
    this.cam.off(Phaser.Cameras.Scene2D.Events.PRE_RENDER, this.preRender, this);
    for (const g of this.glows) g.image.destroy();
    this.glows = [];
    for (const img of this.carried.values()) img.destroy();
    this.carried.clear();
    this.image.destroy();
    this.scene.textures.remove(DARK_KEY);
    this.root.remove();
  }
}
