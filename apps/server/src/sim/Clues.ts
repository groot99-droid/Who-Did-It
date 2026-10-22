import { balance, clues as clueDefs, scenes, type SceneId } from '@wdi/content';
import {
  Clue,
  ClueKind,
  TICK_RATE,
  TILE_PX,
  TRAIT_IDS,
  besideTile,
  evictOverCap,
  trailDir,
} from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { emitSim } from './events/bus';
import { hubOf, teachingClueOf } from './MapSites';
import { simOf } from './RoomSim';
import { navGrid, tileCentre } from './World';

type Decay = (typeof clueDefs.clues)[string]['decay'];

/** Seconds a clue lives, or null when it never decays by the clock (GDD 3.4). */
export function decaySeconds(decay: Decay): number | null {
  return decay.kind === 'seconds' ? decay.seconds : null;
}

/** The portal of a scene nearest to a tile: where a trail leads and where a Thread snags. */
export function nearestPortalTile(sceneId: SceneId, tx: number, ty: number): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (const portal of scenes[sceneId].portals) {
    const d = Math.hypot(portal.x - tx, portal.y - ty);
    if (d < bestD) {
      best = { x: portal.x, y: portal.y };
      bestD = d;
    }
  }
  return best;
}

export interface NewClue {
  /** Fixed id (the teaching clue); else `clue_<sceneId>_<n>` from the scene's counter. */
  id?: string;
  kind: number;
  value: number;
  dir: number;
  tx: number;
  ty: number;
  /** `null` never decays; defaults to the kind's table entry. */
  decayS?: number | null;
}

/** Adds a clue to a scene, remembers its decay, and drops the oldest claimed clue above the cap (GDD 3.4). */
export function spawnClue(room: PartyRoom, sceneId: SceneId, spec: NewClue): string | null {
  const scene = room.state.scenes.get(sceneId);
  if (!scene) return null;
  const sim = simOf(room);
  const seq = spec.id === undefined ? (sim.clueSeq.get(sceneId) ?? 0) + 1 : 0;
  if (spec.id === undefined) sim.clueSeq.set(sceneId, seq);
  const id = spec.id ?? `clue_${sceneId}_${seq}`;
  const clue = new Clue();
  clue.id = id;
  clue.kind = spec.kind;
  clue.value = spec.value;
  clue.dir = spec.dir;
  clue.x = Math.round(tileCentre(spec.tx, TILE_PX));
  clue.y = Math.round(tileCentre(spec.ty, TILE_PX));
  clue.claimed = false;
  scene.clues.set(id, clue);
  emitSim(room, { tick: room.state.tick, kind: 'clue', sceneId, data: { id, kind: spec.kind } }); // 6B
  const decayS = spec.decayS === undefined ? decayOfKind(spec.kind) : spec.decayS;
  sim.clueMeta.set(id, {
    sceneId,
    seq,
    expiresTick: decayS === null ? null : room.state.tick + Math.round(decayS * TICK_RATE),
    collectors: new Set(),
  });
  const inScene = [...sim.clueMeta]
    .filter(([, m]) => m.sceneId === sceneId)
    .map(([cid, m]) => ({ id: cid, claimed: scene.clues.get(cid)?.claimed ?? false, seq: m.seq }));
  for (const gone of evictOverCap(inScene, balance.clues.capPerScene, new Set([id]))) removeClue(room, gone);
  return id;
}

function decayOfKind(kind: number): number | null {
  const def =
    kind === ClueKind.footprints
      ? clueDefs.clues.footprints
      : kind === ClueKind.thread
        ? clueDefs.clues.thread
        : undefined;
  return def ? decaySeconds(def.decay) : null;
}

export function removeClue(room: PartyRoom, id: string): void {
  const sim = simOf(room);
  const meta = sim.clueMeta.get(id);
  if (!meta) return;
  room.state.scenes.get(meta.sceneId)?.clues.delete(id);
  sim.clueMeta.delete(id);
}

/** Tile step for a `DIRECTIONS` index (n, ne, e, se, s, sw, w, nw). */
const STEP: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

/**
 * A kill leaves Footprints one tile along the trail from the kill tile toward the nearest portal (the
 * killer's height; on the kill tile itself when that step is solid) and a Thread on the walkable tile
 * beside that portal (the killer's scarf); the 2-of-3 choice is M4(a). The prints leave the body's
 * tile because the client's prompt prefers the body there (A38).
 */
export function spawnKillClues(
  room: PartyRoom,
  sceneId: SceneId,
  tx: number,
  ty: number,
  traits: { height: number; scarf: number },
): void {
  const portal = nearestPortalTile(sceneId, tx, ty);
  const grid = navGrid(sceneId, simOf(room).profile);
  const dir = portal ? trailDir(tx, ty, portal.x, portal.y) : 4;
  const [sx, sy] = STEP[dir] ?? [0, 1];
  const step = grid.solidAt(tx + sx, ty + sy) ? { x: tx, y: ty } : { x: tx + sx, y: ty + sy };
  spawnClue(room, sceneId, {
    kind: ClueKind.footprints,
    value: traits.height,
    dir,
    tx: step.x,
    ty: step.y,
  });
  const beside = portal
    ? besideTile(portal, { x: tx, y: ty }, (x, y) => !grid.solidAt(x, y))
    : { x: tx, y: ty };
  spawnClue(room, sceneId, {
    kind: ClueKind.thread,
    value: traits.scarf,
    dir: 0,
    tx: beside.x,
    ty: beside.y,
  });
}

/** The grace-phase clue at the map's teaching-clue prop: Footprints, tall (GDD 2 step 5). Spawned once per match. */
export function spawnTeachingClue(room: PartyRoom): void {
  const sim = simOf(room);
  if (sim.teachingSpawned) return;
  sim.teachingSpawned = true;
  const prop = teachingClueOf(room);
  if (!prop) return;
  const hub = hubOf(room);
  const portal = nearestPortalTile(hub, prop.x, prop.y);
  spawnClue(room, hub, {
    id: 'clue_teaching',
    kind: ClueKind.footprints,
    value: TRAIT_IDS.height.indexOf('tall'),
    dir: portal ? trailDir(prop.x, prop.y, portal.x, portal.y) : 4,
    tx: prop.x,
    ty: prop.y,
  });
}

/** Expires clues whose clock ran out, every tick after the portals (the cap is applied at each spawn). */
export function runDecay(room: PartyRoom): void {
  const tick = room.state.tick;
  for (const [id, meta] of simOf(room).clueMeta) {
    if (meta.expiresTick !== null && tick >= meta.expiresTick) removeClue(room, id);
  }
}
