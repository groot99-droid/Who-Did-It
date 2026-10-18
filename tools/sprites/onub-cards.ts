// The ONUB cards (art plan 5.5): an 80 x 112 art grid drawn in code (R5) around generated objects (R3) and
// station rooms (R4), shipped x3 as lossless WebP in assets/onub/cards/. The text band is left blank: the
// client writes each card's name and text (balance.onub.json `cards`) over it.
//
// Each builder takes a scale `k`: 1 is the 8-bit style (art size, finished; the build upscales it), and the
// low-poly style (art plan 1.9) passes 3, drawing the code-drawn parts at art size and enlarging them with
// nearest while the window, floor and object arrive smooth at k times their box, never snapped.
//
//   tsx tools/sprites/onub-cards.ts      every card face and both backs (also run by `onub.ts build`)
import { type Rgba } from './bleed.ts';
import { hexToRgb } from './oklab.ts';
import { paletteFile } from './palette.ts';
import { boxResize, crop, snap, upscaleNearest } from './pixel.ts';
import { BALANCE, blankRgba, build, isMain, paste, type Box } from './onub.ts';

/** The card's art grid (onub.ts `ART.card`; the module cycle keeps it a literal here). */
export const CARD_W = 80;
export const CARD_H = 112;
/** The picture window and the text band (contract for 5C: the band is (4, 72) to (76, 108)). */
export const WINDOW: Box = [4, 4, 72, 64];
export const BAND: Box = [4, 72, 72, 36];
/** The art box of an Ingredient card's object and of the role back's emblem. */
export const OBJECT_BOX = [56, 48] as const;
export const EMBLEM_BOX = [48, 48] as const;

/** The frame ramp of each station (art plan 5.5); Sabotage cards take `moss`. */
export const STATION_RAMP: Record<string, string> = {
  fridge: 'moon',
  mixer: 'plaster',
  proofing: 'brass',
  oven: 'brick',
};

const RAMPS = paletteFile.world.ramps;
const ramp = (name: string): string[] => {
  const r = RAMPS[name];
  if (!r) throw new Error(`onub-cards: no ramp ${name}`);
  return r;
};
const rgb = (hex: string): [number, number, number, number] => [...hexToRgb(hex), 255];

function set(img: Rgba, x: number, y: number, hex: string): void {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  img.data.set(rgb(hex), (y * img.width + x) * 4);
}
function fill(img: Rgba, [x, y, w, h]: Box, hex: string): void {
  for (let r = y; r < y + h; r++) for (let c = x; c < x + w; c++) set(img, c, r, hex);
}

/** The 1 px ink border and the 3 px frame (light, mid, dark from the outside in) of a card. */
export function cardFrame(rampName: string): Rgba {
  const img = blankRgba(CARD_W, CARD_H);
  const r = ramp(rampName);
  const tones = [
    r[Math.min(r.length - 1, Math.ceil(r.length * 0.75))]!,
    r[Math.floor(r.length / 2)]!,
    r[1] ?? r[0]!,
  ];
  fill(img, [0, 0, CARD_W, CARD_H], '#12141C');
  tones.forEach((hex, i) => fill(img, [1 + i, 1 + i, CARD_W - 2 - 2 * i, CARD_H - 2 - 2 * i], hex));
  // the gap between the window and the band takes the frame's dark tone
  fill(img, [4, 68, 72, 4], tones[2]!);
  return img;
}

/** The blank paper band: bone `#D9D2C2` with a 1 px `#B2AA99` rule at the top. */
function band(img: Rgba): void {
  fill(img, BAND, '#D9D2C2');
  fill(img, [BAND[0], BAND[1], BAND[2], 1], '#B2AA99');
}

/** A Sabotage card's corner: a 6-pixel crack in the frame and a rot blot (public by design, 5.5). */
function rot(img: Rgba): void {
  const crack: Array<[number, number]> = [
    [78, 2],
    [77, 3],
    [77, 4],
    [76, 5],
    [75, 5],
    [75, 6],
  ];
  for (const [x, y] of crack) set(img, x, y, '#12141C');
  const moss = ramp('moss');
  const blot: Array<[number, number, number]> = [
    [72, 6, 2],
    [73, 6, 3],
    [74, 7, 2],
    [72, 7, 3],
    [73, 7, 4],
    [71, 8, 2],
    [72, 8, 3],
    [73, 8, 2],
    [72, 9, 1],
  ];
  for (const [x, y, t] of blot) set(img, x, y, moss[t]!);
}

/** Every pixel darkened (the floor behind an object), then snapped back onto the palette when `finish`. */
export function darken(img: Rgba, k = 0.45, finish = true): Rgba {
  const out: Rgba = { width: img.width, height: img.height, data: new Uint8Array(img.data) };
  for (let i = 0; i < out.data.length; i += 4)
    for (let c = 0; c < 3; c++) out.data[i + c] = Math.round(out.data[i + c]! * k);
  return finish ? snap(out) : out;
}

/** A crop of a room source box-resized to the window at scale `k` (`box` in source pixels); snapped at 1. */
export function windowOf(source: Rgba, box: Box, k = 1): Rgba {
  const out = boxResize(crop(source, box, 1, 1), WINDOW[2] * k, WINDOW[3] * k);
  return k === 1 ? snap(out) : out;
}

/** The blank band, and a Sabotage card's rot, on a transparent art-size layer at scale `k`. */
function overlay(sabotage: boolean, k: number): Rgba {
  const img = blankRgba(CARD_W, CARD_H);
  band(img);
  if (sabotage) rot(img);
  return upscaleNearest(img, k);
}

/** A code-drawn floor for a station whose room is missing (a pick not downloaded): brick tiles, at scale `k`. */
export function tileFloor(rampName = 'brick', k = 1): Rgba {
  return upscaleNearest(tiles(rampName), k);
}
function tiles(rampName: string): Rgba {
  const img = blankRgba(WINDOW[2], WINDOW[3]);
  const r = ramp(rampName);
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) {
      const row = Math.floor(y / 8);
      const seam = y % 8 === 7 || (x + (row % 2) * 8) % 16 === 15;
      set(img, x, y, seam ? r[0]! : r[1 + ((row + Math.floor(x / 16)) % 2)]!);
    }
  return img;
}

/** An Ingredient card: frame, the darkened floor of its station, the object centred in the window. */
export function ingredientCard(cardId: string, floor: Rgba, object: Rgba | null, k = 1): Rgba {
  const card = BALANCE.cards[cardId];
  if (!card) throw new Error(`onub-cards: no card ${cardId}`);
  const sabotage = card.kind === 'sabotage';
  let img = upscaleNearest(cardFrame(sabotage ? 'moss' : STATION_RAMP[card.station]!), k);
  img = paste(img, darken(floor, 0.45, k === 1), WINDOW[0] * k, WINDOW[1] * k);
  if (object) {
    const x = WINDOW[0] * k + Math.floor((WINDOW[2] * k - object.width) / 2);
    img = paste(img, object, x, WINDOW[1] * k + Math.floor((WINDOW[3] * k - object.height) / 2), k > 1);
  }
  return paste(img, overlay(sabotage, k), 0, 0);
}

/** A Location card: the station frame and the station room in the window. */
export function locationCard(stationId: string, room: Rgba, k = 1): Rgba {
  const img = paste(
    upscaleNearest(cardFrame(STATION_RAMP[stationId]!), k),
    room,
    WINDOW[0] * k,
    WINDOW[1] * k,
  );
  return paste(img, overlay(false, k), 0, 0);
}

/** The inside of a back: everything within the ink border and a 1 px brass inner border. */
function backBase(field: (x: number, y: number) => string): Rgba {
  const img = blankRgba(CARD_W, CARD_H);
  fill(img, [0, 0, CARD_W, CARD_H], '#12141C');
  for (let y = 1; y < CARD_H - 1; y++) for (let x = 1; x < CARD_W - 1; x++) set(img, x, y, field(x, y));
  const brass = ramp('brass');
  for (let x = 3; x < CARD_W - 3; x++) {
    set(img, x, 3, brass[2]!);
    set(img, x, CARD_H - 4, brass[2]!);
  }
  for (let y = 3; y < CARD_H - 3; y++) {
    set(img, 3, y, brass[2]!);
    set(img, CARD_W - 4, y, brass[2]!);
  }
  return img;
}

/** `onub_card_back_role`: a wood parquet field and the emblem (a greybox medallion until it lands). */
export function roleBack(emblem: Rgba | null, k = 1): Rgba {
  const wood = ramp('wood');
  const img = backBase((x, y) => {
    const block = (Math.floor(x / 8) + Math.floor(y / 8)) % 2;
    const grain = block ? y % 8 : x % 8;
    return grain === 7 ? wood[1]! : wood[block ? 3 : 4]!;
  });
  const [ew, eh] = EMBLEM_BOX;
  const ex = (CARD_W - ew) / 2;
  const ey = (CARD_H - eh) / 2;
  if (emblem) return paste(upscaleNearest(img, k), emblem, ex * k, ey * k, k > 1);
  const brass = ramp('brass');
  for (let y = 0; y < eh; y++)
    for (let x = 0; x < ew; x++) {
      const d = Math.hypot(x - ew / 2 + 0.5, y - eh / 2 + 0.5);
      if (d < ew / 2 - 1) set(img, ex + x, ey + y, d > ew / 2 - 3 ? brass[2]! : brass[0]!);
    }
  return upscaleNearest(img, k);
}

/** `onub_card_back_loc`: stone flags and a brass glyph of four rooms round a square, at scale `k`. */
export function locationBack(k = 1): Rgba {
  return upscaleNearest(locationGlyph(), k);
}
function locationGlyph(): Rgba {
  const stone = ramp('stone');
  const img = backBase((x, y) => {
    const row = Math.floor(y / 12);
    const seam = y % 12 === 11 || (x + (row % 2) * 9) % 18 === 17;
    return seam ? stone[1]! : stone[2 + ((row * 3 + Math.floor((x + (row % 2) * 9) / 18)) % 3)]!;
  });
  const brass = ramp('brass');
  const cx = CARD_W / 2;
  const cy = CARD_H / 2;
  const square = (x: number, y: number, s: number, hex: string, solid = false) => {
    for (let r = 0; r < s; r++)
      for (let c = 0; c < s; c++)
        if (solid || r === 0 || c === 0 || r === s - 1 || c === s - 1) set(img, x + c, y + r, hex);
  };
  // four rooms (10 px) at the corners of a 26 px square, the pass (8 px) in the middle
  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    square(cx + dx * 9 - 5, cy + dy * 9 - 5, 10, brass[2]!);
    square(cx + dx * 9 - 4, cy + dy * 9 - 4, 8, brass[0]!, true);
  }
  square(cx - 4, cy - 4, 8, brass[2]!, true);
  square(cx - 14, cy - 14, 28, brass[1]!);
  return img;
}

if (isMain(import.meta.url)) await build({ only: 'cards' });
