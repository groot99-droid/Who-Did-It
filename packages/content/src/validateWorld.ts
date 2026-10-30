// World rules of GDD 3.13 and WORLD 4.3 that a single zod schema cannot express: the material layer, buildings
// and footprints, lights and the M5b placeholders inside one scene (`checkSceneWorld`), and the maps
// (`checkMaps`). `validateContent` calls both; every message names the scene or map it is about.
import { PROFILE_RANK, type Profile } from './schemas/balance.js';
import type { MapFile, MapId } from './schemas/maps.js';
import { MAP_IDS } from './schemas/maps.js';
import {
  FLOOR_MATERIALS,
  SOLID_MATERIALS,
  biomeOf,
  type Rect,
  type Scene,
  type SceneId,
} from './schemas/scene.js';

const FLOOR = new Set(Object.keys(FLOOR_MATERIALS));
const SOLID = new Set(Object.keys(SOLID_MATERIALS));
const PROFILES: Profile[] = ['small', 'medium', 'large'];

const tilesOf = (r: Rect): Array<[number, number]> => {
  const out: Array<[number, number]> = [];
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) out.push([x, y]);
  return out;
};
const inRect = (r: Rect, x: number, y: number) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

/** Every rule of one scene's M5a fields; returns the problems found. */
export function checkSceneWorld(scene: Scene): string[] {
  const errors: string[] = [];
  const err = (msg: string) => errors.push(`scene ${scene.id}: ${msg}`);
  const { w, h } = scene.size;
  const at = (x: number, y: number) => scene.grid[y]?.[x];
  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;
  const floorish = (x: number, y: number) => at(x, y) === '.' || at(x, y) === 'S';
  const touchesFloor = (x: number, y: number) =>
    floorish(x + 1, y) || floorish(x - 1, y) || floorish(x, y + 1) || floorish(x, y - 1);
  const prefixed = (id: string, what: string) => {
    if (!id.startsWith(`${scene.prefix}.`)) err(`${what} ${id} lacks prefix ${scene.prefix}.`);
  };

  if (biomeOf(scene) === 'cave' && scene.dark !== true) err('a cave scene must be dark');

  // Footprints: buildings and multi-tile props cover solid tiles only, never each other.
  const covered = new Map<string, string>();
  const doorOf = new Map(scene.portals.map((p) => [`${p.x},${p.y}`, p]));
  const cover = (id: string, r: Rect, isBuilding: boolean) => {
    for (const [x, y] of tilesOf(r)) {
      const key = `${x},${y}`;
      if (!inBounds(x, y)) {
        err(`${id} footprint leaves the grid at ${key}`);
        continue;
      }
      if (covered.has(key)) err(`${id} footprint overlaps ${covered.get(key)} at ${key}`);
      covered.set(key, id);
      const ch = at(x, y);
      if (ch === 'D' && isBuilding) {
        // A building's door is on its south or east face, so the camera always sees it (WORLD 4.4).
        if (y !== r.y + r.h - 1 && x !== r.x + r.w - 1)
          err(`door ${doorOf.get(key)?.id} is not on the south or east face of ${id}`);
      } else if (ch !== '#') err(`${id} footprint covers "${ch}" at ${key}, expected "#"`);
    }
  };
  for (const b of scene.buildings ?? []) {
    prefixed(b.id, 'building');
    cover(b.id, b.footprint, true);
  }
  for (const p of scene.props) {
    if (!p.footprint) continue;
    if (!inRect(p.footprint, p.x, p.y)) err(`prop ${p.id} anchor ${p.x},${p.y} is outside its footprint`);
    cover(p.id, p.footprint, false);
    if (!tilesOf(p.footprint).some(([x, y]) => touchesFloor(x, y)))
      err(`prop ${p.id} footprint touches no floor`);
  }
  // A single-tile prop inside a footprint is an overlay on that tile's slice (the plates on the Wake Table, the
  // crepe on the manor door), so it needs no rule of its own.

  // Material layer: h rows of w legend characters that agree with the grid.
  if (scene.material) {
    if (scene.material.length !== h) err(`material has ${scene.material.length} rows, size says ${h}`);
    scene.material.forEach((row, y) => {
      if (row.length !== w) err(`material row ${y} has ${row.length} columns, size says ${w}`);
      [...row].forEach((m, x) => {
        const ch = at(x, y);
        const key = `${x},${y}`;
        if (ch === '.' || ch === 'S') {
          if (!FLOOR.has(m)) err(`material "${m}" at ${key} is solid on a walkable tile`);
        } else if (ch === '#') {
          if (!SOLID.has(m)) err(`material "${m}" at ${key} is floor on a solid tile`);
          const coveredHere = covered.has(key) || scene.props.some((p) => p.x === x && p.y === y);
          if (coveredHere !== (m === 'P')) {
            err(`material at ${key} must be "P" exactly where a building or prop covers the tile`);
          }
        }
      });
    });
  }

  // Lights, nodes, spawners and givers.
  const pathIds = new Set(scene.paths.map((p) => p.id));
  for (const l of scene.lights ?? []) {
    prefixed(l.id, 'light');
    if (!inBounds(l.x, l.y)) err(`light ${l.id} is out of bounds`);
    if (l.phases && new Set(l.phases).size !== l.phases.length) err(`light ${l.id} repeats a phase`);
  }
  for (const n of scene.nodes ?? []) {
    prefixed(n.id, 'node');
    if (!inBounds(n.x, n.y)) {
      err(`node ${n.id} is out of bounds`);
      continue;
    }
    const ch = at(n.x, n.y);
    if (ch === '#') {
      if (!touchesFloor(n.x, n.y)) err(`node ${n.id} on a solid tile has no adjacent floor`);
      if (covered.has(`${n.x},${n.y}`)) err(`node ${n.id} is inside a footprint`);
    } else if (ch !== '.') err(`node ${n.id} stands on "${ch}"; nodes stand on "." or on "#" beside floor`);
  }
  for (const s of scene.spawners ?? []) {
    prefixed(s.id, 'spawner');
    if (at(s.x, s.y) !== '.') err(`spawner ${s.id} is not on a floor tile`);
    if (s.pathId !== undefined && !pathIds.has(s.pathId))
      err(`spawner ${s.id} walks unknown path ${s.pathId}`);
    if (s.phases && new Set(s.phases).size !== s.phases.length) err(`spawner ${s.id} repeats a phase`);
  }
  const taken = new Set<string>();
  for (const g of scene.givers ?? []) {
    prefixed(g.id, 'giver');
    const key = `${g.x},${g.y}`;
    if (at(g.x, g.y) !== '.') err(`giver ${g.id} is not on a floor tile`);
    if (taken.has(key)) err(`giver ${g.id} shares tile ${key}`);
    taken.add(key);
  }
  return errors;
}

export interface MapContent {
  maps: Record<MapId, MapFile>;
  scenes: Record<SceneId, Scene>;
  playersMax: number;
}

/** GDD 3.13 and WORLD 4.3: closed graphs, hubs, spawns, the bell, reachability and a forest and a cave each. */
export function checkMaps(c: MapContent): string[] {
  const errors: string[] = [];
  const scenes: Record<string, Scene | undefined> = c.scenes;
  const owner = new Map<string, string>();
  for (const id of MAP_IDS) {
    const map = c.maps[id];
    const err = (msg: string) => errors.push(`map ${id}: ${msg}`);
    if (map.id !== id) err(`file holds map "${map.id}"`);
    if (new Set(map.scenes).size !== map.scenes.length) err('a scene is listed twice');
    for (const s of map.scenes) {
      if (owner.has(s)) err(`scene ${s} also belongs to map ${owner.get(s)}`);
      owner.set(s, id);
    }
    const inMap = new Set<string>(map.scenes);
    const hub = scenes[map.hub];
    if (!inMap.has(map.hub)) err(`hub ${map.hub} is not one of its scenes`);
    if (hub && (hub.kind !== 'exterior' || hub.profile !== 'small'))
      err(`hub ${map.hub} must be a Small exterior`);

    // Start and meeting spawns: enough for a full party, unique, on the hub.
    for (const [field, refs] of [
      ['startSpawns', map.startSpawns],
      ['meetingSpawns', map.meetingSpawns],
    ] as const) {
      if (refs.length < c.playersMax) err(`${field} has ${refs.length}, needs ${c.playersMax}`);
      if (new Set(refs).size !== refs.length) err(`${field} repeats a spawn`);
      for (const ref of refs) {
        const [sceneId, spawnId] = ref.split('.');
        if (sceneId !== map.hub) err(`${field} ${ref} is not on the hub`);
        if (!scenes[sceneId!]?.spawns.some((s) => s.id === spawnId)) err(`${field} ${ref} names no spawn`);
      }
    }
    // The bell, the teaching clue and the kit chest are props of the right kind on the hub.
    for (const [field, kind] of [
      ['bell', 'bell'],
      ['teachingClue', 'teachingClue'],
      ['kitChest', 'kitChest'],
    ] as const) {
      const prop = hub?.props.find((p) => p.id === map[field]);
      if (!prop) err(`${field} ${map[field]} is not a prop of the hub`);
      else if (prop.kind !== kind) err(`${field} ${map[field]} has kind ${prop.kind}, expected ${kind}`);
    }
    if (map.station !== undefined) {
      const [sceneId, spawnId] = map.station.split('.');
      if (sceneId !== map.hub || !hub?.spawns.some((s) => s.id === spawnId))
        err(`station ${map.station} is not a spawn of the hub`);
    }

    // Closed graph: every portal stays inside the map.
    for (const s of map.scenes) {
      for (const p of scenes[s]?.portals ?? []) {
        if (p.to !== null && !inMap.has(p.to)) err(`portal ${p.id} leaves the map for ${p.to}`);
      }
    }
    // At every profile, every open scene is reachable from the hub and leads back to it.
    const sealed = (s: string) => {
      const inbound = map.scenes.flatMap((from) => scenes[from]?.portals ?? []).filter((p) => p.to === s);
      return inbound.length > 0 && inbound.every((p) => p.ships !== 'V1');
    };
    for (const profile of PROFILES) {
      const open = map.scenes.filter(
        (s) => scenes[s] && PROFILE_RANK[scenes[s]!.profile] <= PROFILE_RANK[profile],
      );
      const edges = (from: string) =>
        (scenes[from]?.portals ?? [])
          .filter(
            (p) => p.to !== null && p.ships === 'V1' && PROFILE_RANK[p.minProfile] <= PROFILE_RANK[profile],
          )
          .map((p) => p.to as string)
          .filter((to) => open.includes(to as SceneId));
      const reach = (start: string, next: (s: string) => string[]) => {
        const seen = new Set([start]);
        const queue = [start];
        while (queue.length) {
          for (const n of next(queue.shift()!)) {
            if (seen.has(n)) continue;
            seen.add(n);
            queue.push(n);
          }
        }
        return seen;
      };
      const forward = reach(map.hub, edges);
      const back = reach(map.hub, (to) => open.filter((from) => edges(from).includes(to)));
      for (const s of open) {
        // Round 10 (T6): a scene entered only by portals that ship after V1 (the sea door, behind `ce.sea`) is
        // sealed until its step ships, so the hub need not reach it.
        if (sealed(s)) continue;
        if (!forward.has(s)) err(`${s} is unreachable from the hub at ${profile}`);
        if (!back.has(s)) err(`${s} has no way back to the hub at ${profile}`);
      }
    }
    // Every party size gets a forest and a cave (owner, A49).
    for (const biome of ['forest', 'cave'] as const) {
      const ok = map.scenes.some(
        (s) => scenes[s] && !sealed(s) && scenes[s]!.profile === 'small' && biomeOf(scenes[s]!) === biome,
      );
      if (!ok) err(`has no ${biome} scene open at the Small profile`);
    }
  }
  for (const [s, scene] of Object.entries(c.scenes)) {
    // A `jail` scene (round 10, B5) sits outside every map's graph: in no map, and with no portal in or out.
    if (scene.kind === 'jail') {
      if (owner.has(s)) errors.push(`scene ${s}: a jail scene belongs to no map`);
      if (scene.portals.length > 0) errors.push(`scene ${s}: a jail scene has no portals`);
    } else if (!owner.has(s)) errors.push(`scene ${s} belongs to no map`);
  }
  return errors;
}
