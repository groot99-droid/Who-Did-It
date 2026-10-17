import Phaser from 'phaser';
import palette from '@wdi/content/data/palette.json';
import traits from '@wdi/content/data/traits.json';
import { type Direction, dirFromVector } from '@wdi/shared/direction';
import { AnimId } from './animIds';

// One player: a body sprite with scarf and hat overlays (docs/SPRITES.md 3), a shadow and a nameplate.
// Animation keys are `<pass>/<body>/<anim>/<dir>`; every layer plays the same tail so they stay in step.
// Nothing here knows a role: only the dealt traits and the shared walk/idle ids reach the client.

export const BODY = 'villager';
const BODY_TEXTURE = `char_${BODY}`;
const OVERLAY_TEXTURE = `ovl_${BODY}`;
export const HATS = ['hat_cap', 'hat_bowler', null] as const;
export const SCARF_TINT = traits.axes.scarf.values.map((v) =>
  Number.parseInt(palette.colors[v.tint as keyof typeof palette.colors].slice(1), 16),
);
const SCARF_SHAPE = ['◆', '●', '■']; // diamond, circle, square (nameplateShape)
export const HEIGHT_SCALE = traits.axes.height.values.map((v) => v.spriteScale);

/** Facing as a direction name from the server's yaw (clockwise from screen up). */
export function dirFromYaw(yaw: number): Direction {
  return dirFromVector(Math.sin(yaw), -Math.cos(yaw));
}

export interface PlayerLook {
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
  private anim = '';
  private hatPass: string | null = null;
  private bloodOn = false;
  private readonly plateColor: string;

  constructor(
    private readonly scene: Phaser.Scene,
    name: string,
    look: PlayerLook,
    isSelf: boolean,
  ) {
    this.hasArt = scene.textures.exists(BODY_TEXTURE);
    this.plateColor = isSelf ? palette.colors.mustard : palette.colors.bone;
    const shadow = scene.add.ellipse(0, 0, 38, 14, 0x12141c, 0.4);
    this.body = scene.add.sprite(0, 0, this.hasArt ? BODY_TEXTURE : '__DEFAULT');
    this.scarf = scene.add.sprite(
      0,
      0,
      scene.textures.exists(OVERLAY_TEXTURE) ? OVERLAY_TEXTURE : '__DEFAULT',
    );
    this.hat = scene.add.sprite(0, 0, scene.textures.exists(OVERLAY_TEXTURE) ? OVERLAY_TEXTURE : '__DEFAULT');
    this.blood = scene.add.sprite(
      0,
      0,
      scene.textures.exists(OVERLAY_TEXTURE) ? OVERLAY_TEXTURE : '__DEFAULT',
    );
    this.blood.setVisible(false);
    this.body.setVisible(this.hasArt);
    this.scarf.setTint(SCARF_TINT[look.scarf] ?? SCARF_TINT[0]);
    this.hatPass = HATS[look.hat] ?? null;
    const scale = HEIGHT_SCALE[look.height] ?? 1;
    const shape = SCARF_SHAPE[look.scarf] ?? SCARF_SHAPE[0];
    this.plate = scene.add
      .text(0, -Math.round(130 * scale), `${shape} ${name}`, {
        fontFamily: 'Inter, sans-serif',
        fontSize: '15px',
        color: this.plateColor,
        stroke: palette.colors.ink,
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1);
    const art = scene.add.container(0, 0, [this.body, this.scarf, this.hat, this.blood]).setScale(scale);
    this.root = scene.add.container(0, 0, [shadow, art, this.plate]);
    if (!this.hasArt) {
      // No texture at all: a bare capsule keeps the game playable.
      art.add(scene.add.rectangle(0, -40, 28, 80, 0x6f7a8c).setStrokeStyle(3, 0x12141c));
    }
  }

  /** Poses the sprite for a facing and an animation id; `transit` hides the nameplate at the door. */
  pose(dir: Direction, animId: number, transit: boolean): void {
    this.plate.setVisible(!transit);
    if (!this.hasArt) return;
    const clip =
      animId === AnimId.walk
        ? 'walk'
        : animId === AnimId.swing
          ? 'swing'
          : animId === AnimId.die
            ? 'die'
            : 'idle';
    const tail = `${BODY}/${clip}/${dir}`;
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

  setPosition(x: number, y: number): void {
    this.root.setPosition(x, y).setDepth(y);
  }

  destroy(): void {
    this.root.destroy();
  }
}
