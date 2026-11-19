// The figure drops (round 11, F2 to Fn): copies packed figure atlases into apps/client/public/assets/figures/ and
// rewrites that folder's manifest from the atlases it holds. A figure ships as its `char_<look>.json` and pages only:
// its idle and walk are picked by frame key (`char/<look>/<anim>/<dir>/<nnn>`), so the packer's anims file, whose
// animations name today's `char_<look>` texture, stays behind.
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIGURES_DIR = join(import.meta.dirname, '../../apps/client/public/assets/figures');
const ATLAS_RE = /^char_([a-z][a-z0-9]*)\.json$/;

export interface FigureEntry {
  key: string;
  type: 'multiatlas';
  url: string;
  path: string;
  filter: 'linear';
  maps: string[];
}

/**
 * A figure's manifest row (_proposed_): key `fig_<look>` so it never meets today's `char_<look>` in Phaser's texture
 * cache, `linear` as an unfinished HD page, and `maps: []` so no loader takes it at boot or with a match until the
 * sprite world (R3) asks for it.
 */
export const figureEntry = (look: string): FigureEntry => ({
  key: `fig_${look}`,
  type: 'multiatlas',
  url: `char_${look}.json`,
  path: '',
  filter: 'linear',
  maps: [],
});

/** The looks whose atlases a folder holds, sorted. */
export const figureLooks = (dir: string): string[] =>
  readdirSync(dir)
    .map((f) => ATLAS_RE.exec(f)?.[1])
    .filter((l): l is string => !!l)
    .sort();

export function writeManifest(dir: string): void {
  const manifest = { version: 1, art: 'figures', entries: figureLooks(dir).map(figureEntry) };
  writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

/** Copies every packed atlas of `packed` (its JSON and the pages it names) into `dir`, then rewrites the manifest. */
export function dropFigures(packed: string, dir = FIGURES_DIR): string[] {
  mkdirSync(dir, { recursive: true });
  const looks = figureLooks(packed);
  for (const look of looks) {
    const file = `char_${look}.json`;
    const atlas = JSON.parse(readFileSync(join(packed, file), 'utf8')) as { textures: { image: string }[] };
    for (const t of atlas.textures) copyFileSync(join(packed, t.image), join(dir, t.image));
    copyFileSync(join(packed, file), join(dir, file));
  }
  writeManifest(dir);
  return looks;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const packed = process.argv[2];
  if (!packed) throw new Error('usage: tsx figures.ts <packed-dir>');
  console.log(`figures: ${dropFigures(resolve(packed)).join(', ')} -> ${FIGURES_DIR}`);
}
