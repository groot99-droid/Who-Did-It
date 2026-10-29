import {
  balance,
  biomeOf,
  classesOfProp,
  interactions,
  isDarkScene,
  profileFor,
  routines,
  scenes,
  type Profile,
  type RoutinePhaseClass,
  type Scene,
  type SceneId,
} from '@wdi/content';
import { MAX_PLAYERS, MIN_PLAYERS_TO_START, Phase, TICK_RATE, TILE_PX, type PlayerState } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { handleHold } from '../Hold';
import { mapScenesOf } from '../MapSites';
import { type PlayerSim, simOf } from '../RoomSim';
import { navGrid, profileOpen, sceneIndex, sceneKey, tileCentre } from '../World';
import { holdOf, otherAt, sellAt, workable } from './chores';
import { type Act, type Brain, type NpcMemory, playRng } from './memory';
import { moodWeights } from './needs';
import { GOAL_SLACK, drive, firstPortalToward, stand, walkThrough, walkTo, wander } from './walk';
import { vendettaGoalFor } from '../vendettas/goal';

// The NPC routine (GDD 3.12 "Routines", "Night"; npc.md 7): the persona, the stations and the one-tick brain that
// walks to a station, stands at it, strolls and idles. `world.ts` calls `runRoutine` (or `runHome` in an unlit
// scene at night) after every reaction has had its turn. Every draw is from the seat's own `npcPlay` stream.

export type PhaseClass = RoutinePhaseClass;

const PHASE_KEYS = new Map<number, string>(Object.entries(Phase).map(([key, value]) => [value, key]));
/** The `Phase` key of a phase value (`dusk`, `finalNight`, ...), as `routines.json` and `abilities.json` name it. */
export const phaseKeyOf = (phase: number): string => PHASE_KEYS.get(phase) ?? '';

/** The class of a main-mode world phase (routines.json phaseClasses), null for every other phase. */
export function phaseClassOf(phase: number): PhaseClass | null {
  const key = phaseKeyOf(phase);
  if ((routines.phaseClasses.day as readonly string[]).includes(key)) return 'day';
  if ((routines.phaseClasses.night as readonly string[]).includes(key)) return 'night';
  return null;
}

/** GDD 3.12 "Night": not dark, not forest or cave, and an interior or a scene with a night light. */
export function isLitAtNight(scene: Scene): boolean {
  if (isDarkScene(scene)) return false;
  const biome = biomeOf(scene);
  if (biome === 'forest' || biome === 'cave') return false;
  if (scene.kind === 'interior') return true;
  if (scene.lights?.some((l) => l.phases === undefined || l.phases.includes('night'))) return true;
  return scene.props.some((q) => routines.lightKinds.includes(q.kind));
}

const litCache = new Map<SceneId, boolean>();
/** `isLitAtNight` of a content scene, cached (scenes are immutable). */
export function litAtNight(id: SceneId): boolean {
  let lit = litCache.get(id);
  if (lit === undefined) {
    lit = isLitAtNight(scenes[id]);
    litCache.set(id, lit);
  }
  return lit;
}

/**
 * A station of the map: a prop whose kind or class (`interactions.json`, round 10 D1) `routines.json` lists, with the
 * floor tiles it can be worked from.
 */
export interface Station {
  propId: string;
  scene: SceneId;
  kind: string;
  /** The prop's class in the logic table, when it has one. */
  cls?: string;
  activity: string;
  x: number;
  y: number;
  stands: readonly { x: number; y: number }[];
}

const ACTIVITY_OF = new Map<string, string>();
for (const [activity, def] of Object.entries(routines.activities)) {
  for (const kind of def.kinds) ACTIVITY_OF.set(kind, activity);
}

interface StationIndex {
  list: readonly Station[];
  byId: ReadonlyMap<string, Station>;
}
const stationCache = new WeakMap<readonly SceneId[], Map<Profile, StationIndex>>();

function indexOf(map: readonly SceneId[], profile: Profile): StationIndex {
  let byProfile = stationCache.get(map);
  if (!byProfile) {
    byProfile = new Map();
    stationCache.set(map, byProfile);
  }
  let index = byProfile.get(profile);
  if (!index) {
    const list: Station[] = [];
    for (const sceneId of map) {
      const scene = scenes[sceneId];
      if (!profileOpen(scene.profile, profile)) continue;
      const grid = navGrid(sceneId, profile);
      for (const prop of scene.props) {
        const [cls] = classesOfProp(interactions, prop);
        const activity = (cls !== undefined ? ACTIVITY_OF.get(cls) : undefined) ?? ACTIVITY_OF.get(prop.kind);
        if (activity === undefined) continue;
        if (prop.profiles !== undefined && !prop.profiles.includes(profile)) continue;
        const stands = (
          [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const
        )
          .map(([dx, dy]) => ({ x: prop.x + dx, y: prop.y + dy }))
          .filter((t) => !grid.solidAt(t.x, t.y));
        if (stands.length === 0) continue;
        list.push({
          propId: prop.id,
          scene: sceneId,
          kind: prop.kind,
          ...(cls !== undefined ? { cls } : {}),
          activity,
          x: prop.x,
          y: prop.y,
          stands,
        });
      }
    }
    index = { list, byId: new Map(list.map((s) => [s.propId, s])) };
    byProfile.set(profile, index);
  }
  return index;
}

/** Every station prop of the map's scenes present at `profile`, with its floor stand tiles; cached per map and profile. */
export function stationsOf(map: readonly SceneId[], profile: Profile): readonly Station[] {
  return indexOf(map, profile).list;
}

/** The profile the match plays at: fixed by the first placement, from the party size before it (GDD 3.9). */
export function profileOfRoom(room: PartyRoom): Profile {
  return simOf(room).profile;
}

/** The persona (GDD 3.12): a home and `favouriteStations` favourites in distinct scenes, from `npcPlay`. */
export interface Persona {
  home: SceneId | null;
  favourites: readonly string[];
}

/** One uniform, always drawn, picking from `pool` (null when empty): the number of draws never depends on the pool. */
function pick<T>(rng: () => number, pool: readonly T[]): T | null {
  const u = rng();
  return pool.length === 0 ? null : (pool[Math.min(pool.length - 1, Math.floor(u * pool.length))] as T);
}

/** The persona of seat `id`: a lit interior open at the party size (distinct while the map has enough) and favourites. */
export function drawPersona(
  room: PartyRoom,
  id: string,
  homesTaken: ReadonlySet<SceneId>,
  profile: Profile,
): Persona {
  const rng = playRng(room, id);
  const map = mapScenesOf(room);
  const homes = map.filter(
    (s) => scenes[s].kind === 'interior' && profileOpen(scenes[s].profile, profile) && litAtNight(s),
  );
  const free = homes.filter((s) => !homesTaken.has(s));
  const home = pick(rng, free.length > 0 ? free : homes);
  const stations = stationsOf(map, profile);
  const favourites: Station[] = [];
  for (let i = 0; i < balance.npc.routine.favouriteStations; i++) {
    const taken = new Set(favourites.map((f) => f.scene));
    const apart = stations.filter((s) => !taken.has(s.scene));
    const rest = stations.filter((s) => !favourites.includes(s));
    const next = pick(rng, apart.length > 0 ? apart : rest);
    if (next) favourites.push(next);
  }
  return { home, favourites: favourites.map((f) => f.propId) };
}

/** Draws the personas of every NPC seat when the match is dealt (the role card); homes stay distinct while they last. */
export function drawPersonas(room: PartyRoom, mem: NpcMemory): void {
  const profile = profileForParty(room);
  const taken = new Set<SceneId>();
  for (const id of mem.order) {
    const persona = drawPersona(room, id, taken, profile);
    mem.brain(id).persona = persona;
    if (persona.home) taken.add(persona.home);
  }
}

function profileForParty(room: PartyRoom): Profile {
  const sim = simOf(room);
  return sim.profileFixed ? sim.profile : partyProfile(room.state.players.size);
}

const partyProfile = (n: number): Profile =>
  profileFor(Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS_TO_START, n)));

// --- time helpers -------------------------------------------------------------------------------------------

/** A `{min, max}` span of seconds drawn uniformly, in ticks (one draw). */
export const spanTicks = (rng: () => number, s: { min: number; max: number }): number =>
  Math.round((s.min + rng() * (s.max - s.min)) * TICK_RATE);

const ARRIVE_REACH_PX = TILE_PX / 4 / GOAL_SLACK;
const CLUE_WALK_REACH_PX = (balance.doors.reachTiles * TILE_PX * 0.6) / GOAL_SLACK;

// --- the walk, with the progress watch ---------------------------------------------------------------------

type Walk = 'arrived' | 'walking' | 'stuck';

/** Records where the seat last gained a quarter tile; true when `stuckS` passed without one. */
function stalled(room: PartyRoom, brain: Brain, p: PlayerSim, key: string): boolean {
  const tick = room.state.tick;
  if (brain.goalKey !== key) {
    brain.goalKey = key;
    brain.anchorX = p.x;
    brain.anchorY = p.y;
    brain.anchorTick = tick;
    return false;
  }
  if (Math.hypot(p.x - brain.anchorX, p.y - brain.anchorY) >= TILE_PX / 4) {
    brain.anchorX = p.x;
    brain.anchorY = p.y;
    brain.anchorTick = tick;
    return false;
  }
  return tick - brain.anchorTick >= Math.round(balance.npc.routine.stuckS * TICK_RATE);
}

function walkToPoint(
  room: PartyRoom,
  brain: Brain,
  p: PlayerSim,
  x: number,
  y: number,
  reachPx: number,
): Walk {
  const key = `${p.sceneIdx}:${Math.round(x)}:${Math.round(y)}`;
  const r = walkTo(room, brain, p, x, y, reachPx);
  if (r === 'walking') brain.rested = false;
  if (r === 'arrived') {
    brain.goalKey = '';
    return 'arrived';
  }
  if (r === 'stuck' || stalled(room, brain, p, key)) {
    stand(p);
    brain.goalKey = '';
    brain.path = null;
    return 'stuck';
  }
  return 'walking';
}

/** Walks to a portal and queues the crossing; a crossing is a leg, which may be followed by a pause. */
function walkPortal(room: PartyRoom, brain: Brain, p: PlayerSim, id: string, portalId: string): Walk {
  const portal = scenes[sceneKey(p.sceneIdx)].portals.find((q) => q.id === portalId);
  if (!portal) return 'stuck';
  const key = `portal:${p.sceneIdx}:${portalId}`;
  const r = walkThrough(room, brain, p, id, portal);
  if (r === 'walking') brain.rested = false;
  if (r === 'arrived') {
    brain.goalKey = '';
    brain.crossingUntil = room.state.tick + 3 * TICK_RATE;
    return 'arrived';
  }
  if (r === 'stuck' || stalled(room, brain, p, key)) {
    stand(p);
    brain.goalKey = '';
    brain.path = null;
    return 'stuck';
  }
  return 'walking';
}

// --- scenes reachable ----------------------------------------------------------------------------------------

/** Scenes reachable from `from` over open portals of the map (only lit ones at night). */
function reachableScenes(
  from: SceneId,
  profile: Profile,
  map: readonly SceneId[],
  litOnly: boolean,
): Set<SceneId> {
  const seen = new Set<SceneId>([from]);
  const queue: SceneId[] = [from];
  for (let head = 0; head < queue.length; head++) {
    for (const q of scenes[queue[head] as SceneId].portals) {
      if (q.to === null || q.toSpawn === null || q.lock !== null || !profileOpen(q.minProfile, profile))
        continue;
      const to = q.to as SceneId;
      if (seen.has(to) || !map.includes(to) || (litOnly && !litAtNight(to))) continue;
      seen.add(to);
      queue.push(to);
    }
  }
  return seen;
}

/** Scenes one open portal from `from` (only lit ones at night): the only other scenes a trip may head for. */
function adjacentScenes(
  from: SceneId,
  profile: Profile,
  map: readonly SceneId[],
  litOnly: boolean,
): Set<SceneId> {
  const out = new Set<SceneId>();
  for (const q of scenes[from].portals) {
    if (q.to === null || q.toSpawn === null || q.lock !== null || !profileOpen(q.minProfile, profile))
      continue;
    const to = q.to as SceneId;
    if (map.includes(to) && (!litOnly || litAtNight(to))) out.add(to);
  }
  return out;
}

const litSubset = (map: readonly SceneId[]): readonly SceneId[] => map.filter(litAtNight);

// --- choosing ------------------------------------------------------------------------------------------------

/** The sole other living seat of a scene, when exactly one stands there and it is a human (not a Cabal mate). */
function soleHumanIn(room: PartyRoom, mem: NpcMemory, player: PlayerState, scene: number): boolean {
  let count = 0;
  let only = '';
  for (const [other, o] of simOf(room).players) {
    if (other === player.id || o.dead || !o.placed || o.sceneIdx !== scene) continue;
    count++;
    only = other;
  }
  return count === 1 && !mem.ids.has(only) && !player.priv.cabalMates.includes(only);
}

function occupied(room: PartyRoom, selfId: string, scene: number, x: number, y: number): boolean {
  for (const [id, o] of simOf(room).players) {
    if (id === selfId || o.dead || !o.placed || o.sceneIdx !== scene) continue;
    if (Math.hypot(o.x - x, o.y - y) < TILE_PX / 2) return true;
  }
  return false;
}

function openStations(
  room: PartyRoom,
  mem: NpcMemory,
  brain: Brain,
  player: PlayerState,
  p: PlayerSim,
  cls: PhaseClass,
): Station[] {
  const sim = simOf(room);
  const map = mapScenesOf(room);
  const litOnly = cls === 'night';
  const reach = reachableScenes(sceneKey(p.sceneIdx), sim.profile, map, litOnly);
  return stationsOf(map, sim.profile).filter((st) => {
    if (!routines.activities[st.activity]?.phases.includes(cls)) return false;
    if (st.propId === brain.lastStationId) return false;
    const owner = mem.claims.get(st.propId);
    if (owner !== undefined && owner !== player.id) return false;
    return reach.has(st.scene) && (!litOnly || litAtNight(st.scene)) && workable(room, player, st);
  });
}

/** The stations of lit scenes where exactly one living seat stands and it is a human: a Killer NPC's prey (no draw). */
function preyStations(
  room: PartyRoom,
  mem: NpcMemory,
  brain: Brain,
  player: PlayerState,
  p: PlayerSim,
): Station[] {
  const here = sceneKey(p.sceneIdx);
  return openStations(room, mem, brain, player, p, 'night').filter(
    (st) => st.scene !== here && soleHumanIn(room, mem, player, sceneIndex(st.scene)),
  );
}

function pickStation(
  room: PartyRoom,
  mem: NpcMemory,
  brain: Brain,
  player: PlayerState,
  p: PlayerSim,
  cls: PhaseClass,
  killer: boolean,
): { st: Station; hunt: boolean } | null {
  const tick = room.state.tick;
  const rng = playRng(room, player.id);
  const sim = simOf(room);
  const map = mapScenesOf(room);
  const here = sceneKey(p.sceneIdx);
  const litOnly = cls === 'night';
  const base = openStations(room, mem, brain, player, p, cls);
  // One hop at a time: a trip never passes through a scene without its dwell (the hunt below is the exception: it ignores the dwell).
  const adjacent = adjacentScenes(here, sim.profile, map, litOnly);
  const own = base.filter((st) => st.scene === here);
  const other = base.filter((st) => st.scene !== here && adjacent.has(st.scene));
  const dwellRun = tick >= brain.sceneDwellUntilTick;
  let pool = dwellRun ? (other.length > 0 ? other : own) : own;
  // GDD 3.20 "NPC Killers": a vendetta's scene is one more place to work, drawn under the same weights (7H's
  // `vendettaGoalFor`, no draw). It keeps the dwell and the one-hop rule, so it reads like any routine trip: in the
  // goal scene the seat works there; elsewhere, once the dwell has run, its next trip is to the next scene on the way.
  const goal = vendettaGoalFor(room, player.id);
  if (goal) {
    let toward: Station[] = [];
    if (goal.sceneId === here) toward = own;
    else if (dwellRun) {
      const hop = firstPortalToward(here, sim.profile, (s) => s === goal.sceneId, map);
      toward = hop ? other.filter((st) => st.scene === hop.to) : [];
    }
    if (toward.length > 0) pool = toward;
  }
  let hunt = false;
  if (killer && litOnly) {
    const prey = preyStations(room, mem, brain, player, p);
    if (prey.length > 0) {
      pool = prey;
      hunt = true;
    }
  }
  const favourites = pool.filter((st) => brain.persona?.favourites.includes(st.propId) ?? false);
  const st = pick(rng, favourites.length > 0 ? favourites : pool);
  return st ? { st, hunt } : null;
}

/** A random floor tile of the scene 3-10 path tiles from the seat (`npc.routine.strollTiles`). */
function pickStroll(room: PartyRoom, p: PlayerSim, rng: () => number): { x: number; y: number } | null {
  const grid = navGrid(sceneKey(p.sceneIdx), simOf(room).profile);
  const span = balance.npc.routine.strollTiles;
  const start = { x: Math.floor(p.x / TILE_PX), y: Math.floor(p.y / TILE_PX) };
  const dist = new Map<number, number>([[start.y * grid.w + start.x, 0]]);
  const queue = [start];
  const found: { x: number; y: number }[] = [];
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head] as { x: number; y: number };
    const d = dist.get(cur.y * grid.w + cur.x) as number;
    if (d >= span.min) found.push(cur);
    if (d >= span.max) continue;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (grid.solidAt(nx, ny) || dist.has(ny * grid.w + nx)) continue;
      dist.set(ny * grid.w + nx, d + 1);
      queue.push({ x: nx, y: ny });
    }
  }
  return pick(rng, found);
}

/** An idle stand of `idleS`; the seat has rested, so its next choice is an action (round 10, D1). */
function idleAct(brain: Brain, rng: () => number, tick: number): Act {
  brain.rested = true;
  return {
    kind: 'idle',
    untilTick: tick + spanTicks(rng, balance.npc.routine.idleS),
    stationId: '',
    goal: null,
  };
}

/**
 * A walk that could not go on: the seat idles where it is, or, when it has just rested, wanders a second instead, so a
 * stand never follows a stand (D1).
 */
function afterStuck(brain: Brain, rng: () => number, tick: number): void {
  if (!brain.rested) return void (brain.act = idleAct(brain, rng, tick));
  brain.act = null;
  brain.fallbackUntilTick = tick + TICK_RATE;
}

/** The next activity (GDD 3.12 "Choosing"); `restrict` is the wait in an unlit scene at night: strolls and idles only. */
function choose(
  room: PartyRoom,
  mem: NpcMemory,
  brain: Brain,
  player: PlayerState,
  p: PlayerSim,
  cls: PhaseClass,
  killer: boolean,
  restrict: boolean,
): void {
  const tick = room.state.tick;
  const id = player.id;
  const rng = playRng(room, id);

  if (brain.pendingClue !== '') {
    const scene = room.state.scenes.get(sceneKey(p.sceneIdx));
    const clue = scene?.clues.get(brain.pendingClue);
    const gone =
      brain.pendingClueScene !== p.sceneIdx ||
      !clue ||
      simOf(room).clueMeta.get(brain.pendingClue)?.collectors.has(id) === true;
    if (gone) brain.pendingClue = '';
    else if (room.state.phase !== Phase.immunity && clue) {
      brain.act = {
        kind: 'collect',
        untilTick: tick + 30 * TICK_RATE,
        stationId: clue.id,
        goal: { scene: p.sceneIdx, x: clue.x, y: clue.y },
      };
      brain.pendingClue = '';
      brain.goalKey = '';
      return;
    }
  }

  const w = moodWeights(brain, balance.npc.routine.weights[cls]); // round 8, 8E: the mood shifts the draw (locked hook)
  const u = rng();
  let kind: 'work' | 'stroll' | 'idle' = u < w.work ? 'work' : u < w.work + w.stroll ? 'stroll' : 'idle';
  // A Killer NPC with prey in sight of the map goes hunting at once, whatever the weights drew.
  if (killer && cls === 'night' && preyStations(room, mem, brain, player, p).length > 0) kind = 'work';
  // Round 10 (D1): an NPC seat idles only between actions, so a stand never follows a stand. The same uniform, read
  // inside the idle band, picks work or stroll by their weights (no draw).
  const busy = w.work + w.stroll;
  if (kind === 'idle' && brain.rested && busy > 0)
    kind = ((u - busy) / Math.max(w.idle, 1e-9)) * busy < w.work ? 'work' : 'stroll';
  if (restrict && kind === 'work') kind = 'stroll';
  if (kind === 'work') {
    const trip = pickStation(room, mem, brain, player, p, cls, killer);
    if (trip) {
      mem.claims.set(trip.st.propId, id);
      brain.act = {
        kind: 'travel',
        untilTick: Infinity,
        stationId: trip.st.propId,
        goal: null,
        hunt: trip.hunt,
      };
      brain.holdTries = 0;
      brain.goalKey = '';
      return;
    }
    kind = 'stroll';
  }
  if (kind === 'stroll') {
    const tile = pickStroll(room, p, rng);
    if (tile) {
      brain.act = {
        kind: 'stroll',
        untilTick: Infinity,
        stationId: '',
        goal: { scene: p.sceneIdx, x: tileCentre(tile.x, TILE_PX), y: tileCentre(tile.y, TILE_PX) },
      };
      brain.goalKey = '';
      return;
    }
    // Neither a station nor a stroll tile: the M3c wander, checked again in a second.
    brain.act = null;
    brain.fallbackUntilTick = tick + TICK_RATE;
    return;
  }
  brain.act = idleAct(brain, rng, tick);
}

// --- one tick ------------------------------------------------------------------------------------------------

/** Rolls the pause after a leg: `idleChanceAfterLeg`, then an `idleS` stand (always one chance draw). */
export function legPause(room: PartyRoom, brain: Brain, id: string): void {
  const rng = playRng(room, id);
  if (rng() < balance.npc.routine.idleChanceAfterLeg) {
    brain.pauseUntilTick = room.state.tick + spanTicks(rng, balance.npc.routine.idleS);
    brain.rested = true;
  }
}

/** Ends the current visit or walk: the claim goes and a station left becomes `lastStationId`. */
function endAct(brain: Brain): void {
  const act = brain.act;
  if (act && (act.kind === 'travel' || act.kind === 'work')) brain.lastStationId = act.stationId;
  brain.act = null;
}

/** Drops the claims of seat `id` (all of them, or all but `keep`). */
export function releaseClaims(mem: NpcMemory, id: string, keep = ''): void {
  for (const [station, owner] of mem.claims) if (owner === id && station !== keep) mem.claims.delete(station);
}

/**
 * Walking 12 s without a still stretch of `idleS.min` forces a stand (the activity resumes after it): "stops at the
 * next tile and idles" (GDD 3.12 "Legs and pauses").
 */
function walkCap(room: PartyRoom, brain: Brain, id: string): boolean {
  if (brain.walkTicks < balance.npc.routine.maxWalkS * TICK_RATE) return false;
  const rng = playRng(room, id);
  brain.pauseUntilTick = room.state.tick + Math.max(spanTicks(rng, balance.npc.routine.idleS), 2) + 2;
  brain.walkTicks = 0;
  brain.goalKey = '';
  return true;
}

/** The yaw step: one tick of input toward the prop's centre, so the seat ends facing it (nothing writes `yaw`). */
function faceStation(room: PartyRoom, brain: Brain, p: PlayerSim, st: Station): void {
  const dx = tileCentre(st.x, TILE_PX) - p.x;
  const dy = tileCentre(st.y, TILE_PX) - p.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return stand(p);
  drive(room, p, brain, dx / d, dy / d);
}

/** One routine tick: continue the current activity or choose the next (called last by `runWorldNpc`). */
export function runRoutine(
  room: PartyRoom,
  mem: NpcMemory,
  brain: Brain,
  player: PlayerState,
  p: PlayerSim,
  opts: { restrict?: boolean; killer?: boolean } = {},
): void {
  const tick = room.state.tick;
  const id = player.id;
  const sim = simOf(room);
  const cls = phaseClassOf(room.state.phase) ?? 'day';
  const killer = opts.killer ?? false;
  const restrict = opts.restrict ?? false;
  const index = indexOf(mapScenesOf(room), sim.profile);

  if (tick < brain.pauseUntilTick) return stand(p);
  if (brain.fallbackUntilTick > tick) {
    brain.mode = 'fallback';
    return wander(room, mem, brain, p, id);
  }
  if (walkCap(room, brain, id)) return stand(p);

  // A station visit or trip that the phase class no longer opens ends at once.
  let act = brain.act;
  if (act && (act.kind === 'travel' || act.kind === 'work')) {
    const st = index.byId.get(act.stationId);
    if (
      !st ||
      !routines.activities[st.activity]?.phases.includes(cls) ||
      (restrict && act.kind === 'travel')
    ) {
      endAct(brain);
      act = null;
    }
  }
  releaseClaims(mem, id, act && (act.kind === 'travel' || act.kind === 'work') ? act.stationId : '');
  // An idle that has run out is followed on the same tick (D1: no still tick between a stand and the next action).
  if (act?.kind === 'idle' && tick >= act.untilTick) {
    brain.act = null;
    act = null;
  }

  if (!act) {
    choose(room, mem, brain, player, p, cls, killer, restrict);
    act = brain.act;
    if (!act) {
      if (brain.fallbackUntilTick > tick) {
        brain.mode = 'fallback';
        return wander(room, mem, brain, p, id);
      }
      return stand(p);
    }
  }

  switch (act.kind) {
    case 'idle':
      return stand(p);

    case 'stroll': {
      const goal = act.goal as NonNullable<Act['goal']>;
      const r = walkToPoint(room, brain, p, goal.x, goal.y, ARRIVE_REACH_PX);
      if (r === 'walking') return;
      if (r === 'arrived') {
        brain.act = null;
        legPause(room, brain, id);
      } else afterStuck(brain, playRng(room, id), tick);
      return;
    }

    case 'travel':
      return runTravel(room, mem, brain, player, p, act, index);

    case 'work':
      return runWork(room, brain, player, p, act, index);

    case 'collect':
      return runCollect(room, brain, p, id, act);
  }
}

function runTravel(
  room: PartyRoom,
  mem: NpcMemory,
  brain: Brain,
  player: PlayerState,
  p: PlayerSim,
  act: Act,
  index: StationIndex,
): void {
  const id = player.id;
  const tick = room.state.tick;
  const rng = playRng(room, id);
  const st = index.byId.get(act.stationId) as Station;
  // A Killer NPC on the hunt crosses scenes without the pauses a routine keeps; its trip is a reaction.
  if (act.hunt === true) brain.mode = 'react';
  const drop = (): void => {
    endAct(brain);
    afterStuck(brain, rng, tick);
    brain.path = null;
    brain.goalKey = '';
  };
  const target = sceneIndex(st.scene);
  if (p.sceneIdx !== target) {
    const map = mapScenesOf(room);
    const litOnly = phaseClassOf(room.state.phase) === 'night';
    const portal = firstPortalToward(
      sceneKey(p.sceneIdx),
      simOf(room).profile,
      (s) => s === st.scene,
      litOnly ? litSubset(map) : map,
    );
    if (!portal) return drop();
    const r = walkPortal(room, brain, p, id, portal.id);
    if (r === 'stuck') drop();
    return;
  }
  if (!act.goal || act.goal.scene !== p.sceneIdx) {
    const free = st.stands.filter(
      (t) => !occupied(room, id, p.sceneIdx, tileCentre(t.x, TILE_PX), tileCentre(t.y, TILE_PX)),
    );
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (const t of free) {
      const d = Math.hypot(tileCentre(t.x, TILE_PX) - p.x, tileCentre(t.y, TILE_PX) - p.y);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    if (!best) return drop();
    act.goal = { scene: p.sceneIdx, x: tileCentre(best.x, TILE_PX), y: tileCentre(best.y, TILE_PX) };
    brain.goalKey = '';
  }
  const r = walkToPoint(room, brain, p, act.goal.x, act.goal.y, ARRIVE_REACH_PX);
  if (r === 'walking') return;
  if (r === 'stuck' || occupied(room, id, p.sceneIdx, act.goal.x, act.goal.y)) return drop();
  // Arrived: the visit begins, with one last step toward the prop so the seat faces it. A station with a hold is worked
  // for the dwell; one without is a stop of an idle's length, which counts as the stand between actions (D1).
  const worked = holdOf(st) !== undefined;
  if (!worked) brain.rested = true;
  brain.act = {
    kind: 'work',
    untilTick: tick + spanTicks(rng, worked ? balance.npc.routine.stationDwellS : balance.npc.routine.idleS),
    stationId: st.propId,
    goal: act.goal,
    faced: true,
  };
  brain.holdTries = 0;
  faceStation(room, brain, p, st);
}

function runWork(
  room: PartyRoom,
  brain: Brain,
  player: PlayerState,
  p: PlayerSim,
  act: Act,
  index: StationIndex,
): void {
  const tick = room.state.tick;
  const id = player.id;
  const st = index.byId.get(act.stationId) as Station;
  if (tick >= act.untilTick || act.refused === true) {
    if (p.hold !== null)
      handleHold(room, id, { action: p.hold.action, targetId: p.hold.targetId, on: false });
    endAct(brain);
    return stand(p);
  }
  // A reaction can leave the seat away from its station with the visit still open: walk back to the stand first.
  const goal = act.goal;
  if (
    goal &&
    p.hold === null &&
    (goal.scene !== p.sceneIdx || Math.hypot(goal.x - p.x, goal.y - p.y) > TILE_PX)
  ) {
    brain.act = { kind: 'travel', untilTick: act.untilTick, stationId: act.stationId, goal };
    brain.path = null;
    brain.goalKey = '';
    return stand(p);
  }
  const hold = holdOf(st);
  if (hold === 'shop') {
    // A counter: one sale of what it holds, then the pause before the next action.
    if (act.traded !== true) {
      sellAt(room, id, player, st);
      act.traded = true;
      act.untilTick = Math.min(
        act.untilTick,
        tick + spanTicks(playRng(room, id), balance.npc.routine.workPauseS),
      );
    }
    return stand(p);
  }
  // Nothing waits on the seat (D1): with another seat working the prop it finishes its own hold, starts no new one and
  // steps off after a pause of `workPauseS`, as anyone leaves a busy station.
  if (hold !== undefined && p.hold === null && act.yielding !== true && otherAt(room, id, st.propId)) {
    act.yielding = true;
    act.untilTick = Math.min(
      act.untilTick,
      tick + spanTicks(playRng(room, id), balance.npc.routine.workPauseS),
    );
  }
  if (hold !== undefined && act.yielding !== true) {
    if (p.hold !== null) act.holding = true;
    else if (act.holding === true) {
      // The hold ended: a pause of `workPauseS`, then the next cycle.
      act.holding = false;
      act.holdAgainTick = tick + spanTicks(playRng(room, id), balance.npc.routine.workPauseS);
    } else if (tick >= (act.holdAgainTick ?? 0)) startHold(room, brain, p, id, hold, st);
  }
  stand(p);
}

function startHold(room: PartyRoom, brain: Brain, p: PlayerSim, id: string, hold: string, st: Station): void {
  brain.holdTries++;
  handleHold(room, id, { action: hold, targetId: st.propId, on: true });
  // Nothing running right after the call means the server refused it: the visit ends on the next tick.
  if (brain.act) {
    if (p.hold === null) brain.act.refused = true;
    else {
      brain.act.holding = true;
      brain.rested = false;
    }
  }
}

function runCollect(room: PartyRoom, brain: Brain, p: PlayerSim, id: string, act: Act): void {
  const tick = room.state.tick;
  const scene = room.state.scenes.get(sceneKey(p.sceneIdx));
  const clue = scene?.clues.get(act.stationId);
  const done = simOf(room).clueMeta.get(act.stationId)?.collectors.has(id) === true;
  if (!clue || done || room.state.phase === Phase.immunity || tick >= act.untilTick) {
    if (p.hold !== null) handleHold(room, id, { action: 'collect', targetId: act.stationId, on: false });
    brain.act = null;
    return stand(p);
  }
  if (p.hold !== null) return stand(p);
  if (act.faced) {
    // The hold we started has ended without the clue in the notebook: refused or cancelled.
    brain.act = null;
    return stand(p);
  }
  const r = walkToPoint(room, brain, p, clue.x, clue.y, CLUE_WALK_REACH_PX);
  if (r === 'walking') return;
  if (r === 'stuck') return afterStuck(brain, playRng(room, id), tick);
  handleHold(room, id, { action: 'collect', targetId: clue.id, on: true });
  act.faced = true;
  if (p.hold === null) brain.act = null;
}

// --- the walk home -------------------------------------------------------------------------------------------

/**
 * The night class in a scene that is not lit, once the leave delay has run (GDD 3.12 "Night"): walk to the
 * persona's home, or to the nearest lit scene when the home is out of reach, with the usual leg pauses.
 * Returns whether it drove the seat.
 */
export function runHome(room: PartyRoom, brain: Brain, player: PlayerState, p: PlayerSim): boolean {
  const id = player.id;
  const tick = room.state.tick;
  brain.mode = 'home';
  if (tick < brain.pauseUntilTick) {
    stand(p);
    return true;
  }
  if (walkCap(room, brain, id)) {
    stand(p);
    return true;
  }
  const sim = simOf(room);
  const map = mapScenesOf(room);
  const here = sceneKey(p.sceneIdx);
  const home = brain.persona?.home ?? null;
  let portal =
    home !== null && home !== here ? firstPortalToward(here, sim.profile, (s) => s === home, map) : null;
  portal ??= firstPortalToward(here, sim.profile, (s) => litAtNight(s), map);
  if (!portal) {
    brain.mode = 'routine';
    return false;
  }
  if (walkPortal(room, brain, p, id, portal.id) === 'stuck') {
    brain.mode = 'routine';
    return false;
  }
  return true;
}
