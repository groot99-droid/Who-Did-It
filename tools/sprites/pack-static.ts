// Packs a static sheet rendered by tools/blender: clues, props and vfx (build_props.py, build_vfx.py;
// docs/SPRITES.md 8) and, since round 5, the world atlases `iso_kit_<theme>` (build_kit.py; SPRITES 10.13)
// after the pixel finish. Pivots come from the render manifest; `vfx` also gets the Phaser anims file.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { alphaBleed, decodePng, encodePng } from './bleed.ts';
import type { PhaserAnim } from './gen-anims.ts';
import { FPS, staticFrameNames } from './keys.ts';
import { finishEnabled } from './palette.ts';
import { packAsync } from 'free-tex-packer-core';
import {
  PACK_OPTIONS,
  atlasJson,
  packFrames,
  writeFiles,
  type AtlasTexture,
  type MultiAtlas,
  type PackInput,
  type PackResult,
} from './pack.ts';

export type StaticAtlas =
  'clues' | 'props' | 'vfx' | `iso_kit_${string}` | `props_${string}` | `bld_${string}`;

/** A building or multi-tile prop slice (SPRITES 10.5): `<stem>#<dx>_<dy>`. */
export const SLICE_RE = /^[A-Za-z][A-Za-z0-9_]*#\d+_\d+$/;

/** The kit frame families of SPRITES 10.13 that a theme ships (art plan 3.3): 11, four variants each. */
export const KIT_FRAMES: ReadonlyArray<readonly [string, string]> = [
  ['wall', 'full'],
  ['wall', 'half'],
  ['wall', 'stub'],
  ['cliff', 'full'],
  ['cliff', 'half'],
  ['cliff', 'stub'],
  ['tree', 'full'],
  ['tree', 'stub'],
  ['boulder', 'full'],
  ['fence', 'full'],
  ['stack', 'full'],
];
/** Art cell (packed px, w x h) of each kit family; the pivot is (w / 2, h - 16). */
export const KIT_CELLS: Readonly<Record<string, readonly [number, number]>> = {
  'wall/full': [64, 112],
  'wall/half': [64, 72],
  'wall/stub': [64, 48],
  'cliff/full': [64, 112],
  'cliff/half': [64, 72],
  'cliff/stub': [64, 48],
  'tree/full': [96, 144],
  'tree/stub': [64, 48],
  'boulder/full': [64, 64],
  'fence/full': [64, 56],
  'stack/full': [64, 80],
};
export const KIT_THEMES = ['harbour', 'timber'] as const;

/** The 44 frame names of an `iso_kit_<theme>` atlas: `<kind>/<height>/<0-3>`, sorted. */
export function kitFrameNames(): string[] {
  return KIT_FRAMES.flatMap(([k, h]) => [0, 1, 2, 3].map((v) => `${k}/${h}/${v}`)).sort();
}

/**
 * The boot atlas `props` since round 5 (art plan 3.5-3.7): shared props, spots and the 20 portal frames, and since
 * round 8 the four HQ tiers every role station shares (`prop_hq_<tier>`, motion.md 2).
 */
export const PROPS_FRAMES: readonly string[] = [
  'portal_boarded_e',
  'portal_boarded_s',
  'portal_boarded_sill',
  'portal_cave_mouth_e',
  'portal_cave_mouth_s',
  'portal_cave_mouth_sill',
  'portal_crawl_e',
  'portal_crawl_s',
  'portal_crawl_sill',
  'portal_door_e',
  'portal_door_s',
  'portal_door_sill',
  'portal_drop',
  'portal_forest_gate_e',
  'portal_forest_gate_s',
  'portal_forest_gate_sill',
  'portal_hatch',
  'portal_stairs_e',
  'portal_stairs_s',
  'portal_stairs_sill',
  'prop_hq_0',
  'prop_hq_1',
  'prop_hq_2',
  'prop_hq_3',
  'prop_kitChest',
  'prop_lanternPost_lit',
  'prop_lanternPost_unlit',
  'prop_noticeBoard',
  'prop_pump',
  'spot_behindCounter',
  'spot_brush',
  'spot_crawlspace',
  'spot_hollowTree',
  'spot_sump',
  'spot_timberCrib',
  'spot_underBed',
  'spot_wardrobe',
];

/** Each map's own atlas `props_<mapId>` (art plan 3.5, 3.6). */
export const MAP_PROPS_FRAMES: Readonly<Record<string, readonly string[]>> = {
  props_hollowmere: [
    'prop_basin',
    'prop_bell',
    'prop_bench',
    'prop_candle',
    'prop_clock',
    'prop_crepe',
    'prop_dartboard',
    'prop_deadLoaf',
    'prop_den',
    'prop_drowned_lantern',
    'prop_fence',
    'prop_flourBin',
    'prop_flour_sacks',
    'prop_gasPocket',
    'prop_goat',
    'prop_green_lamp',
    'prop_keyCache',
    'prop_ledger',
    'prop_letter_box',
    'prop_lockedDoor',
    'prop_oil_barrel',
    'prop_ore_cart',
    'prop_oven',
    'prop_photos',
    'prop_planks',
    'prop_plate',
    'prop_portrait',
    'prop_rope',
    'prop_safe',
    'prop_scarecrow',
    'prop_shelf',
    'prop_tin_crate',
    'prop_window',
    'spot_atticHatch',
    'spot_bog',
    'spot_breadRack',
    'spot_cart',
    'spot_charcoalPit',
    'spot_confessional',
    'spot_cratePile',
    'spot_crates',
    'spot_cryptNiche',
    'spot_curtain',
    'spot_dumpSpot',
    'spot_flourSacks',
    'spot_hayPile',
    'spot_hedge',
    'spot_herbLoft',
    'spot_hollowLog',
    'spot_kegStack',
    'spot_oreChute',
    'spot_pantry',
    'spot_poolNiche',
    'spot_reeds',
    'spot_stalagmite',
    'spot_trayStack',
    'spot_trunk',
    'spot_wineRack',
    'spot_woodBox',
    // Round 8 (8J, art.md 4.2): St Brannock's.
    'prop_stained_glass',
    'prop_stained_glass_e',
    'prop_candle_stand',
    'prop_hymn_board',
    'prop_memorial',
    'prop_lectern',
    'prop_pulpit',
    'prop_font',
    'prop_votive_rack',
    'prop_alms_box',
    'prop_flower_stand',
    'prop_altar',
    'prop_bookcase',
    'prop_bookcase_b',
    'prop_tin_cabinet',
    'prop_tin_cabinet_b',
    'prop_fireplace_e',
    'prop_armchair',
    'prop_lamp_table',
    'prop_boot_rack',
    'prop_coat_stand',
    'prop_vane_portrait',
    'prop_draped_window',
    'prop_sideboard',
    'prop_nightstand',
    'prop_dressing_table',
    'prop_washstand',
    'prop_blanket_chest',
    'prop_linen_press',
    // The Drowned Lantern and its back room.
    'prop_bar_counter',
    'prop_bar_counter_taps',
    'prop_bar_counter_lamp',
    'prop_bottle_shelf',
    'prop_bottle_shelf_b',
    'prop_tide_chart',
    'prop_chalkboard',
    'prop_ship_wheel',
    'prop_inglenook_e',
    'prop_keg_rack',
    'prop_settle',
    'prop_log_basket',
    'prop_rug',
    'prop_sawdust',
    'prop_tavern_table',
    'prop_tavern_table_b',
    'prop_barrel',
    'prop_bottle_crate',
    'prop_piano',
    'prop_store_shelf',
    'prop_store_shelf_b',
    'prop_card_table',
    'prop_blackMarket',
    // Widow Vane's.
    'prop_tea_table',
    'prop_writing_desk',
    'prop_birdcage',
    // Mallory's apothecary (and Hollowmere's shop counter, 8C's `counter` kind).
    'prop_counter',
    'prop_counter_case',
    'prop_counter_case_b',
    'prop_apoth_drawers',
    'prop_jar_shelf',
    'prop_jar_shelf_b',
    'prop_herb_rack',
    'prop_still',
    'prop_mortar_table',
    'prop_show_globe',
    'prop_leech_jar',
    'prop_drying_frame',
    // Crumb's Ovens and its four rooms.
    'prop_bread_shelf',
    'prop_bread_shelf_b',
    'prop_peel_rack',
    'prop_bread_case',
    'prop_cooling_rack',
    'prop_bread_basket',
    'prop_dough_trough',
    'prop_shaping_table',
    'prop_water_bucket',
    'prop_milk_churn',
    'prop_cold_shelf',
    'prop_compressor',
    'prop_couche_rack',
    'prop_wall_bulb',
  ],
  props_blackpine: [
    'prop_anvil',
    'prop_basin',
    'prop_bell',
    'prop_flume',
    'prop_gearing',
    'prop_ledger_desk',
    'prop_ore_cart_0',
    'prop_oven',
    'prop_pegs',
    'prop_plank_stack',
    'prop_powder_kegs',
    'prop_refuge_table',
    'prop_safe',
    'prop_shelves',
    'prop_tally_board',
    'prop_telephone',
    'prop_tin_crate',
    'prop_tool_rack',
    'spot_barrel',
    'spot_bunk',
    'spot_coalBin',
    'spot_logChute',
    'spot_logPile',
    'spot_oldStope',
    'spot_oreBin',
    'spot_oreCart',
    'spot_orePillar',
    'spot_pool',
    'spot_rootCellar',
    'spot_sawdustPile',
    'spot_strongroom',
    'spot_woodBox',
    // The dressing kit (round 8, 8K, kind `dressing`).
    'prop_axe_block',
    'prop_barrel',
    'prop_bench',
    'prop_bucket',
    'prop_cart',
    'prop_chair',
    'prop_coat_rack',
    'prop_crate',
    'prop_crates',
    'prop_cupboard',
    'prop_firewood',
    'prop_footlocker',
    'prop_grindstone',
    'prop_lamp_post',
    'prop_log',
    'prop_ore_pile',
    'prop_rock_pile',
    'prop_rope_coil',
    'prop_sacks',
    'prop_saw_horse',
    'prop_side_table',
    'prop_signpost',
    'prop_stool',
    'prop_stump',
    'prop_timber_set',
    'prop_wall_lamp',
    'prop_wall_shelf',
    'prop_wheelbarrow',
    'prop_window',
    'prop_workbench',
    // Round 8 (8K, A166): BlackPine's own economy frames for 8C's and 8D's kinds.
    'prop_altar',
    'prop_bank',
    'prop_blackMarket',
    'prop_counter',
    'prop_rack',
  ],
};

/**
 * Maps whose single-tile prop frames (`MAP_PROPS_FRAMES`) pack into the map's building atlas `bld_<mapId>`, which
 * keeps only its multi-tile slices in `props_<mapId>` (round 8, 8J): the building atlas's last page has the room,
 * and the client looks a prop up in `props_<mapId>`, then `bld_<mapId>`, then `props` (SPRITES 3). `packStatic`
 * refuses a `bld_` pack that these frames would give a new or larger page.
 */
export const BLD_PROPS_MAPS: ReadonlySet<string> = new Set(['hollowmere']);

/** The `MAP_PROPS_FRAMES` frames a map's building atlas packs (none for a map outside `BLD_PROPS_MAPS`). */
export const bldPropFrames = (map: string): readonly string[] =>
  BLD_PROPS_MAPS.has(map) ? (MAP_PROPS_FRAMES[`props_${map}`] ?? []) : [];

/** The clue keys of SPRITES 8 plus Hunger's glowing footprints (art plan 3.8): 24 frames. */
export function clueFrameNames(): string[] {
  const glow = ['s', 'm', 't'].map((h) => `clue_footprint_${h}_glow`);
  return [...staticFrameNames('clues'), ...glow].sort();
}

/** Page caps (px) of the round-5 world atlases (art plan 1.4, SPRITES 10.14). */
export function pageCap(atlas: StaticAtlas): readonly [number, number] | null {
  if (atlas.startsWith('iso_kit_') || atlas.startsWith('props')) return [1024, 1024];
  if (atlas.startsWith('bld_')) return [2048, 1024];
  if (atlas === 'clues') return [512, 512];
  return null;
}

/**
 * `packFrames` (pack.ts, the ASSETS.md 6.3 settings) with a smaller page: the packer picks the smallest
 * power-of-two page up to `w` x `h`, so a world atlas never grows past its budget cap in one dimension.
 * With the pixel finish on (`on`, the art style's finish) there is no extrude ring.
 */
export async function packCapped(
  textureName: string,
  inputs: PackInput[],
  w: number,
  h: number,
  on: boolean = finishEnabled('main'),
): Promise<PackResult> {
  const files = [...inputs]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((i) => ({ path: `${i.name}.png`, contents: i.png }));
  // Extrude guards linear filtering only, and the packer blends its ring: a finished page drawn with
  // nearest filtering keeps every pixel a world colour without it. Unfinished (the low-poly style), the
  // ring takes one pixel of the padding, so a frame costs the same room in both styles (art plan 1.4, 1.9).
  const extrude = on ? 0 : PACK_OPTIONS.extrude;
  const padding = PACK_OPTIONS.padding - extrude;
  const options = { ...PACK_OPTIONS, width: w, height: h, textureName, extrude, padding };
  const out = await packAsync(files, options as Parameters<typeof packAsync>[1]);
  const raw = new Map(out.filter((f) => f.name.endsWith('.png')).map((f) => [f.name, f.buffer]));
  const textures: AtlasTexture[] = [];
  let meta: MultiAtlas['meta'] = { app: '', version: '' };
  for (const f of out.filter((f) => f.name.endsWith('.json'))) {
    const page = JSON.parse(f.buffer.toString('utf8')) as MultiAtlas;
    textures.push(...page.textures);
    meta = page.meta;
  }
  textures.sort((a, b) => (a.image < b.image ? -1 : 1));
  const pages = new Map<string, Buffer>();
  textures.forEach((t, i) => {
    const png = raw.get(t.image);
    if (!png) throw new Error(`packer page ${t.image} missing`);
    t.image = `${textureName}-${i}.png`;
    // Re-encoded (lossless): the packer's own PNG writer leaves a quarter of the bytes on the table (8J, round 8).
    pages.set(t.image, encodePng(decodePng(png)));
    t.frames.sort((a, b) => (a.filename < b.filename ? -1 : 1));
  });
  const packed = textures.reduce((n, t) => n + t.frames.length, 0);
  if (packed !== inputs.length) throw new Error(`packed ${packed} of ${inputs.length} frames`);
  return { atlas: { textures, meta }, pages };
}

/**
 * `packCapped` on the smallest page that still holds every frame on one page: the packer's own sizing can
 * grow both sides of a page it could have kept at half the area (round 8, 8J: the 6-page budget, SPRITES 10.14).
 */
export async function packSmallest(
  textureName: string,
  inputs: PackInput[],
  w: number,
  h: number,
  on: boolean = finishEnabled('main'),
): Promise<PackResult> {
  const best = await packCapped(textureName, inputs, w, h, on);
  if (best.atlas.textures.length !== 1) return best;
  const area = (r: PackResult) => r.atlas.textures[0]!.size.w * r.atlas.textures[0]!.size.h;
  let out = best;
  for (const [cw, ch] of [
    [w / 2, h],
    [w, h / 2],
    [w / 2, h / 2],
  ] as const) {
    if (cw * ch >= area(out)) continue;
    const r = await packCapped(textureName, inputs, cw, ch, on);
    if (r.atlas.textures.length === 1 && area(r) < area(out)) out = r;
  }
  return out;
}

/** The frame names a static atlas must hold exactly. */
export function expectedFrames(atlas: StaticAtlas): string[] {
  if (atlas.startsWith('iso_kit_')) return kitFrameNames();
  if (atlas === 'props') return [...PROPS_FRAMES].sort();
  if (atlas === 'clues') return clueFrameNames();
  if (atlas.startsWith('props_')) {
    const bld = bldPropFrames(atlas.slice('props_'.length));
    return (MAP_PROPS_FRAMES[atlas] ?? []).filter((f) => !bld.includes(f)).sort();
  }
  if (atlas.startsWith('bld_')) return [...bldPropFrames(atlas.slice('bld_'.length))].sort();
  return staticFrameNames(atlas as 'vfx');
}

export interface StaticManifest {
  version: number;
  atlas: StaticAtlas;
  /** Render px per display px of the frames (the HD style, hd.ts); absent or 1 otherwise. */
  factor?: number;
  frames: Record<
    string,
    { file: string; cell: number | [number, number]; pivot?: [number, number]; clipped?: boolean }
  >;
}

/** Pivot (pivot px / cell) on every frame whose render recorded one; others stay centred. */
export function applyStaticPivots(atlas: MultiAtlas, manifest: StaticManifest): void {
  for (const t of atlas.textures) {
    for (const f of t.frames) {
      const entry = manifest.frames[f.filename];
      if (!entry) throw new Error(`no manifest entry for ${f.filename}`);
      if (!entry.pivot) continue;
      const round4 = (v: number) => Math.round(v * 10000) / 10000;
      f.pivot = { x: round4(entry.pivot[0] / f.sourceSize.w), y: round4(entry.pivot[1] / f.sourceSize.h) };
    }
  }
}

/** One anim per `<anim>/<nnn>` group, 12 fps, played once (Phaser holds the last frame). */
export function staticAnims(texture: string, frameNames: string[]): { anims: PhaserAnim[] } {
  const groups = new Map<string, string[]>();
  for (const name of [...frameNames].sort()) {
    const anim = name.slice(0, name.lastIndexOf('/'));
    groups.set(anim, [...(groups.get(anim) ?? []), name]);
  }
  return {
    anims: [...groups].map(([key, frames]) => ({
      key,
      frames: frames.map((frame) => ({ key: texture, frame })),
      frameRate: FPS,
      repeat: 0,
    })),
  };
}

/**
 * A building atlas that also holds a map's props (BLD_PROPS_MAPS): the slices pack as they would alone, then the
 * last page is packed again with the props, on a page no larger. Its other pages are unchanged; props that would
 * need a new or larger page are refused.
 */
async function packIntoLastPage(
  name: string,
  inputs: PackInput[],
  props: string[],
  cap: readonly [number, number],
  on: boolean,
): Promise<PackResult> {
  const alone = await packSmallest(
    name,
    inputs.filter((i) => !props.includes(i.name)),
    cap[0],
    cap[1],
    on,
  );
  const n = alone.atlas.textures.length;
  const last = alone.atlas.textures[n - 1]!;
  const onLast = new Set([...last.frames.map((f) => f.filename), ...props]);
  const tail = await packCapped(
    name,
    inputs.filter((i) => onLast.has(i.name)),
    last.size.w,
    last.size.h,
    on,
  ).catch(() => null);
  if (tail?.atlas.textures.length !== 1) throw new Error(`${name}: its props need a new or larger page`);
  const page = tail.atlas.textures[0]!;
  const image = `${name}-${n - 1}.png`;
  const pages = new Map(alone.pages);
  pages.set(image, tail.pages.get(page.image)!);
  return {
    atlas: { textures: [...alone.atlas.textures.slice(0, -1), { ...page, image }], meta: alone.atlas.meta },
    pages,
  };
}

/**
 * Pack a static sheet; the frame set must match the keys of docs/SPRITES.md 8 exactly. `texels` (render px
 * per display px, the HD style's factor) scales the page cap with the frames.
 */
export async function packStatic(
  manifest: StaticManifest,
  inputs: PackInput[],
  on: boolean = finishEnabled('main'),
  texels = 1,
  subset = false,
  want: string[] = expectedFrames(manifest.atlas),
): Promise<Map<string, Buffer>> {
  // Slices are whatever the footprints cut (slice.ts): a building atlas holds only slices, a map's prop
  // atlas its frame list plus the slices of its multi-tile props. A `subset` (a partial render for review)
  // packs what it holds.
  const got = inputs.map((i) => i.name).sort();
  const sliced = manifest.atlas.startsWith('bld_') || manifest.atlas.startsWith('props_');
  const missing = subset ? [] : want.filter((n) => !got.includes(n));
  const extra = got.filter((n) => !want.includes(n) && !(sliced && SLICE_RE.test(n)));
  if (missing.length || extra.length) {
    throw new Error(`${manifest.atlas}: missing [${missing.join(', ')}], unexpected [${extra.join(', ')}]`);
  }
  const cap = pageCap(manifest.atlas);
  const { atlas, pages } =
    manifest.atlas.startsWith('bld_') && want.length && cap
      ? await packIntoLastPage(manifest.atlas, inputs, want, [cap[0] * texels, cap[1] * texels], on)
      : cap
        ? await packSmallest(manifest.atlas, inputs, cap[0] * texels, cap[1] * texels, on)
        : await packFrames(manifest.atlas, inputs);
  applyStaticPivots(atlas, manifest);
  const out = new Map<string, Buffer>(pages);
  out.set(`${manifest.atlas}.json`, Buffer.from(atlasJson(atlas, true)));
  if (manifest.atlas === 'vfx') {
    out.set('vfx.anims.json', Buffer.from(`${JSON.stringify(staticAnims('vfx', got), null, 1)}\n`));
  }
  return out;
}

/** Read a render folder (`<dir>/manifest.json` + PNGs); every frame is alpha-bled like the characters. */
export function readStatic(dir: string): { manifest: StaticManifest; inputs: PackInput[] } {
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as StaticManifest;
  const inputs = Object.entries(manifest.frames).map(([name, f]) => ({
    name,
    png: alphaBleed(readFileSync(join(dir, f.file))),
  }));
  return { manifest, inputs };
}

// CLI: tsx tools/sprites/pack-static.ts <render dir, e.g. build/render/props> <out dir> [--subset]
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const subset = process.argv.includes('--subset');
  const [renderDir, outDir] = process.argv.slice(2).filter((a) => a !== '--subset');
  if (!renderDir || !outDir) {
    console.error('usage: tsx pack-static.ts <render dir> <out dir> [--subset]');
    process.exit(2);
  }
  const { manifest, inputs } = readStatic(renderDir);
  const files = await packStatic(manifest, inputs, undefined, 1, subset);
  writeFiles(outDir, files);
  console.log(`pack-static: ${[...files.keys()].join(', ')} -> ${outDir}`);
}
