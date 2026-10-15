import type Phaser from 'phaser';
import palette from '@wdi/content/data/palette.json';

const T = 64;
export const GREYBOX_KEY = 'tiles_greybox';

// gid order of tools/grid/export.ts GREYBOX: wall, door, spawn, hide, body, gate.
const TILES: Array<{ fill: string; mark?: (g: CanvasRenderingContext2D) => void }> = [
  { fill: palette.colors.slate },
  { fill: palette.colors.mustard, mark: (g) => g.fillRect(24, 16, 16, 40) },
  { fill: palette.colors.fog },
  { fill: palette.colors.teal, mark: (g) => g.fillRect(16, 16, 32, 32) },
  { fill: palette.colors.blood, mark: (g) => g.fillRect(16, 16, 32, 32) },
  { fill: palette.colors.fog, mark: (g) => g.fillRect(8, 28, 48, 8) },
];

/** Draws the greybox tileset (walls, doors, spots) once at boot; it needs no art. */
export function ensureGreybox(textures: Phaser.Textures.TextureManager): void {
  if (textures.exists(GREYBOX_KEY)) return;
  const tex = textures.createCanvas(GREYBOX_KEY, T * TILES.length, T);
  if (!tex) return;
  const g = tex.getContext();
  TILES.forEach((tile, i) => {
    g.fillStyle = tile.fill;
    g.fillRect(i * T, 0, T, T);
    g.strokeStyle = palette.colors.ink;
    g.lineWidth = 3;
    g.strokeRect(i * T + 1.5, 1.5, T - 3, T - 3);
    if (tile.mark) {
      g.save();
      g.translate(i * T, 0);
      g.fillStyle = palette.colors.ink;
      tile.mark(g);
      g.restore();
    }
  });
  tex.refresh();
}
