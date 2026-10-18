// The ONUB images (art plan 5; ONUB contract 5.4): the owner's 13 rooms finished to the pixel grid, the
// generated Brick Oven and proofing clean-up, the kitchen overview, the cloche and the portraits, all as
// lossless WebP at x3 in apps/client/public/assets/onub/. The cards are onub-cards.ts, the mini-game atlas
// onub-mini.ts. Every key carries `modes: ['onub']` (ruling C7).
//
//   tsx tools/sprites/onub.ts prompts            the batch prompts and references, as JSON (art plan 2.3)
//   tsx tools/sprites/onub.ts mask               build/onub/proofing-mask.png for the masked edit (5.2)
//   tsx tools/sprites/onub.ts build              every ONUB image, the cards and the atlas; the real manifest
//   tsx tools/sprites/onub.ts review             the review sheets in assets/source/review/
//
// Generations are read from git-ignored assets/external/generated/5M/<generation id>.png (and
// <id>.cut.png for a T5 cutout); a key whose pick is missing there ships its labelled greybox.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, ImageData, loadImage } from '@napi-rs/canvas';
import { encodePng, type Rgba } from './bleed.ts';
import { hexToRgb } from './oklab.ts';
import { styleFile } from './palette.ts';
import {
  boxResize,
  cleanCutout,
  crop,
  encodeWebp,
  finishIllustration,
  snap,
  upscaleNearest,
} from './pixel.ts';
import * as cards from './onub-cards.ts';
import * as mini from './onub-mini.ts';
import { REPO, referenceList } from './refs.ts';

export const SCALE = styleFile.pixel.illustrationScale;
export const CONCEPTS = 'assets/source/concepts/onub';
export const GENERATED = join(REPO, 'assets/external/generated/5M');
export const OUT = join(REPO, 'apps/client/public/assets/onub');

// ---------------------------------------------------------------- the batch file (art plan 2.2, 2.3)

export interface BatchItem {
  key: string;
  template: 'T1' | 'T4' | 'T5' | 'inpaint';
  aspect: string;
  count: number;
  subject: string;
  extraRefs: string[];
  /** Style references left out so an item stays at four (the Brick Oven drops the cellar, 5.3). */
  dropRefs?: string[];
  keyColor: string | null;
  crop: [number, number, number, number] | null;
  replace: Record<string, string> | null;
  jobs: string[];
  pick: string | null;
  /** A T5 pick's background-removed job (`remove_background`), downloaded as <pick>.cut.png. */
  cutout?: string;
  /** The subject of the later jobs of an item whose first results missed (art plan 2.7 retries). */
  retrySubject?: string;
  retryNote?: string;
}
export interface Batch {
  session: string;
  model: string;
  items: BatchItem[];
}

export function readBatch(): Batch {
  return JSON.parse(readFileSync(join(import.meta.dirname, 'batches/5M.json'), 'utf8')) as Batch;
}
export function batchItem(key: string, batch: Batch = readBatch()): BatchItem {
  const item = batch.items.find((i) => i.key === key);
  if (!item) throw new Error(`onub: no batch item ${key}`);
  return item;
}

const COMPOSITION = { T1: 'diorama', T4: 'portrait', T5: 'object' } as const;

/** The prompt fields of style.json (palette.ts types only the pixel fields). */
interface StyleText {
  styleFormula: string;
  styleAvoid: string;
  compositions: Record<string, string>;
}
const STYLE = JSON.parse(readFileSync(join(REPO, 'packages/content/data/style.json'), 'utf8')) as StyleText;

/** The prompt of art plan 2.3: composition (key colour and `replace` applied), subject, formula, avoid. */
export function assemblePrompt(item: BatchItem): string {
  if (item.template === 'inpaint') return [item.subject, STYLE.styleFormula, STYLE.styleAvoid].join('\n\n');
  let comp = STYLE.compositions[COMPOSITION[item.template]]!;
  if (item.keyColor) comp = comp.replaceAll('{KEY}', item.keyColor);
  for (const [from, to] of Object.entries(item.replace ?? {})) comp = comp.replaceAll(from, to);
  if (comp.includes('{KEY}')) throw new Error(`onub: ${item.key} needs a key colour`);
  return [comp, `Subject: ${item.subject}.`, STYLE.styleFormula, STYLE.styleAvoid].join('\n\n');
}

/**
 * The `image_references` of an item, as upload names: a cropped style reference is its `refs` output
 * name, a whole one its file name. Style references first, then the extras, duplicates and `dropRefs`
 * left out, at most four.
 */
export function referenceNames(item: BatchItem): string[] {
  const t = item.template;
  const style =
    t === 'inpaint'
      ? []
      : referenceList()
          .filter((r) => r.composition === COMPOSITION[t])
          .map((r) => (r.crop ? r.out : r.file));
  const all = [...style, ...item.extraRefs].filter((f) => !(item.dropRefs ?? []).includes(f));
  const names = [...new Set(all)].map((f) => (f.includes('/') ? f.slice(f.lastIndexOf('/') + 1) : f));
  if (names.length > 4) throw new Error(`onub: ${item.key} has ${names.length} references, at most 4`);
  return names;
}

// ---------------------------------------------------------------- keys (ONUB contract 5.4, art plan 1.3)

const DATA = join(REPO, 'packages/content/data');
const readData = <T>(name: string): T => JSON.parse(readFileSync(join(DATA, name), 'utf8')) as T;
interface OnubBalance {
  stations: Array<{ id: string; good: string[]; sabotage: string[] }>;
  cards: Record<string, { id: string; station: string; kind: 'good' | 'sabotage' }>;
}
interface OnubRoles {
  scenes: Record<string, { id: string }>;
  roles: Record<string, { id: string; scene: string }>;
}
export const BALANCE = readData<OnubBalance>('balance.onub.json');
export const ROLES = readData<OnubRoles>('roles.onub.json');
export const STATION_IDS: readonly string[] = BALANCE.stations.map((s) => s.id);
export const CARD_IDS: readonly string[] = BALANCE.stations.flatMap((s) => [...s.good, ...s.sabotage]);
export const SCENE_IDS: readonly string[] = Object.keys(ROLES.scenes);
export const ROLE_IDS: readonly string[] = Object.keys(ROLES.roles);

/** Art size of each image kind; files are x`SCALE` (1920 x 1080, 240 x 336, 192 x 192, 384 x 576). */
export const ART = { room: [640, 360], card: [80, 112], cloche: [64, 64], portrait: [128, 192] } as const;
export type ImageKind = keyof typeof ART;

export interface OnubImage {
  key: string;
  kind: ImageKind;
  /** Path under assets/onub/ without the extension (`rooms/onub_kitchen`). */
  path: string;
}

/** Every `type: image` key of contract 5.4, in manifest order. `onub_mini` (an atlas) is onub-mini.ts. */
export function onubImages(): OnubImage[] {
  const img = (key: string, kind: ImageKind, dir: string): OnubImage => ({
    key,
    kind,
    path: `${dir}/${key}`,
  });
  return [
    ...STATION_IDS.map((s) => img(`onub_station_${s}`, 'room', 'rooms')),
    ...SCENE_IDS.map((s) => img(`onub_scene_${s}`, 'room', 'rooms')),
    img('onub_kitchen', 'room', 'rooms'),
    ...CARD_IDS.map((c) => img(`onub_card_${c}`, 'card', 'cards')),
    ...STATION_IDS.map((s) => img(`onub_loc_${s}`, 'card', 'cards')),
    img('onub_card_back_role', 'card', 'cards'),
    img('onub_card_back_loc', 'card', 'cards'),
    img('onub_cloche', 'cloche', 'misc'),
    ...ROLE_IDS.map((r) => img(`onub_portrait_${r}`, 'portrait', 'portraits')),
    img('onub_baker', 'portrait', 'portraits'),
  ];
}

/** The owner's image of a station or night scene (`subBasement` -> scene_sub_basement.jpg); none for the oven. */
export function ownerSource(key: string): string | null {
  const m = /^onub_(station|scene)_(.+)$/.exec(key);
  if (!m || key === 'onub_station_oven') return null;
  return `${CONCEPTS}/${m[1]}_${m[2]!.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)}.jpg`;
}

// ---------------------------------------------------------------- fixes and finishing (art plan 5.1, 5.2)

export type Box = [number, number, number, number];
export type Point = [number, number];
export interface Fixes {
  roomCrop: Box;
  fills: Record<string, Array<{ polygon: Point[]; sample: Point }>>;
  proofingMask: { source: string; polygon: Point[] };
  locBoxes: Record<string, Box | null>;
  floorBoxes: Record<string, Box | null>;
}
export function readFixes(): Fixes {
  return JSON.parse(readFileSync(join(import.meta.dirname, 'onub-fixes.json'), 'utf8')) as Fixes;
}

/** Even-odd point-in-polygon at the pixel centre. */
function inside(poly: readonly Point[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Fill each polygon with the colour sampled at its `sample` point (a blanked label). */
export function applyFills(img: Rgba, fills: Fixes['fills'][string]): Rgba {
  const out: Rgba = { width: img.width, height: img.height, data: new Uint8Array(img.data) };
  for (const { polygon, sample } of fills) {
    const s = (sample[1] * img.width + sample[0]) * 4;
    const colour = img.data.slice(s, s + 4);
    for (let y = 0; y < img.height; y++)
      for (let x = 0; x < img.width; x++)
        if (inside(polygon, x + 0.5, y + 0.5)) out.data.set(colour, (y * img.width + x) * 4);
  }
  return out;
}

/** The mask of the proofing clean-up: white inside the polygon, black elsewhere, at the source size. */
export function proofingMask(w: number, h: number, polygon: readonly Point[]): Rgba {
  const out: Rgba = { width: w, height: h, data: new Uint8Array(w * h * 4) };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = inside(polygon, x + 0.5, y + 0.5) ? 255 : 0;
      out.data.set([v, v, v, 255], (y * w + x) * 4);
    }
  return out;
}

/** A room to its 640 x 360 grid: the 16:9 crop (or a centre crop), the label fills, the finish. */
export function finishRoom(img: Rgba, o: { crop?: Box; fills?: Fixes['fills'][string] } = {}): Rgba {
  const fixed = o.fills?.length ? applyFills(img, o.fills) : img;
  const [w, h] = ART.room;
  return finishIllustration(fixed, w, h, o.crop ? { crop: o.crop } : {});
}

/** The alpha bounding box of a cutout, or null when it is empty. */
export function alphaBox(img: Rgba): Box | null {
  let x0 = img.width;
  let y0 = img.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++)
      if (img.data[(y * img.width + x) * 4 + 3]! >= 128) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  return x1 < 0 ? null : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
}

/**
 * A cleaned cutout fitted into a w x h art box (art plan 2.4 step 5): trimmed to its subject, padded with
 * transparency to the aspect of the box less one pixel each side, finished, then given the ink outline.
 */
export function fitCutout(cut: Rgba, w: number, h: number): Rgba {
  const box = alphaBox(cut);
  if (!box) throw new Error('onub: the cutout is empty');
  const sub = crop(cut, box, 1, 1);
  const iw = w - 2;
  const ih = h - 2;
  const pw = Math.max(sub.width, Math.ceil((sub.height * iw) / ih));
  const ph = Math.max(sub.height, Math.ceil((sub.width * ih) / iw));
  const padded = paste(
    blankRgba(pw, ph),
    sub,
    Math.floor((pw - sub.width) / 2),
    Math.floor((ph - sub.height) / 2),
  );
  const done = finishIllustration(padded, iw, ih, { crop: [0, 0, pw, ph] });
  return finishIllustration(paste(blankRgba(w, h), done, 1, 1), w, h, { outline: true });
}

export function blankRgba(width: number, height: number): Rgba {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

/** `top` drawn over `base` at (x, y): opaque pixels replace, transparent ones keep the base. */
export function paste(base: Rgba, top: Rgba, x: number, y: number): Rgba {
  const out: Rgba = { width: base.width, height: base.height, data: new Uint8Array(base.data) };
  for (let r = 0; r < top.height; r++)
    for (let c = 0; c < top.width; c++) {
      const tx = x + c;
      const ty = y + r;
      if (tx < 0 || ty < 0 || tx >= base.width || ty >= base.height) continue;
      const i = (r * top.width + c) * 4;
      if (top.data[i + 3]! < 128) continue;
      out.data.set(top.data.subarray(i, i + 4), (ty * base.width + tx) * 4);
    }
  return out;
}

/** A labelled greybox at art size, snapped (contract 5.4: what a key shows until its art lands). */
export function greybox(w: number, h: number, text: string): Rgba {
  const c = createCanvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = '#2C3240';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#12141C';
  g.lineWidth = 2;
  g.strokeRect(1, 1, w - 2, h - 2);
  g.strokeStyle = '#4D5A70';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(3, 3);
  g.lineTo(w - 3, h - 3);
  g.moveTo(w - 3, 3);
  g.lineTo(3, h - 3);
  g.stroke();
  g.fillStyle = '#D9D2C2';
  g.font = `${Math.max(7, Math.min(12, Math.floor(w / 10)))}px sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2, w - 6);
  const { data } = g.getImageData(0, 0, w, h);
  return snap({ width: w, height: h, data: new Uint8Array(data) });
}

// ---------------------------------------------------------------- generations

/** A generation's downloaded file, or null when it is not in assets/external/generated/5M/. */
export async function loadGenerated(id: string | null, cut = false): Promise<Rgba | null> {
  if (!id) return null;
  const file = join(GENERATED, `${id}${cut ? '.cut' : ''}.png`);
  if (!existsSync(file)) return null;
  return decodeAny(readFileSync(file));
}

export async function decodeAny(bytes: Buffer): Promise<Rgba> {
  const image = await loadImage(bytes);
  const canvas = createCanvas(image.width, image.height);
  const g = canvas.getContext('2d');
  g.drawImage(image, 0, 0);
  const { data } = g.getImageData(0, 0, image.width, image.height);
  return { width: image.width, height: image.height, data: new Uint8Array(data) };
}

/** A T5 item's picked cutout, cleaned (art plan 2.4): the background-removed file, else the keyed one. */
export async function pickedCutout(item: BatchItem): Promise<Rgba | null> {
  const img = (await loadGenerated(item.pick, true)) ?? (await loadGenerated(item.pick));
  return img ? cleanCutout(img, item.keyColor ?? styleFile.keyColors[0]!) : null;
}

// ---------------------------------------------------------------- the kitchen overview (art plan 5.4)

/** The four rooms in quadrants (fridge, mixer / proofing, oven) and the pass centred at (320, 180). */
export function composeKitchen(rooms: Record<string, Rgba>, pass: Rgba): Rgba {
  const [w, h] = ART.room;
  let out = blankRgba(w, h);
  const order = ['fridge', 'mixer', 'proofing', 'oven'];
  order.forEach((s, i) => {
    const room = rooms[s];
    if (!room || room.width !== w / 2 || room.height !== h / 2)
      throw new Error(`onub: kitchen quadrant ${s}`);
    out = paste(out, room, (i % 2) * (w / 2), Math.floor(i / 2) * (h / 2));
  });
  return paste(out, pass, Math.round(w / 2 - pass.width / 2), Math.round(h / 2 - pass.height / 2));
}

/** A room source cropped to 16:9 and box-resized straight to a 320 x 180 quadrant, snapped. */
export function quadrant(img: Rgba, box?: Box): Rgba {
  const [w, h] = ART.room;
  return snap(boxResize(crop(img, box, 16, 9), w / 2, h / 2));
}

export { encodePng, encodeWebp, hexToRgb, upscaleNearest };

export async function writeImage(path: string, art: Rgba): Promise<void> {
  const file = join(OUT, `${path}.webp`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, await encodeWebp(upscaleNearest(art, SCALE)));
}

/** Whether the module at `url` is the CLI entry (a function, so the card and atlas modules may call it mid-cycle). */
export function isMain(url: string): boolean {
  return Boolean(process.argv[1]) && resolve(process.argv[1]!) === fileURLToPath(url);
}

// ---------------------------------------------------------------- the build

/** A room's source: the owner's image with its 16:9 crop, or a generation (centre-cropped). */
interface RoomSource {
  img: Rgba;
  crop?: Box;
}

async function roomSource(key: string, batch: Batch, fixes: Fixes): Promise<RoomSource | null> {
  const generated = batch.items.find((i) => i.key === key);
  const gen = generated ? await loadGenerated(generated.pick) : null;
  if (gen) return { img: gen };
  const file = ownerSource(key);
  if (!file) return null;
  return { img: await decodeAny(readFileSync(join(REPO, file))), crop: fixes.roomCrop };
}

async function fitted(batch: Batch, key: string, w: number, h: number): Promise<Rgba> {
  const cut = await pickedCutout(batchItem(key, batch));
  return cut ? fitCutout(cut, w, h) : greybox(w, h, key.slice(key.indexOf('#') + 1).replace(/^onub_/, ''));
}

export interface BuildResult {
  /** Keys whose art is the labelled greybox (a generation not yet picked or not downloaded). */
  greybox: string[];
}

/** Every ONUB image, the cards and the atlas, then the ONUB block of the real manifest. */
export async function build(o: { only?: 'cards' | 'mini' } = {}): Promise<BuildResult> {
  const batch = readBatch();
  const fixes = readFixes();
  const greyboxed: string[] = [];
  const write = async (path: string, art: Rgba, isGrey: boolean, key: string) => {
    if (isGrey) greyboxed.push(key);
    await writeImage(path, art);
  };
  const sources = new Map<string, RoomSource | null>();
  for (const key of [
    ...STATION_IDS.map((s) => `onub_station_${s}`),
    ...SCENE_IDS.map((s) => `onub_scene_${s}`),
  ]) {
    sources.set(key, await roomSource(key, batch, fixes));
  }

  if (!o.only) {
    for (const [key, src] of sources) {
      const art = src
        ? finishRoom(src.img, { ...(src.crop ? { crop: src.crop } : {}), fills: fixes.fills[key] ?? [] })
        : greybox(...ART.room, key);
      await write(`rooms/${key}`, art, !src, key);
    }
    const quads: Record<string, Rgba> = {};
    for (const s of STATION_IDS) {
      const src = sources.get(`onub_station_${s}`);
      quads[s] = src
        ? quadrant(src.img, src.crop)
        : greybox(ART.room[0] / 2, ART.room[1] / 2, `onub_station_${s}`);
    }
    const passItem = batchItem('onub_kitchen#pass', batch);
    const pass = await fitted(batch, passItem.key, 96, 64);
    await write(
      'rooms/onub_kitchen',
      composeKitchen(quads, pass),
      !sources.get('onub_station_oven'),
      'onub_kitchen',
    );
    const cloche = await pickedCutout(batchItem('onub_cloche', batch));
    await write(
      'misc/onub_cloche',
      cloche ? fitCutout(cloche, ...ART.cloche) : greybox(...ART.cloche, 'cloche'),
      !cloche,
      'onub_cloche',
    );
    for (const key of [...ROLE_IDS.map((r) => `onub_portrait_${r}`), 'onub_baker']) {
      const gen = await loadGenerated(batchItem(key, batch).pick);
      await write(
        `portraits/${key}`,
        gen ? finishIllustration(gen, ...ART.portrait) : greybox(...ART.portrait, key),
        !gen,
        key,
      );
    }
  }

  if (!o.only || o.only === 'cards') {
    for (const s of STATION_IDS) {
      const src = sources.get(`onub_station_${s}`);
      const floorBox = fixes.floorBoxes[s];
      const floor = src && floorBox ? cards.windowOf(src.img, floorBox) : cards.tileFloor();
      for (const id of CARD_IDS.filter((c) => BALANCE.cards[c]!.station === s)) {
        const cut = await pickedCutout(batchItem(`onub_card_${id}`, batch));
        const object = cut ? fitCutout(cut, ...cards.OBJECT_BOX) : greybox(...cards.OBJECT_BOX, id);
        await write(
          `cards/onub_card_${id}`,
          cards.ingredientCard(id, floor, object),
          !cut,
          `onub_card_${id}`,
        );
      }
      const locBox = fixes.locBoxes[s];
      const room = src && locBox ? cards.windowOf(src.img, locBox) : null;
      const window = room ?? greybox(cards.WINDOW[2], cards.WINDOW[3], s);
      await write(`cards/onub_loc_${s}`, cards.locationCard(s, window), !room, `onub_loc_${s}`);
    }
    const emblem = await pickedCutout(batchItem('onub_card_back_role#emblem', batch));
    await write(
      'cards/onub_card_back_role',
      cards.roleBack(emblem ? fitCutout(emblem, ...cards.EMBLEM_BOX) : null),
      !emblem,
      'onub_card_back_role',
    );
    await write('cards/onub_card_back_loc', cards.locationBack(), false, 'onub_card_back_loc');
  }

  if (!o.only || o.only === 'mini') {
    const objects = new Map<string, Rgba>();
    for (const f of mini.MINI_FRAMES) {
      if (!f.item || objects.has(f.item)) continue;
      const cut = await pickedCutout(batchItem(f.item, batch));
      if (!cut) greyboxed.push(f.item);
      objects.set(f.item, cut ? fitCutout(cut, f.w, f.h) : greybox(f.w, f.h, f.name.replace(/\/\d$/, '')));
    }
    const { page, json } = mini.packMini(mini.miniPixels((item) => objects.get(item)!));
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, 'onub_mini-0.png'), encodePng(page));
    writeFileSync(join(OUT, 'onub_mini.json'), `${JSON.stringify(json, null, 1)}\n`);
  }

  if (!o.only) writeManifest(join(REPO, 'apps/client/public/assets/manifest.json'), onubManifest('webp'));
  return { greybox: greyboxed };
}

// ---------------------------------------------------------------- review sheets (art plan 1.6, 7)

export const REVIEW = join(REPO, 'assets/source/review');

/** A shipped image back at art size (every ONUB file is x`SCALE` nearest). */
export async function shipped(path: string): Promise<Rgba> {
  const img = await decodeAny(readFileSync(join(OUT, `${path}.webp`)));
  const out = blankRgba(img.width / SCALE, img.height / SCALE);
  for (let y = 0; y < out.height; y++)
    for (let x = 0; x < out.width; x++)
      out.data.set(
        img.data.subarray(
          (y * SCALE * img.width + x * SCALE) * 4,
          (y * SCALE * img.width + x * SCALE) * 4 + 4,
        ),
        (y * out.width + x) * 4,
      );
  return out;
}

/** Tiles on a navy sheet: each tile at (x, y), the sheet then scaled by `k` with nearest. */
function sheet(
  w: number,
  h: number,
  tiles: Array<[Rgba, number, number]>,
  k: number,
  labels: Array<[string, number, number]> = [],
): Buffer {
  let page = blankRgba(w, h);
  for (let i = 0; i < page.data.length; i += 4) page.data.set([0x12, 0x14, 0x1c, 255], i);
  for (const [img, x, y] of tiles) page = paste(page, img, x, y);
  const big = upscaleNearest(page, k);
  if (!labels.length) return encodePng(big);
  const c = createCanvas(big.width, big.height);
  const g = c.getContext('2d');
  g.putImageData(new ImageData(new Uint8ClampedArray(big.data), big.width, big.height), 0, 0);
  g.font = `bold ${12 * k}px sans-serif`;
  for (const [text, x, y] of labels) {
    g.fillStyle = '#12141C';
    g.fillRect(x * k, y * k, (text.length * 8 + 6) * k, 16 * k);
    g.fillStyle = '#F2B33D';
    g.fillText(text, (x + 3) * k, (y + 12) * k);
  }
  return c.toBuffer('image/png');
}

/** The review sheets: Gate C, the Brick Oven candidates, rooms, cards, portraits and the atlas. */
export async function review(): Promise<string[]> {
  const batch = readBatch();
  const out = new Map<string, Buffer>();
  const room = (k: string) => shipped(`rooms/${k}`);
  const card = (k: string) => shipped(`cards/${k}`);
  const portrait = (k: string) => shipped(`portraits/${k}`);

  // Gate C (art plan 7, item 2): the finished fridge, two cards, the cloche, the Boulanger's portrait
  out.set(
    'gate-c-onub.png',
    sheet(
      640,
      568,
      [
        [await room('onub_station_fridge'), 0, 0],
        [await card('onub_card_t55Flour'), 8, 400],
        [await card('onub_card_sawdust'), 96, 400],
        [await shipped('misc/onub_cloche'), 196, 448],
        [await portrait('onub_portrait_boulanger'), 280, 368],
      ],
      2,
    ),
  );

  // the Brick Oven pick (art plan 5.3, 7 item 3): four candidates, finished, beside the three stations
  const oven = batchItem('onub_station_oven', batch);
  const tiles: Array<[Rgba, number, number]> = [];
  const labels: Array<[string, number, number]> = [];
  for (const [i, id] of oven.jobs.entries()) {
    const gen = await loadGenerated(id);
    if (!gen) continue;
    tiles.push([finishRoom(gen), (i % 2) * 648, Math.floor(i / 2) * 368]);
    labels.push([`${'ABCD'[i]}  ${id.slice(0, 8)}`, (i % 2) * 648 + 4, Math.floor(i / 2) * 368 + 4]);
  }
  for (const [i, s] of ['fridge', 'mixer', 'proofing'].entries()) {
    const src = await roomSource(`onub_station_${s}`, batch, readFixes());
    if (src) tiles.push([quadrant(src.img, src.crop), 1296, i * 188]);
  }
  out.set('gate-c-oven.png', sheet(1616, 728, tiles, 1, labels));

  const rooms = [
    ...STATION_IDS.map((s) => `onub_station_${s}`),
    ...SCENE_IDS.map((s) => `onub_scene_${s}`),
    'onub_kitchen',
  ];
  out.set(
    'onub-rooms.png',
    sheet(
      4 * 648,
      4 * 368,
      await Promise.all(
        rooms.map(async (k, i): Promise<[Rgba, number, number]> => [
          await room(k),
          (i % 4) * 648,
          Math.floor(i / 4) * 368,
        ]),
      ),
      1,
    ),
  );
  const cardKeys = onubImages()
    .filter((i) => i.kind === 'card')
    .map((i) => i.key);
  out.set(
    'onub-cards.png',
    sheet(
      9 * 88,
      3 * 120,
      await Promise.all(
        cardKeys.map(async (k, i): Promise<[Rgba, number, number]> => [
          await card(k),
          (i % 9) * 88 + 4,
          Math.floor(i / 9) * 120 + 4,
        ]),
      ),
      2,
    ),
  );
  const portraits = onubImages()
    .filter((i) => i.kind === 'portrait')
    .map((i) => i.key);
  out.set(
    'onub-portraits.png',
    sheet(
      8 * 136,
      2 * 200,
      await Promise.all(
        portraits.map(async (k, i): Promise<[Rgba, number, number]> => [
          await portrait(k),
          (i % 8) * 136 + 4,
          Math.floor(i / 8) * 200 + 4,
        ]),
      ),
      2,
    ),
  );
  out.set(
    'onub-mini.png',
    sheet(512, 512, [[await decodeAny(readFileSync(join(OUT, 'onub_mini-0.png'))), 0, 0]], 2),
  );

  mkdirSync(REVIEW, { recursive: true });
  for (const [name, bytes] of out) writeFileSync(join(REVIEW, name), bytes);
  console.log(`onub: review sheets -> ${[...out.keys()].join(', ')}`);
  return [...out.keys()];
}

// ---------------------------------------------------------------- manifests (ONUB contract 5.4, ruling C7)

export interface OnubManifestEntry {
  key: string;
  type: 'image' | 'multiatlas';
  url: string;
  path?: string;
  filter?: 'nearest';
  modes: ['onub'];
}

/** The ONUB block of a manifest: every image key, then `onub_mini`; `ext` is webp (real) or png (placeholder). */
export function onubManifest(ext: 'webp' | 'png'): OnubManifestEntry[] {
  return [
    ...onubImages().map((i) => ({
      key: i.key,
      type: 'image' as const,
      url: `onub/${i.path}.${ext}`,
      modes: ['onub'] as ['onub'],
    })),
    {
      key: 'onub_mini',
      type: 'multiatlas',
      url: 'onub/onub_mini.json',
      path: 'onub/',
      filter: 'nearest',
      modes: ['onub'],
    },
  ];
}

/** Replace the ONUB block (and any loft key) of a manifest file with `block`, appended at the end. */
export function writeManifest(file: string, block: OnubManifestEntry[]): void {
  const doc = JSON.parse(readFileSync(file, 'utf8')) as { entries: Array<{ key: string }> };
  const gone = new Set(['loft_backdrop', 'prop_bedroll', 'prop_bedroll_self']);
  doc.entries = [...doc.entries.filter((e) => !e.key.startsWith('onub_') && !gone.has(e.key)), ...block];
  writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
}

if (isMain(import.meta.url)) {
  const cmd = process.argv[2] ?? 'build';
  if (cmd === 'prompts') {
    const items = readBatch().items.map((i) => ({
      key: i.key,
      count: i.count,
      aspect: i.aspect,
      refs: referenceNames(i),
      prompt: assemblePrompt(i),
    }));
    console.log(JSON.stringify(items, null, 1));
  } else if (cmd === 'mask') {
    const { proofingMask: m } = readFixes();
    const src = await decodeAny(readFileSync(join(REPO, m.source)));
    const file = join(REPO, 'build/onub/proofing-mask.png');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, encodePng(proofingMask(src.width, src.height, m.polygon)));
    console.log(`onub: mask -> ${file}`);
  } else if (cmd === 'build') {
    const { greybox: g } = await build();
    console.log(
      `onub: built ${onubImages().length} images and onub_mini; greybox: ${g.join(', ') || 'none'}`,
    );
  } else if (cmd === 'review') {
    await review();
  } else {
    console.error('usage: tsx onub.ts [prompts|mask|build|review]');
    process.exit(2);
  }
}
