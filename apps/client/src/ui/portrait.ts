import looksJson from '@wdi/content/data/looks.json';
import palette from '@wdi/content/data/palette.json';
import rolesJson from '@wdi/content/data/roles.json';
import traits from '@wdi/content/data/traits.json';

// Draws a meeting portrait from the villager atlas and the public traits (docs/SPRITES.md 3): the body
// frame, the scarf overlay multiplied by the scarf colour, the hat overlay. The faction and the role never
// reach this file. With no atlas loaded the portrait is the name's initial on slate.
//
// Round 5 (GDD 3.17): a portrait is drawn by public look id. When the look's card portrait (`portrait_<lookId>`,
// `looks.json`) is loaded it is drawn whole; until then the trait portrait above stands in, so a screen can call
// `drawPortrait` with a look id today and gets the art as soon as the key exists.

type RoleRow = { look?: string | null; cover?: boolean; faction?: string };
type LookRow = { name: string; portrait: string };
const ROLES = rolesJson.roles as Record<string, RoleRow | undefined>;
const LOOKS = looksJson.looks as Record<string, LookRow | undefined>;

/** The look id on a role's card (`roles.json`), or '' for a card with no character. */
export const roleLook = (roleId: string): string => ROLES[roleId]?.look ?? '';
/** Whether the role wears another card's look (Killer, Accomplice, Drifter; GDD 3.17). */
export const isCoverRole = (roleId: string): boolean => ROLES[roleId]?.cover === true;
/** The display name of a look ("the Baker"), or '' for an unknown id. */
export const lookName = (lookId: string): string => LOOKS[lookId]?.name ?? '';
/** The manifest key of a look's card portrait (`portrait_baker`), or '' for an unknown id. */
export const portraitKey = (lookId: string): string => LOOKS[lookId]?.portrait ?? '';

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
  lookId = '',
): void {
  canvas.width = SIZE.w;
  canvas.height = SIZE.h;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return;
  const key = portraitKey(lookId);
  if (key !== '' && textures !== null && textures.exists(key)) {
    try {
      const frame = textures.getFrame(key, '__BASE');
      const image = frame.source.image;
      if (image !== null) {
        ctx.fillStyle = css('slate');
        ctx.fillRect(0, 0, SIZE.w, SIZE.h);
        ctx.drawImage(image, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, 0, 0, SIZE.w, SIZE.h);
        return;
      }
    } catch {
      // Fall through to the trait portrait.
    }
  }
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
