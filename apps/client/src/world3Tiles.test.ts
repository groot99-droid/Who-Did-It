// P2a done test (docs/round11/tiles-brief.md 5): every floor character the scenes use has a ground tile, or a named gap.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FLOOR_MATERIALS } from '@wdi/content';

const here = dirname(fileURLToPath(import.meta.url));
const TILES = join(here, '..', 'public', 'assets', 'world3', 'tiles');
const SCENES = join(here, '..', '..', '..', 'packages', 'content', 'data', 'scenes');

type Row = { name: string; file: string; source: string; licence: string };
type Index = {
  tile: number;
  variants: number;
  themes: Record<string, Record<string, Row>>;
  gaps: { theme: string; char: string }[];
};
const index = JSON.parse(readFileSync(join(TILES, 'index.json'), 'utf8')) as Index;

/** The scenes' floor characters, `O` (deep water) included; solids and `P` have no ground tile. */
function usedChars(): Set<string> {
  const used = new Set<string>();
  for (const f of readdirSync(SCENES).filter((n) => n.endsWith('.json') && !n.endsWith('.nav.json'))) {
    const scene = JSON.parse(readFileSync(join(SCENES, f), 'utf8')) as { material?: string[] };
    for (const row of scene.material ?? []) for (const ch of row) used.add(ch);
  }
  return new Set([...used].filter((ch) => ch === 'O' || ch in FLOOR_MATERIALS));
}

function pngSize(file: string): [number, number] {
  const b = readFileSync(file);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

describe('world3 ground tiles', () => {
  const themes = Object.keys(index.themes);
  it('covers both ground themes', () => {
    expect(themes.sort()).toEqual(['harbour', 'timber']);
  });
  it('has a tile or a named gap for every floor character a scene uses, in each theme', () => {
    const gaps = new Set(index.gaps.map((g) => `${g.theme}:${g.char}`));
    for (const theme of themes)
      for (const ch of usedChars())
        expect(
          index.themes[theme]?.[ch] ?? (gaps.has(`${theme}:${ch}`) ? {} : undefined),
          `${theme} ${ch}`,
        ).toBeDefined();
  });
  it('uses the FLOOR_MATERIALS names and lists only files that exist at 256 x 64', () => {
    for (const theme of themes)
      for (const [ch, row] of Object.entries(index.themes[theme] ?? {})) {
        expect(row.name, `${theme} ${ch}`).toBe(
          ch === 'O' ? 'water' : FLOOR_MATERIALS[ch as keyof typeof FLOOR_MATERIALS],
        );
        const file = join(TILES, row.file);
        expect(existsSync(file), row.file).toBe(true);
        expect(pngSize(file)).toEqual([index.tile * index.variants, index.tile]);
        expect(row.licence).toBe('CC0-1.0');
      }
  });
});
