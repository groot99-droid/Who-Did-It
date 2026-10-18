import { TILE_PX } from './constants';

// docs/WORLD.md 4.2 and SPRITES 10.3: 1 tile = 1 m, 128 px displayed character cells, 112 px max standing
// silhouette (metrics.json `maxStandingSilhouettePx`).
export { TILE_PX };
export const CHAR_CELL_PX = 128;
export const MAX_SILHOUETTE_PX = 112;

export const tilesToPx = (tiles: number): number => tiles * TILE_PX;
export const pxToTiles = (px: number): number => px / TILE_PX;
