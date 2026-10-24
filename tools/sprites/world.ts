// The 5K world art in every art style of style.json `artStyles` (DECISIONS A79, art plan 1.9): from the raw
// renders of tools/blender (made once), each style finishes (`style.pixelFinish`) and packs the ground
// tilesets, kits, props, clues, buildings and map thumbnails into `apps/client/public/assets/<style.root>`,
// and a style other than the root one gets those keys in its own `manifest.json` with `style.filter`.
//
//   tsx world.ts <render dir> <assets dir> [--work <dir>] [--style <id>]
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng } from './bleed.ts';
import { writeFiles } from './pack.ts';
import {
  KIT_THEMES,
  SLICE_RE,
  bldPropFrames,
  packStatic,
  readStatic,
  type StaticManifest,
} from './pack-static.ts';
import { artStyle, artStyles, type ArtStyle } from './palette.ts';
import { finishFolder } from './pixel.ts';
import { thumbnail } from './review-world.ts';
import { sliceFolder } from './slice.ts';
import { GROUND_NAMES, GROUND_THEMES, buildTileset } from './tileset.ts';

export const WORLD_MAPS = ['hollowmere', 'blackpine'] as const;

/** The manifest keys 5K ships (art plan 3.11), each in every art style. */
export const WORLD_KEYS: readonly string[] = [
  'clues',
  'props',
  ...WORLD_MAPS.flatMap((m) => [`props_${m}`, `bld_${m}`, `thumb_${m}`]),
  ...GROUND_THEMES.flatMap((t) => [`iso_ground_${t}`, `iso_kit_${t}`]),
];

interface Entry {
  key: string;
  filter?: 'linear' | 'nearest';
  [k: string]: unknown;
}
interface Manifest {
  version: number;
  art: string;
  entries: Entry[];
}

/** Finish one render folder into `work`, slice the multi-tile renders into it, and pack it to `out`. */
async function pack(
  src: string,
  work: string,
  out: string,
  on: boolean,
  o: { display?: boolean; sliced?: string; keep?: (frame: string) => boolean } = {},
) {
  rmSync(work, { recursive: true, force: true });
  if (existsSync(src)) finishFolder(src, work, { display: o.display === true, on });
  const target = join(work, 'manifest.json');
  if (o.sliced) {
    const { files, manifest } = sliceFolder(o.sliced, on);
    writeFiles(work, files);
    if (existsSync(target)) {
      const old = JSON.parse(readFileSync(target, 'utf8')) as StaticManifest;
      // The sliced render names the atlas; a props render merged into it (BLD_PROPS_MAPS) does not rename it.
      manifest.frames = { ...old.frames, ...manifest.frames };
    }
    writeFileSync(target, `${JSON.stringify(manifest, null, 1)}\n`);
  }
  if (o.keep) {
    const m = JSON.parse(readFileSync(target, 'utf8')) as StaticManifest;
    m.frames = Object.fromEntries(Object.entries(m.frames).filter(([name]) => o.keep!(name)));
    writeFileSync(target, `${JSON.stringify(m, null, 1)}\n`);
  }
  const { manifest, inputs } = readStatic(work);
  writeFiles(out, await packStatic(manifest, inputs, on));
}

/** Every 5K key of one art style, from the raw renders in `render`. */
export async function buildStyle(
  style: ArtStyle,
  render: string,
  assets: string,
  work: string,
): Promise<void> {
  const on = style.pixelFinish;
  const root = join(assets, style.root);
  const tmp = join(work, style.id);
  mkdirSync(join(root, 'ground'), { recursive: true });
  for (const theme of GROUND_THEMES) {
    const sheet = buildTileset(
      (char, v) => decodePng(readFileSync(join(render, 'ground', theme, `${GROUND_NAMES[char]}_${v}.png`))),
      on,
    );
    writeFileSync(join(root, 'ground', `iso_ground_${theme}.png`), encodePng(sheet));
  }
  for (const theme of KIT_THEMES) {
    const kit = `iso_kit_${theme}`;
    await pack(join(render, kit), join(tmp, kit), join(root, 'kit'), on);
  }
  await pack(join(render, 'props'), join(tmp, 'props'), join(root, 'props'), on);
  await pack(join(render, 'clues'), join(tmp, 'clues'), join(root, 'clues'), on, { display: true });
  for (const map of WORLD_MAPS) {
    // BLD_PROPS_MAPS: those props are rendered with the map's others and packed with its buildings.
    const bld = bldPropFrames(map);
    await pack(join(render, `props_${map}`), join(tmp, `props_${map}`), join(root, 'props'), on, {
      sliced: join(render, `props_${map}_sliced`),
      keep: (f) => !bld.includes(f),
    });
    await pack(
      bld.length ? join(render, `props_${map}`) : '',
      join(tmp, `bld_${map}`),
      join(root, 'buildings'),
      on,
      {
        sliced: join(render, `bld_${map}`),
        keep: (f) => bld.includes(f) || SLICE_RE.test(f),
      },
    );
  }
  mkdirSync(join(root, 'thumbs'), { recursive: true });
  for (const map of WORLD_MAPS)
    writeFileSync(join(root, 'thumbs', `thumb_${map}.webp`), await thumbnail(root, map, on));
  if (style.root !== '') writeStyleManifest(style, assets);
}

/**
 * The style's manifest: the 5K entries of the root manifest re-skinned with the style's filter, merged into
 * whatever other sessions' keys the file already holds (SPRITES 5).
 */
export function writeStyleManifest(style: ArtStyle, assets: string): void {
  const base = JSON.parse(readFileSync(join(assets, 'manifest.json'), 'utf8')) as Manifest;
  const file = join(assets, style.root, 'manifest.json');
  const prior: Manifest = existsSync(file)
    ? (JSON.parse(readFileSync(file, 'utf8')) as Manifest)
    : { version: base.version, art: style.id, entries: [] };
  const mine = base.entries
    .filter((e) => WORLD_KEYS.includes(e.key))
    .map((e) => (e.filter ? { ...e, filter: style.filter } : { ...e }));
  const keep = prior.entries.filter((e) => !WORLD_KEYS.includes(e.key));
  const order = new Map(base.entries.map((e, i) => [e.key, i]));
  const entries = [...keep, ...mine].sort((a, b) => (order.get(a.key) ?? 1e9) - (order.get(b.key) ?? 1e9));
  writeFileSync(file, `${JSON.stringify({ version: base.version, art: style.id, entries }, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args.splice(i, 2)[1] : undefined;
  };
  const work = opt('--work') ?? join(fileURLToPath(new URL('../../build/finished-styles', import.meta.url)));
  const only = opt('--style');
  const [render, assets] = args;
  if (!render || !assets) {
    console.error('usage: tsx world.ts <render dir> <assets dir> [--work <dir>] [--style <id>]');
    process.exit(2);
  }
  for (const style of only ? [artStyle(only)] : artStyles()) {
    await buildStyle(style, render, assets, work);
    console.log(`world: ${style.id} -> ${join(assets, style.root)}`);
  }
}
