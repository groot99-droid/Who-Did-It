// Reads what the World needs from a scene's `tilemap.json` (SPRITES 10.12) without Phaser's tilemap classes: the size,
// the void colour, the three ground layers and every object group. Object coordinates are world px in both the
// isometric files of round 5 and the orthogonal ones they replace, so the readers are the same.
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
  data?: number[];
  objects?: TiledObject[];
}
export interface TiledMap {
  orientation?: string;
  width: number;
  height: number;
  properties?: TiledProp[];
  layers?: TiledLayer[];
}

/** One object of an object group; `x`, `y`, `width` and `height` are world px, `props` its Tiled properties. */
export interface MapObject {
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  props: Record<string, unknown>;
}

export interface MapPortal {
  id: string;
  /** Centre of the portal's tile, world px. */
  x: number;
  y: number;
  kind: string;
  /** `s`, `e` or `sill` (SPRITES 10.12); null when the file does not say. */
  face: string | null;
  inBuilding: boolean;
}

export interface SceneMap {
  /** True for the isometric files of SPRITES 10.12; false for the orthogonal ones they replace. */
  isometric: boolean;
  /** Size in 64 px world tiles. */
  w: number;
  h: number;
  /** `ink` for interiors and caves, `slate` for exteriors (SPRITES 10.7), or the file's own `void`. */
  voidColour: 'ink' | 'slate';
  dark: boolean;
  theme: string | null;
  mapId: string | null;
  /** Gids of the `ground`, `blend_1` and `blend_2` layers, row by row; empty when the layer is missing. */
  ground: number[];
  blend1: number[];
  blend2: number[];
  solids: MapObject[];
  buildings: MapObject[];
  props: MapObject[];
  interact: MapObject[];
  lights: MapObject[];
  portals: MapPortal[];
}

const prop = (props: TiledProp[] | undefined, name: string): unknown =>
  props?.find((p) => p.name === name)?.value;

const objectsOf = (m: TiledMap, group: string): MapObject[] =>
  (m.layers?.find((l) => l.name === group && l.type === 'objectgroup')?.objects ?? []).map((o) => ({
    name: o.name,
    type: o.type ?? '',
    x: o.x ?? 0,
    y: o.y ?? 0,
    width: o.width ?? 0,
    height: o.height ?? 0,
    props: Object.fromEntries((o.properties ?? []).map((p) => [p.name, p.value])),
  }));

const tilesOf = (m: TiledMap, name: string): number[] => {
  const l = m.layers?.find((q) => q.name === name && q.type === 'tilelayer');
  return Array.isArray(l?.data) && l.data.length === m.width * m.height ? l.data : [];
};

export function readSceneMap(m: TiledMap): SceneMap {
  const kind = prop(m.properties, 'kind');
  const declared = prop(m.properties, 'void');
  const voidColour =
    declared === 'ink' || declared === 'slate' ? declared : kind === 'exterior' ? 'slate' : 'ink';
  const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null);
  const portals = objectsOf(m, 'portals').map((o) => ({
    id: o.name,
    // Tiled stores the tile's top-left corner; the portal stands on the tile's centre.
    x: o.x + TILE_PX / 2,
    y: o.y + TILE_PX / 2,
    kind: o.type,
    face: str(o.props.face),
    inBuilding: o.props.inBuilding === true,
  }));
  return {
    isometric: m.orientation === 'isometric',
    w: m.width,
    h: m.height,
    voidColour,
    dark: prop(m.properties, 'dark') === true,
    theme: str(prop(m.properties, 'theme')),
    mapId: str(prop(m.properties, 'map')),
    ground: tilesOf(m, 'ground'),
    blend1: tilesOf(m, 'blend_1'),
    blend2: tilesOf(m, 'blend_2'),
    solids: objectsOf(m, 'solids'),
    buildings: objectsOf(m, 'buildings'),
    props: objectsOf(m, 'props'),
    interact: objectsOf(m, 'interact'),
    lights: objectsOf(m, 'lights'),
    portals,
  };
}
