import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PALETTE } from '../placeholder.ts';

const ICONS = join(import.meta.dirname, '../../../apps/client/public/assets/ui/icons');
const SPRITES = join(import.meta.dirname, '../../../docs/SPRITES.md');
const palette = new Set(Object.values(PALETTE).map((h) => h.toUpperCase()));

describe('UI icons (docs/SPRITES.md 9)', () => {
  const files = readdirSync(ICONS).filter((f) => f.endsWith('.svg')).sort();

  it('match the keys listed in SPRITES.md', () => {
    const section = readFileSync(SPRITES, 'utf8').split('## 9. UI icons')[1]!;
    const listed = [...section.matchAll(/`(icon_[a-z_]+)`/g)].map((m) => m[1]).sort();
    expect(files.map((f) => f.slice(0, -4))).toEqual(listed);
  });

  for (const f of files) {
    it(`${f} is on the 48 px grid with 2 px ink strokes and palette colours only`, () => {
      const svg = readFileSync(join(ICONS, f), 'utf8');
      expect(svg).toContain('viewBox="0 0 48 48"');
      expect(svg).toContain('stroke="#12141C"');
      for (const [, w] of svg.matchAll(/stroke-width="([^"]+)"/g)) expect(w).toBe('2');
      for (const [hex] of svg.matchAll(/#[0-9A-Fa-f]{3,8}\b/g)) expect(palette.has(hex.toUpperCase())).toBe(true);
      expect(svg).not.toMatch(/<text|font-family|<image|href=/);
    });
  }
});
