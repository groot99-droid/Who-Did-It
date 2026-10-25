// Round 9 (9W, docs/round9/admin-studio.md 8, N3): where the townsfolk go, read from `routines.json` and a scene's
// props the way the Studio room's stand-ins do (`sim/studio/standins.ts`): a kind walks the props of its `stations`
// kinds in route order, or any prop that is not ignored when it lists none. Pure, so it is tested.
import type { MapId, RoutinesFile, Scene, TownsfolkRow } from '@wdi/content';

/** The scrubber's four phases, and the world phase each one previews (the Studio clock's own names). */
export const PHASES = ['dawn', 'day', 'dusk', 'night'] as const;
export type ScrubPhase = (typeof PHASES)[number];
const WORLD_PHASE: Record<ScrubPhase, 'grace' | 'day' | 'dusk' | 'night'> = {
  dawn: 'grace',
  day: 'day',
  dusk: 'dusk',
  night: 'night',
};

/** The phase class (`day` or `night`) that the routines file puts a scrubber phase in. */
export function phaseClassOf(phase: ScrubPhase, routines: RoutinesFile): 'day' | 'night' {
  return routines.phaseClasses.day.includes(WORLD_PHASE[phase]) ? 'day' : 'night';
}

/**
 * Whether a station kind is used in a phase class: a kind some activity lists is used in the classes of those
 * activities; a kind no activity lists (a named figure's own station) is used at any time.
 */
export function qualifies(kind: string, cls: 'day' | 'night', routines: RoutinesFile): boolean {
  const owners = Object.values(routines.activities).filter((a) => a.kinds.includes(kind));
  return owners.length === 0 || owners.some((a) => a.phases.includes(cls));
}

export interface Stop {
  /** 1-based place in the route. */
  n: number;
  propId: string;
  kind: string;
  x: number;
  y: number;
  /** False when the phase class does not use this kind: drawn dimmed. */
  active: boolean;
}

/** One kind's stations in a scene, in route order, for a phase class. A `fixed` figure stands at its props instead. */
export function routeOf(
  scene: Scene,
  row: TownsfolkRow,
  routines: RoutinesFile,
  cls: 'day' | 'night',
): Stop[] {
  const props =
    row.stations.length > 0
      ? row.stations.flatMap((k) => scene.props.filter((p) => p.kind === k))
      : scene.props.filter((p) => !routines.ignore.includes(p.kind));
  return props.map((p, i) => ({
    n: i + 1,
    propId: p.id,
    kind: p.kind,
    x: p.x,
    y: p.y,
    active: qualifies(p.kind, cls, routines),
  }));
}

/** Whether a kind walks a map: a row with no `maps` walks every map. */
export const walks = (row: TownsfolkRow, mapId: MapId): boolean =>
  row.maps === undefined || row.maps.includes(mapId);

/** Every prop kind in `scenes` that can be a station (not ignored), sorted, for the editor's picker. */
export function stationKinds(routines: RoutinesFile, scenes: Iterable<Scene>): string[] {
  const kinds = new Set<string>();
  for (const s of scenes) for (const p of s.props) if (!routines.ignore.includes(p.kind)) kinds.add(p.kind);
  return [...kinds].sort();
}
