import { TILE_PX } from '@wdi/shared/constants';
import type { MapObject } from './sceneMap';

// Props are drawn by `StaticView` from the tilemap's `props` group (SPRITES 10.12, `mapDefs.ts`). What stays here is
// what the rest of the World asks of them: where the bell stands.

/** Pixel centre of the scene's bell, or null when it has none. */
export function bellSpot(props: MapObject[]): { x: number; y: number } | null {
  const b = props.find((p) => p.type === 'bell');
  return b ? { x: b.x + TILE_PX / 2, y: b.y + TILE_PX / 2 } : null;
}
