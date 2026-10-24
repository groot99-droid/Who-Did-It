import type Phaser from 'phaser';
import metrics from '@wdi/content/data/metrics.json';
import palette from '@wdi/content/data/palette.json';
import traits from '@wdi/content/data/traits.json';
import type { Direction } from '@wdi/shared/direction';
import { isoDepth, toScreen } from '@wdi/shared/iso';
import { StatusBit } from './animIds';
import { TELEPORT_PX } from './interpolation';
import { BIAS } from './iso';
import { type Clip, clipFor, dirFor, dirFromYaw } from './poses';

export { dirFromYaw };

// One player: a body sprite with scarf and hat overlays (docs/SPRITES.md 3), a shadow and a nameplate.
// Animation keys are `<pass>/<body>/<anim>/<dir>`; every layer plays the same tail so they stay in step.
// Nothing here knows a role: only the dealt traits and the shared walk/idle ids reach the client.

export const BODY = 'villager';
export const HATS = ['hat_cap', 'hat_bowler', null] as const;
export const SCARF_TINT = traits.axes.scarf.values.map((v) =>
  Number.parseInt(palette.colors[v.tint as keyof typeof palette.colors].slice(1), 16),
);
const SCARF_SHAPE = ['◆', '●', '■']; // diamond, circle, square (nameplateShape)
/**
 * The drawn scale of a figure (round 8, 8F; SPRITES 1, 10.3): packed frames are drawn `iso.artScale` times larger
 * like every other packed sprite, then `iso.figureScale` larger than true scale against props and tiles, both
 * anchored at the feet pivot. Before round 8 the characters were drawn at 1, half their designed size.
 */
export const FIGURE_SCALE = metrics.iso.artScale * metrics.iso.figureScale;
/** The GDD 3.1 height factor of each height trait, times `FIGURE_SCALE`: the whole scale of a drawn figure. */
export const HEIGHT_SCALE = traits.axes.height.values.map((v) => v.spriteScale * FIGURE_SCALE);
/** The standing figure's cap in packed px (SPRITES 1): the nameplate and the tick sit above it. */
const HEAD_PX = metrics.maxStandingSilhouettePx / metrics.iso.artScale;
const hex = (c: string) => Number.parseInt(c.slice(1), 16);

export interface PlayerLook {
  /** The look id of the deck (`char/<lookId>/...`, SPRITES 3); the plain villager body when absent or not loaded. */
  lookId?: string;
  height: number;
  scarf: number;
  hat: number;
}

export class PlayerView {
  readonly root: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Sprite;
  private readonly scarf: Phaser.GameObjects.Sprite;
  private readonly hat: Phaser.GameObjects.Sprite;
  private readonly blood: Phaser.GameObjects.Sprite;
  private readonly plate: Phaser.GameObjects.Text;
  private readonly hasArt: boolean;
  /** `char/<bodyId>/...`: the look's own id, or the plain villager when the look is not loaded (SPRITES 10.13). */
  private readonly bodyId: string;
  private readonly tick: Phaser.GameObjects.Rectangle;
  private anim = '';
  private hatPass: string | null = null;
  private bloodOn = false;
  private readonly plateColor: string;
  /** The last drawn feet position and its time, for the speed the gaits read. */
  private last: { x: number; y: number; t: number } | null = null;
  private speed = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    name: string,
    look: PlayerLook,
    isSelf: boolean,
  ) {
    const lookId = look.lookId;
    this.bodyId = lookId !== undefined && scene.textures.exists(`char_${lookId}`) ? lookId : BODY;
    const bodyTexture = `char_${this.bodyId}`;
    const overlayTexture = `ovl_${this.bodyId}`;
    this.hasArt = scene.textures.exists(bodyTexture);
    this.plateColor = isSelf ? palette.colors.mustard : palette.colors.bone;
    const scale = HEIGHT_SCALE[look.height] ?? FIGURE_SCALE;
    const shadow = scene.add.ellipse(0, 0, 20 * scale, 10 * scale, 0x12141c, 0.4);
    this.body = scene.add.sprite(0, 0, this.hasArt ? bodyTexture : '__DEFAULT');
    this.scarf = scene.add.sprite(0, 0, scene.textures.exists(overlayTexture) ? overlayTexture : '__DEFAULT');
    this.hat = scene.add.sprite(0, 0, scene.textures.exists(overlayTexture) ? overlayTexture : '__DEFAULT');
    this.blood = scene.add.sprite(0, 0, scene.textures.exists(overlayTexture) ? overlayTexture : '__DEFAULT');
    this.blood.setVisible(false);
    this.body.setVisible(this.hasArt);
    this.scarf.setTint(SCARF_TINT[look.scarf] ?? SCARF_TINT[0]);
    // The scarf and hat are the villager's overlays; a deck look wears its own, baked into the body.
    this.hatPass = this.bodyId === BODY ? (HATS[look.hat] ?? null) : null;
    this.scarf.setVisible(this.bodyId === BODY);
    const shape = SCARF_SHAPE[look.scarf] ?? SCARF_SHAPE[0];
    this.plate = scene.add
      .text(0, -Math.round(HEAD_PX * scale + 18), `${shape} ${name}`, {
        fontFamily: 'Inter, sans-serif',
        fontSize: '15px',
        color: this.plateColor,
        stroke: palette.colors.ink,
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1);
    const art = scene.add.container(0, 0, [this.body, this.scarf, this.hat, this.blood]).setScale(scale);
    // The greybox mark of an interact pose a look has no clip for: a small teal tick above the head.
    this.tick = scene.add
      .rectangle(0, -Math.round(HEAD_PX * scale + 8), 10, 10, hex(palette.colors.teal))
      .setAngle(45)
      .setVisible(false);
    this.root = scene.add.container(0, 0, [shadow, art, this.tick, this.plate]);
    if (!this.hasArt) {
      // No texture at all: a bare capsule (packed px, scaled with the art) keeps the game playable.
      art.add(scene.add.rectangle(0, -20, 14, 40, 0x6f7a8c).setStrokeStyle(2, 0x12141c));
    }
  }

  /**
   * Poses the sprite for a facing, an animation id and the presence's status bits (motion.md 1): the gaits and
   * the status loops come from the bits and the drawn speed (poses.ts), and `transit` hides the nameplate at the
   * door. A plain boolean is the transit flag alone (round 5 callers).
   */
  pose(dir: Direction, animId: number, status: number | boolean): void {
    const bits = typeof status === 'number' ? status : status ? StatusBit.transit : 0;
    const transit = (bits & StatusBit.transit) !== 0;
    this.plate.setVisible(!transit);
    const key = (clip: Clip) => `${this.bodyId}/${clip}/${dirFor(clip, dir)}`;
    const has = (c: Clip) => this.scene.anims.exists(`char/${key(c)}`);
    const { clip, tick } = clipFor(animId, has, { bits, speed: this.speed });
    this.tick.setVisible(tick && !transit);
    if (!this.hasArt) return;
    const tail = key(clip);
    if (tail === this.anim) return;
    const keep = this.anim.split('/')[1] === clip ? (this.body.anims.currentFrame?.index ?? 1) - 1 : 0;
    this.anim = tail;
    this.play(this.body, `char/${tail}`, keep);
    this.play(this.scarf, `scarf/${tail}`, keep);
    this.hat.setVisible(this.hatPass !== null);
    if (this.hatPass !== null) this.play(this.hat, `${this.hatPass}/${tail}`, keep);
    if (this.bloodOn) this.play(this.blood, `blood/${tail}`, keep);
  }

  /**
   * The `blood` pass (torso and hands) while the Blood status is up and the viewer is within range
   * (docs/SPRITES.md 6). Without the art the player gets a red mark on the nameplate instead.
   */
  setBlood(on: boolean): void {
    if (on === this.bloodOn) return;
    this.bloodOn = on;
    this.blood.setVisible(on && this.hasArt);
    this.paintPlate();
    if (on && this.anim !== '') {
      this.play(this.blood, `blood/${this.anim}`, (this.body.anims.currentFrame?.index ?? 1) - 1);
    }
  }

  private paintPlate(): void {
    this.plate.setColor(this.bloodOn ? palette.colors.lantern : this.plateColor);
    this.plate.setStroke(palette.colors.ink, 4);
  }

  /** A ghost is drawn translucent (to its own player and to other ghosts). */
  setGhost(on: boolean): void {
    this.root.setAlpha(on ? 0.45 : 1);
  }

  private play(sprite: Phaser.GameObjects.Sprite, key: string, startFrame: number): void {
    if (this.scene.anims.exists(key)) sprite.play({ key, startFrame });
  }

  /**
   * `x`, `y` are the feet in world px; the sprite stands at their projection and sorts by its screen y. The drawn
   * speed (world px per second, smoothed over two frames) feeds the gaits; a teleport counts as standing still.
   */
  setPosition(x: number, y: number): void {
    const t = this.scene.time?.now ?? 0;
    if (this.last && t > this.last.t) {
      const d = Math.hypot(x - this.last.x, y - this.last.y);
      const now = d >= TELEPORT_PX ? 0 : (d * 1000) / (t - this.last.t);
      this.speed = (this.speed + now) / 2;
    }
    this.last = { x, y, t };
    const s = toScreen(x, y);
    this.root.setPosition(s.x, s.y).setDepth(isoDepth(x, y) + BIAS.character);
  }

  destroy(): void {
    this.root.destroy();
  }
}
