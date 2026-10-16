import palette from '@wdi/content/data/palette.json';
import traits from '@wdi/content/data/traits.json';

// Draws a meeting portrait from the villager atlas and the public traits (docs/SPRITES.md 3): the body
// frame, the scarf overlay multiplied by the scarf colour, the hat overlay. The faction and the role never
// reach this file. With no atlas loaded the portrait is the name's initial on slate.

export interface PortraitLook {
  height: number;
  scarf: number;
  hat: number;
}

/** The slice of Phaser's texture manager the painter uses, so tests and the mock need no Phaser. */
export interface PortraitTextures {
  exists(key: string): boolean;
  getFrame(
    key: string,
    frame: string,
  ): {
    source: { image: CanvasImageSource | null };
    cutX: number;
    cutY: number;
    cutWidth: number;
    cutHeight: number;
    x: number;
    y: number;
    realWidth: number;
    realHeight: number;
  };
}

const BODY = 'villager';
const SIZE = { w: 128, h: 192 };
/** Standing pose facing the viewer, first frame. */
const POSE = `${BODY}/idle/s/000`;
const SCARF_TINT = traits.axes.scarf.values.map((v) => palette.colors[v.tint as keyof typeof palette.colors]);
const HAT_PASS = traits.axes.hat.values.map((v) => v.overlayPass);
const HEIGHT_SCALE = traits.axes.height.values.map((v) => v.spriteScale);

const css = (name: keyof typeof palette.colors) => palette.colors[name];

function initial(ctx: CanvasRenderingContext2D, name: string): void {
  ctx.fillStyle = css('slate');
  ctx.fillRect(0, 0, SIZE.w, SIZE.h);
  ctx.fillStyle = css('bone');
  ctx.font = `600 ${Math.round(SIZE.h / 2)}px Oswald, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name.charAt(0).toUpperCase() || '?', SIZE.w / 2, SIZE.h / 2);
}

export function drawPortrait(
  canvas: HTMLCanvasElement,
  textures: PortraitTextures | null,
  look: PortraitLook,
  name: string,
): void {
  canvas.width = SIZE.w;
  canvas.height = SIZE.h;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return;
  const bodyKey = `char_${BODY}`;
  const ovlKey = `ovl_${BODY}`;
  if (textures === null || !textures.exists(bodyKey)) return initial(ctx, name);
  try {
    ctx.fillStyle = css('slate');
    ctx.fillRect(0, 0, SIZE.w, SIZE.h);
    const body = textures.getFrame(bodyKey, `char/${POSE}`);
    if (body.source.image === null) return initial(ctx, name);
    // One transform for every layer: the body's trimmed box sits on the floor of the slot, scaled by
    // height so Short and Tall differ. All layers share the 256 px source box, so they stay aligned.
    const k = (SIZE.h * 0.78 * (HEIGHT_SCALE[look.height] ?? 1)) / body.cutHeight;
    const dx = (SIZE.w - body.cutWidth * k) / 2 - body.x * k;
    const dy = SIZE.h - 10 - (body.y + body.cutHeight) * k;
    const layer = (frame: ReturnType<PortraitTextures['getFrame']>, tint?: string) => {
      const image = frame.source.image;
      if (image === null) return;
      const x = dx + frame.x * k;
      const y = dy + frame.y * k;
      const w = frame.cutWidth * k;
      const h = frame.cutHeight * k;
      if (tint === undefined) {
        ctx.drawImage(image, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, x, y, w, h);
        return;
      }
      const tmp = document.createElement('canvas');
      tmp.width = SIZE.w;
      tmp.height = SIZE.h;
      const t = tmp.getContext('2d');
      if (t === null) return;
      t.drawImage(image, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, x, y, w, h);
      t.globalCompositeOperation = 'multiply';
      t.fillStyle = tint;
      t.fillRect(0, 0, SIZE.w, SIZE.h);
      t.globalCompositeOperation = 'destination-in';
      t.drawImage(image, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, x, y, w, h);
      ctx.drawImage(tmp, 0, 0);
    };
    layer(body);
    if (textures.exists(ovlKey)) {
      layer(textures.getFrame(ovlKey, `scarf/${POSE}`), SCARF_TINT[look.scarf] ?? SCARF_TINT[0]);
      const hat = HAT_PASS[look.hat];
      if (hat) layer(textures.getFrame(ovlKey, `${hat}/${POSE}`));
    }
  } catch {
    // A missing frame must not break the vote: fall back to the initial.
    initial(ctx, name);
  }
}
