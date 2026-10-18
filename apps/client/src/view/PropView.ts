import overworld from '@wdi/content/data/scenes/overworld.json';
import { TILE_PX } from '@wdi/shared/constants';
import type { MapObject, SceneMap } from './sceneMap';

// Props are drawn by `StaticView` from the tilemap's `props` group (SPRITES 10.12, `mapDefs.ts`). What stays here is
// what the rest of the World asks of them: where the bell stands, and the old orthogonal files' stand-in props.

export interface PropSpot {
  id: string;
  kind: string;
  /** Pixel centre of the prop's tile. */
  x: number;
  y: number;
}

/** The props that stood in the old overworld square, which the orthogonal tilemaps never carried. */
const LEGACY_SHOWN = new Set([
  'ov.bell',
  'ov.pump',
  'ov.board',
  'ov.chest',
  'ov.lantern_0',
  'ov.lantern_1',
  'ov.lantern_2',
  'ov.lantern_3',
]);

const spotsOf = (props: Array<{ id: string; kind: string; x: number; y: number }>): PropSpot[] =>
  props.map((p) => ({ id: p.id, kind: p.kind, x: (p.x + 0.5) * TILE_PX, y: (p.y + 0.5) * TILE_PX }));

/** The overworld's props with their pixel centres. */
export function overworldProps(): PropSpot[] {
  return spotsOf(overworld.props);
}

/**
 * The scene's props as map objects. An isometric file carries its own `props` group; an orthogonal file (before
 * the round-5 maps land) has none, so the overworld falls back to its square's stand-ins from the scene data.
 * Remove the fallback, and the scene import, once every tilemap is isometric.
 */
export function propObjects(map: SceneMap, sceneId: string): MapObject[] {
  if (map.isometric || sceneId !== 'overworld') return map.props;
  return overworld.props
    .filter((p) => LEGACY_SHOWN.has(p.id))
    .map((p) => ({
      name: p.id,
      type: p.kind,
      x: p.x * TILE_PX,
      y: p.y * TILE_PX,
      width: TILE_PX,
      height: TILE_PX,
      props: {},
    }));
}

/** Pixel centre of the scene's bell, or null when it has none. */
export function bellSpot(props: MapObject[]): { x: number; y: number } | null {
  const b = props.find((p) => p.type === 'bell');
  return b ? { x: b.x + TILE_PX / 2, y: b.y + TILE_PX / 2 } : null;
}
