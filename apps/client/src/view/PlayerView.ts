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
import { reducedMotion } from './vfx/motion';

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
/** The physical signs' colours (motion.md 1): the world palette's ramps and tokens (ASSETS 6.1). */
const POISON_CAST = hex(palette.world.ramps.moss[4]!);
const BLOOD = hex(palette.colors.blood);
const STAR = hex(palette.colors.mustard);
const SPARK = hex(palette.colors.lantern);
/** The bits that draw a sign on any clip; the other bits pick clips (poses.ts) or hide the nameplate. */
const SIGN_BITS = StatusBit.bleeding | StatusBit.poisoned | StatusBit.dazed | StatusBit.stunned;

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
  private readonly scale: number;
  private anim = '';
  private hatPass: string | null = null;
  private bloodOn = false;
  private bleeding = false;
  private readonly plateColor: string;
  /** The last drawn feet position and its time, for the speed the gaits read. */
  private last: { x: number; y: number; t: number } | null = null;
  private speed = 0;
  /** The sign bits drawn now, and their marks. */
  private signs = 0;
  private marks: Phaser.GameObjects.GameObject[] = [];
  /** Tweens on plain objects (the stars' orbit), stopped with the marks. */
  private orbits: object[] = [];

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
    this.scale = scale;
    const shadow = scene.add.ellipse(0, 0, 20 * scale, 10 * scale, 0x12141c, 0.4);
    this.body = scene.add.sprite(0, 0, this.hasArt ? bodyTexture : '__DEFAULT');
    this.scarf = scene.add.sprite(0, 0, scene.textures.exists(overlayTexture) ? overlayTexture : '__DEFAULT');
    this.hat = scene.add.sprite(0, 0, scene.textures.exists(overlayTexture) ? overlayTexture : '__DEFAULT');
    this.blood = scene.add.sprite(0, 0, scene.textures.exists(overlayTexture) ? overlayTexture : '__DEFAULT');
    this.blood.setVisible(false);
    this.body.setVisible(this.hasArt);
    this.scarf.setTint(SCARF_TINT[look.scarf] ?? SCARF_TINT[0]);
    // The scarf is the villager family's overlay (the townsfolk's variants too, looks.json `villagers`); a deck
    // look wears its own, baked into the body. The hat passes exist only on the placeholder villager.
    this.hatPass = this.bodyId === BODY ? (HATS[look.hat] ?? null) : null;
    this.scarf.setVisible(this.bodyId.startsWith(BODY));
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
   * the status loops come from the bits and the drawn speed (poses.ts), the signs are drawn over any clip, and
   * `transit` hides the nameplate at the door. A plain boolean is the transit flag alone (round 5 callers).
   */
  pose(dir: Direction, animId: number, status: number | boolean): void {
    const bits = typeof status === 'number' ? status : status ? StatusBit.transit : 0;
    const transit = (bits & StatusBit.transit) !== 0;
    this.plate.setVisible(!transit);
    const key = (clip: Clip) => `${this.bodyId}/${clip}/${dirFor(clip, dir)}`;
    const has = (c: Clip) => this.scene.anims.exists(`char/${key(c)}`);
    const { clip, tick } = clipFor(animId, has, { bits, speed: this.speed });
    this.tick.setVisible(tick && !transit);
    this.showSigns(bits & SIGN_BITS);
    if (!this.hasArt) return;
    const tail = key(clip);
    if (tail === this.anim) return;
    const keep = this.anim.split('/')[1] === clip ? (this.body.anims.currentFrame?.index ?? 1) - 1 : 0;
    this.anim = tail;
    this.play(this.body, `char/${tail}`, keep);
    this.play(this.scarf, `scarf/${tail}`, keep);
    this.hat.setVisible(this.hatPass !== null);
    if (this.hatPass !== null) this.play(this.hat, `${this.hatPass}/${tail}`, keep);
    if (this.blood.visible) this.play(this.blood, `blood/${tail}`, keep);
  }

  /**
   * The `blood` pass (torso and hands) while the Blood status is up and the viewer is within range
   * (docs/SPRITES.md 6). Without the art the player gets a red mark on the nameplate instead.
   */
  setBlood(on: boolean): void {
    if (on === this.bloodOn) return;
    this.bloodOn = on;
    this.syncBlood();
    this.paintPlate();
  }

  /** Shows the blood pass while Bloody or Bleeding, starting it in step with the body when it appears. */
  private syncBlood(): void {
    const on = (this.bloodOn || this.bleeding) && this.hasArt;
    if (on === this.blood.visible) return;
    this.blood.setVisible(on);
    if (on && this.anim !== '') {
      this.play(this.blood, `blood/${this.anim}`, (this.body.anims.currentFrame?.index ?? 1) - 1);
    }
  }

  private paintPlate(): void {
    this.plate.setColor(this.bloodOn ? palette.colors.lantern : this.plateColor);
    this.plate.setStroke(palette.colors.ink, 4);
  }

  /**
   * The physical signs (motion.md 1, GDD 3.22), client-drawn over any clip: Bleeding is the blood pass with a drip
   * trail and a red tick, Poisoned a green cast, Dazed wobbling stars, Stunned sparks. Under reduced motion each
   * is a static mark.
   */
  private showSigns(bits: number): void {
    if (bits === this.signs) return;
    this.signs = bits;
    this.bleeding = (bits & StatusBit.bleeding) !== 0;
    this.syncBlood();
    this.body.setTint(bits & StatusBit.poisoned ? POISON_CAST : 0xffffff);
    for (const m of this.marks) {
      this.scene.tweens.killTweensOf(m);
      m.destroy();
    }
    for (const o of this.orbits) this.scene.tweens.killTweensOf(o);
    this.marks = [];
    this.orbits = [];
    const s = this.scale;
    const still = reducedMotion();
    const head = -Math.round(HEAD_PX * s);
    const add = <T extends Phaser.GameObjects.GameObject>(m: T): T => {
      this.marks.push(m);
      this.root.add(m);
      return m;
    };
    if (bits & StatusBit.bleeding) {
      add(this.scene.add.rectangle(7 * s, Math.round(head * 0.6), 3, 7, BLOOD));
      for (let i = 0; i < (still ? 1 : 3); i++) {
        const drop = add(this.scene.add.ellipse(2 * s - i * 3, Math.round(head * 0.45), 3, 4, BLOOD, 0.9));
        if (!still) {
          this.scene.tweens.add({
            targets: drop,
            y: 0,
            alpha: 0,
            duration: 900,
            delay: i * 300,
            repeat: -1,
          });
        }
      }
    }
    if (bits & StatusBit.dazed) {
      const stars = [0, 1, 2].map(() =>
        add(
          this.scene.add
            .text(0, head - 6, '✦', { fontSize: '10px', color: palette.colors.mustard })
            .setOrigin(0.5)
            .setTint(STAR),
        ),
      ) as Phaser.GameObjects.Text[];
      const place = (phase: number) =>
        stars.forEach((st, i) => {
          const a = phase + (i * Math.PI * 2) / 3;
          st.setPosition(Math.round(Math.cos(a) * 9 * s), head - 6 + Math.round(Math.sin(a) * 3));
        });
      place(0);
      if (!still) {
        const orbit = { phase: 0 };
        this.orbits.push(orbit);
        this.scene.tweens.add({
          targets: orbit,
          phase: Math.PI * 2,
          duration: 1800,
          repeat: -1,
          onUpdate: () => place(orbit.phase),
        });
      }
    }
    if (bits & StatusBit.stunned) {
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2 + Math.PI / 4;
        const spark = add(
          this.scene.add.rectangle(
            Math.round(Math.cos(a) * 8 * s),
            head - 2 + Math.round(Math.sin(a) * 5),
            2,
            2,
            SPARK,
          ),
        );
        if (!still) {
          this.scene.tweens.add({
            targets: spark,
            alpha: 0.2,
            duration: 150,
            delay: i * 70,
            yoyo: true,
            repeat: -1,
          });
        }
      }
    }
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
    for (const m of this.marks) this.scene.tweens.killTweensOf(m);
    for (const o of this.orbits) this.scene.tweens.killTweensOf(o);
    this.root.destroy();
  }
}
