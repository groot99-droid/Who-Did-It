import palette from '@wdi/content/data/palette.json';

export type PaletteToken = keyof typeof palette.colors;

/** A palette token as a Phaser colour integer. */
export const tokenColour = (token: PaletteToken): number =>
  Number.parseInt(palette.colors[token].slice(1), 16);

/** `colour` with each channel scaled by `f` (clamped), for the faces of a greybox block. */
export function shade(colour: number, f: number): number {
  const c = (shift: number) => Math.min(255, Math.round(((colour >> shift) & 0xff) * f));
  return (c(16) << 16) | (c(8) << 8) | c(0);
}

/**
 * Row order of the isometric ground tileset (`GROUND_ROWS` of `@wdi/content`, SPRITES 10.12; a test pins the copy):
 * grass, litter, moss, path, earth, cobble, flags, planks, rock, shingle, shallows, brush, rails, water.
 */
export const GROUND_ROWS = 'glmpdcfwrs~u=O';

/** Cells per material in the ground tileset: gid = 1 + 20 * material + cell (SPRITES 10.12). */
export const CELLS_PER_MATERIAL = 20;

/** The material (a `GROUND_ROWS` character) of a ground gid, or null for gid 0 and gids past the tileset. */
export function materialOfGid(gid: number): string | null {
  if (gid <= 0) return null;
  return GROUND_ROWS[Math.floor((gid - 1) / CELLS_PER_MATERIAL)] ?? null;
}

/** The greybox ground colour of each material: a palette token and a brightness. */
const GROUND: Record<string, [PaletteToken, number]> = {
  g: ['teal', 0.45],
  l: ['mustard', 0.4],
  m: ['teal', 0.3],
  p: ['bone', 0.55],
  d: ['mustard', 0.3],
  c: ['fog', 0.75],
  f: ['fog', 0.6],
  w: ['mustard', 0.5],
  r: ['slate', 1.1],
  s: ['fog', 0.5],
  '~': ['moon', 0.6],
  u: ['teal', 0.35],
  '=': ['ink', 1.6],
  O: ['moon', 0.4],
};

export function groundColour(material: string): number {
  const [token, f] = GROUND[material] ?? ['slate', 1];
  return shade(tokenColour(token), f);
}
