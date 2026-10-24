import type Phaser from 'phaser';
import palette from '@wdi/content/data/palette.json';
import { isoDepth, toScreen } from '@wdi/shared/iso';
import { BIAS } from './iso';
import { drawScale } from './texels';
import { BODY, HATS, HEIGHT_SCALE, type PlayerLook, SCARF_TINT } from './PlayerView';

const BODY_TEXTURE = `char_${BODY}`;
const OVERLAY_TEXTURE = `ovl_${BODY}`;

/** Last frame of an animation (`char/villager/die/s`) as `[texture key, frame name]`, or null without art. */
function lastFrame(scene: Phaser.Scene, animKey: string): [string, string] | null {
  const frames = scene.anims.get(animKey)?.frames;
  const f = frames?.[frames.length - 1]?.frame;
  return f ? [f.texture.key, String(f.name)] : null;
}

/**
 * A body lying where a player was killed: the last `die` frame of the villager facing south, wearing the
 * victim's scarf and hat from their public traits (a body is recognised by its traits, A30). Without the
 * art it is a flat mark so the verb stays playable. `x`/`y` are the server's world pixel centre, projected here.
 */
export class BodyView {
  readonly root: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, x: number, y: number, look: PlayerLook) {
    const shadow = scene.add.ellipse(0, 0, 54, 27, 0x12141c, 0.45);
    const parts: Phaser.GameObjects.GameObject[] = [shadow];
    const base = scene.textures.exists(BODY_TEXTURE) ? lastFrame(scene, 'char/villager/die/s') : null;
    // Drawn at the texel factor of the body texture (HD, A164) times the trait's height.
    const art = scene.add
      .container(0, 0)
      .setScale((HEIGHT_SCALE[look.height] ?? 1) * drawScale(BODY_TEXTURE));
    if (base) {
      art.add(scene.add.sprite(0, 0, base[0], base[1]));
      const scarf = lastFrame(scene, 'scarf/villager/die/s');
      if (scarf && scene.textures.exists(OVERLAY_TEXTURE)) {
        art.add(scene.add.sprite(0, 0, scarf[0], scarf[1]).setTint(SCARF_TINT[look.scarf] ?? SCARF_TINT[0]));
      }
      const hatPass = HATS[look.hat] ?? null;
      const hat = hatPass === null ? null : lastFrame(scene, `${hatPass}/villager/die/s`);
      if (hat) art.add(scene.add.sprite(0, 0, hat[0], hat[1]));
    } else {
      // No texture: a body-length bar in the scarf colour with an X, readable on any ground.
      art.add(scene.add.rectangle(0, -10, 74, 24, 0x6f7a8c).setStrokeStyle(3, 0x12141c));
      art.add(scene.add.rectangle(-22, -10, 14, 24, SCARF_TINT[look.scarf] ?? SCARF_TINT[0]));
      art.add(
        scene.add
          .text(6, -10, 'X', {
            fontFamily: 'Oswald, sans-serif',
            fontSize: '20px',
            color: palette.colors.bone,
          })
          .setOrigin(0.5),
      );
    }
    parts.push(art);
    const s = toScreen(x, y);
    this.root = scene.add.container(s.x, s.y, parts).setDepth(isoDepth(x, y) + BIAS.body);
  }

  destroy(): void {
    this.root.destroy();
  }
}
