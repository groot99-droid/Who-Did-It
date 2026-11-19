// P2b done test (docs/round11/tiles-brief.md 5): every wall, roof and solid the sprite world draws has a texture.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const WALLS = join(here, '..', 'public', 'assets', 'world3', 'walls');
const SCENES = join(here, '..', '..', '..', 'packages', 'content', 'data', 'scenes');

type Index = {
  tile: number;
  surfaces: Record<string, { file: string; source: string; licence: string }>;
  solids: Record<string, string>;
  buildings: Record<string, { wall: string; roof: string }>;
};
const index = JSON.parse(readFileSync(join(WALLS, 'index.json'), 'utf8')) as Index;

function sceneFiles(): string[] {
  return readdirSync(SCENES).filter((n) => n.endsWith('.json') && !n.endsWith('.nav.json'));
}

describe('world3 wall textures', () => {
  it('lists only files that exist, 64 x 64, CC0', () => {
    for (const [name, row] of Object.entries(index.surfaces)) {
      const b = readFileSync(join(WALLS, row.file));
      expect([b.readUInt32BE(16), b.readUInt32BE(20)], name).toEqual([index.tile, index.tile]);
      expect(row.licence).toBe('CC0-1.0');
    }
  });
  it('has a surface for every building art id the scenes use', () => {
    const arts = new Set<string>();
    for (const f of sceneFiles()) {
      const scene = JSON.parse(readFileSync(join(SCENES, f), 'utf8')) as { buildings?: { art: string }[] };
      for (const b of scene.buildings ?? []) arts.add(b.art);
    }
    expect(arts.size).toBeGreaterThan(0);
    for (const art of arts) expect(index.buildings[art], art).toBeDefined();
  });
  it('resolves every building and solid to a surface file (or the ground sod)', () => {
    const names = [
      ...Object.values(index.solids),
      ...Object.values(index.buildings).flatMap((b) => [b.wall, b.roof]),
    ];
    for (const n of names) {
      if (n === 'ground:moss') continue;
      expect(index.surfaces[n], n).toBeDefined();
      expect(existsSync(join(WALLS, index.surfaces[n]!.file)), n).toBe(true);
    }
  });
});
