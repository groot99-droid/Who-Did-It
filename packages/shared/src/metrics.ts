import { TILE_PX } from './constants';

// docs/WORLD.md 4.2 and DECISIONS 8.2: 1 tile = 1 m, 128 px character cells, 90 px max silhouette.
export { TILE_PX };
export const CHAR_CELL_PX = 128;
export const MAX_SILHOUETTE_PX = 90;

export const tilesToPx = (tiles: number): number => tiles * TILE_PX;
export const pxToTiles = (px: number): number => px / TILE_PX;
