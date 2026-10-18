// Reads what the World needs from a scene's `tilemap.json` (SPRITES 10.12) without Phaser's tilemap classes, which
// know the orthogonal and isometric orientations differently: size in tiles, the void colour, the portals. Object
// coordinates are world px in both orientations.
import { TILE_PX } from '@wdi/shared/constants';

interface TiledProp {
  name: string;
  value: unknown;
}
interface TiledObject {
  name: string;
  type?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  properties?: TiledProp[];
}
interface TiledLayer {
  name: string;
  type: string;
  objects?: TiledObject[];
}
export interface TiledMap {
  orientation?: string;
  width: number;
  height: number;
  properties?: TiledProp[];
  layers?: TiledLayer[];
}

export interface SceneMap {
  /** Size in 64 px world tiles. */
  w: number;
  h: number;
  /** `ink` for interiors and caves, `slate` for exteriors (SPRITES 10.7), or the file's own `void`. */
  voidColour: 'ink' | 'slate';
  dark: boolean;
  portals: Array<{ id: string; x: number; y: number }>;
}

const prop = (m: TiledMap, name: string): unknown => m.properties?.find((p) => p.name === name)?.value;

export function readSceneMap(m: TiledMap): SceneMap {
  const kind = prop(m, 'kind');
  const declared = prop(m, 'void');
  const voidColour =
    declared === 'ink' || declared === 'slate' ? declared : kind === 'exterior' ? 'slate' : 'ink';
  const portals = (m.layers?.find((l) => l.name === 'portals')?.objects ?? []).map((o) => ({
    id: o.name,
    // Tiled stores the tile's top-left corner; the portal stands on the tile's centre.
    x: (o.x ?? 0) + TILE_PX / 2,
    y: (o.y ?? 0) + TILE_PX / 2,
  }));
  return { w: m.width, h: m.height, voidColour, dark: prop(m, 'dark') === true, portals };
}
