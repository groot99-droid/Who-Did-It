import {
  type SceneId,
  type TownsfolkRow,
  balance,
  mobs,
  profileFor,
  routines,
  scenes,
  type Profile,
} from '@wdi/content';
import { Avatar, type AvatarState, MAX_PLAYERS, MIN_PLAYERS_TO_START, type Rng, TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { avatarMemory, newHandle } from '../Avatars';
import { spawnBody } from '../Bodies';
import { ensureBody, removeBody } from '../body/state';
import { AnimId } from '../constants';
import { emitSim } from '../events/bus';
import { bindGuard, guardClip, guardPlans, leashRoute } from '../law/Guards';
import { hubOf, mapIdOfRoom, mapScenesOf, startSpawnsOf } from '../MapSites';
import { Brain } from '../npc/memory';
import { bindFigureNeeds, moodIdleFor } from '../npc/needs';
import { type Station, litAtNight, stationsOf } from '../npc/routine';
import { simOf } from '../RoomSim';
import { navGrid, profileOpen, sceneIndex, sceneKey, tileCentre } from '../World';

/**
 * The ambient townsfolk (round 8, GDD 3.24, docs/round8/townsfolk.md 2; Session 8E): a few figures per map that are
 * not seats. They have no card, no vote, no task list and no part in any win; the Knife never finds them
 * (`resolveHandle` knows only seats) and only a creature can kill one. Each walks its scene as an `Avatar` under an
 * opaque handle like a seat (A50), with a `villager` look and no new wire field, so nothing but the drawn figure
 * tells it apart. Everything else about a figure lives here in room memory. Every draw of a figure comes from its
 * own `townsfolk:<figureId>` stream, never a secret one.
 */

/** What a figure is doing: on its way to a station, working it, idling, or home for the night. */
export interface FigureAct {
  kind: 'travel' | 'work' | 'idle' | 'home';
  untilTick: number;
  station: Station | null;
  /** Where the walk ends: a point of `scene` in pixels. */
  goal: { scene: SceneId; x: number; y: number };
}

/** One ambient figure, in room memory only. */
export interface Figure {
  /** `folk<n>`, server only: never a seat id, never on the wire. */
  id: string;
  /** Its `routines.json` `townsfolk` kind (`clerk`, `tallyman`, `stallholder`, `villager`). */
  kind: string;
  row: TownsfolkRow;
  look: string;
  /** Needs and moods (`sim/npc/needs.ts`), the path plan and the bodies seen; a `Brain` like a seat's. */
  brain: Brain;
  /** Its own `townsfolk:<id>` stream, fetched once at the spawn (no draw after the deal asks the registry). */
  rng: Rng;
  handle: string | null;
  sceneIdx: number;
  x: number;
  y: number;
  yaw: number;
  moving: boolean;
  /** Still until this tick (a crossing). */
  busyUntilTick: number;
  home: SceneId | null;
  /** Its route: the one prop of a fixed figure, the named figure's loop, a villager's favourites. */
  stations: readonly Station[];
  nextStation: number;
  act: FigureAct | null;
  dead: boolean;
  /** Mid-mugging (`mug.ts`): the `threaten` clip while it stands over its target. */
  threatening: boolean;
}

interface TownsfolkMemory {
  figures: Map<string, Figure>;
  byHandle: Map<string, string>;
  spawned: boolean;
  /** The bodies the creatures left since the last meeting opened. */
  lost: { bodyId: string; scene: SceneId }[];
  /** How many the last meeting's opening cleared: the meeting line (`figureLossesOf`). */
  lastLosses: number;
  seq: number;
}

const memories = new WeakMap<PartyRoom, TownsfolkMemory>();

/** The room's townsfolk memory (`run.ts` and the invariant read it). */
export function townsfolkMemory(room: PartyRoom): TownsfolkMemory {
  let memory = memories.get(room);
  if (!memory) {
    memory = { figures: new Map(), byHandle: new Map(), spawned: false, lost: [], lastLosses: 0, seq: 0 };
    memories.set(room, memory);
  }
  return memory;
}

/** Every figure of the match by id, dead ones included. */
export const figuresOf = (room: PartyRoom): ReadonlyMap<string, Figure> => townsfolkMemory(room).figures;

/** The figure behind an avatar handle, or undefined for a seat's handle or an unknown one. */
export function figureOfHandle(room: PartyRoom, handle: string): Figure | undefined {
  const memory = townsfolkMemory(room);
  const id = memory.byHandle.get(handle);
  return id === undefined ? undefined : memory.figures.get(id);
}

/** The living named figure of a kind (8D's Company Clerk or Tallyman), or undefined when the map has none. */
export function namedFigure(room: PartyRoom, kind: string): Figure | undefined {
  for (const f of townsfolkMemory(room).figures.values()) if (f.kind === kind && !f.dead) return f;
  return undefined;
}

/** The living figures of a scene within `reachPx` of a point (8D's rent collection, 8E's mugging). */
export function figuresNear(
  room: PartyRoom,
  sceneIdx: number,
  x: number,
  y: number,
  reachPx: number,
): Figure[] {
  const out: Figure[] = [];
  for (const f of townsfolkMemory(room).figures.values()) {
    if (f.dead || f.sceneIdx !== sceneIdx) continue;
    if (Math.hypot(f.x - x, f.y - y) <= reachPx) out.push(f);
  }
  return out;
}

/** The figure's own stream (`seeds.ts`): its home, favourites, dwell times and idles; never shared, never secret. */
export const figureRng = (_room: PartyRoom, f: Figure): Rng => f.rng;

/** The profile the figures are built for: the fixed one, else the party size's (the rule of `drawPersonas`). */
function profileOfParty(room: PartyRoom): Profile {
  const sim = simOf(room);
  if (sim.profileFixed) return sim.profile;
  return profileFor(Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS_TO_START, room.state.players.size)));
}

/** One uniform, always drawn, picking from `pool` (null when empty): the number of draws never depends on the pool. */
function pick<T>(rng: () => number, pool: readonly T[]): T | null {
  const u = rng();
  return pool.length === 0 ? null : (pool[Math.min(pool.length - 1, Math.floor(u * pool.length))] as T);
}

const STAND_OFFSETS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * Every prop of the map's scenes present at `profile` as a station, whatever its kind (a seat's stations are only
 * the `routines.json` activity kinds; a figure's rows may name a `ledger` or a `rack`), with its floor stand tiles.
 */
function propStations(map: readonly SceneId[], profile: Profile): Station[] {
  const list: Station[] = [];
  for (const sceneId of map) {
    const scene = scenes[sceneId];
    if (!profileOpen(scene.profile, profile)) continue;
    const grid = navGrid(sceneId, profile);
    for (const prop of scene.props) {
      if (prop.profiles !== undefined && !prop.profiles.includes(profile)) continue;
      const stands = STAND_OFFSETS.map(([dx, dy]) => ({ x: prop.x + dx, y: prop.y + dy })).filter(
        (t) => !grid.solidAt(t.x, t.y),
      );
      if (stands.length === 0) continue;
      list.push({
        propId: prop.id,
        scene: sceneId,
        kind: prop.kind,
        activity: 'work',
        x: prop.x,
        y: prop.y,
        stands,
      });
    }
  }
  return list;
}

interface Plan {
  kind: string;
  row: TownsfolkRow;
  /** A fixed figure's one prop. */
  pinned: Station | null;
  /** A guard row's nth figure (round 10, B1). */
  index?: number;
}

/**
 * The locked match-start line (seams.md 5, beside the deal): `townsfolk.count[profile]` figures for the map, the
 * named one of the map first (the Clerk or the Tallyman), then one stallholder per shop prop, then villagers to
 * fill. Idempotent until the lobby reset clears them. Nothing here draws from any seat's stream.
 */
export function spawnTownsfolk(room: PartyRoom): void {
  const memory = townsfolkMemory(room);
  if (memory.spawned) return;
  memory.spawned = true;
  const profile = profileOfParty(room);
  const map = mapScenesOf(room);
  const mapId = mapIdOfRoom(room);
  const props = propStations(map, profile);
  const rows = Object.entries(routines.townsfolk).filter(
    ([, row]) => row.maps === undefined || row.maps.includes(mapId),
  );
  const plan: Plan[] = [];
  for (const [kind, row] of rows) if (row.named && !row.guard) plan.push({ kind, row, pinned: null });
  for (const [kind, row] of rows) {
    if (row.named || !row.fixed) continue;
    for (const s of props) if (row.stations.includes(s.kind)) plan.push({ kind, row, pinned: s });
  }
  const fillers = rows.filter(([, row]) => !row.named && !row.fixed);
  const n = balance.townsfolk.count[profile];
  for (let i = 0; plan.length < n && fillers.length > 0; i++) {
    const [kind, row] = fillers[i % fillers.length] as (typeof fillers)[number];
    plan.push({ kind, row, pinned: null });
  }
  for (const p of plan.slice(0, n)) makeFigure(room, memory, p, map, profile, props);
  // Round 10, B1: the guards (the Clerk, the Constables) after the counted figures, never taking their places.
  for (const p of guardPlans(rows)) makeFigure(room, memory, p, map, profile, props);
}

function makeFigure(
  room: PartyRoom,
  memory: TownsfolkMemory,
  plan: Plan,
  map: readonly SceneId[],
  profile: Profile,
  props: readonly Station[],
): void {
  const id = `folk${++memory.seq}`;
  const brain = new Brain();
  const f: Figure = {
    id,
    kind: plan.kind,
    row: plan.row,
    look: plan.row.look,
    brain,
    rng: room.seeds.get('townsfolk', id),
    handle: null,
    sceneIdx: sceneIndex(hubOf(room)),
    x: 0,
    y: 0,
    yaw: 0,
    moving: false,
    busyUntilTick: 0,
    home: null,
    stations: [],
    nextStation: 0,
    act: null,
    dead: false,
    threatening: false,
  };
  const rng = figureRng(room, f);
  // The home: a lit interior open at this party size (the rule of a seat's persona, GDD 3.12), from its own stream.
  const homes = map.filter(
    (s) => scenes[s].kind === 'interior' && profileOpen(scenes[s].profile, profile) && litAtNight(s),
  );
  f.home = pick(rng, homes);
  // The route: the pinned prop, the row's kinds in order (the first prop of each on the map), or favourites among
  // the seats' stations for a row that names none.
  if (plan.pinned) f.stations = [plan.pinned];
  else if (plan.row.guard) f.stations = leashRoute(plan.row, plan.index ?? 0, props);
  else if (plan.row.stations.length > 0) {
    const route: Station[] = [];
    for (const kind of plan.row.stations) {
      const s = props.find((q) => q.kind === kind);
      if (s) route.push(s);
    }
    f.stations = route;
  } else {
    const pool = stationsOf(map, profile);
    const favourites: Station[] = [];
    for (let i = 0; i < balance.npc.routine.favouriteStations; i++) {
      const taken = new Set(favourites.map((s) => s.scene));
      const apart = pool.filter((s) => !taken.has(s.scene));
      const next = pick(rng, apart.length > 0 ? apart : pool.filter((s) => !favourites.includes(s)));
      if (next) favourites.push(next);
    }
    f.stations = favourites;
  }
  if (plan.row.guard) bindGuard(f); // its home is its post's scene (round 10, B1)
  brain.persona = { home: f.home, favourites: f.stations.map((s) => s.propId) };
  // Where it starts: its first station's stand, else its home's first spawn, else the hub's first start spawn.
  const first = f.stations[0];
  if (first) {
    const stand = first.stands[0] as { x: number; y: number };
    f.sceneIdx = sceneIndex(first.scene);
    f.x = tileCentre(stand.x, TILE_PX);
    f.y = tileCentre(stand.y, TILE_PX);
  } else {
    const site =
      f.home === null ? startSpawnsOf(room)[0] : { sceneId: f.home, spawn: scenes[f.home].spawns[0]?.id };
    const spawn = site && scenes[site.sceneId].spawns.find((s) => s.id === site.spawn);
    if (site && spawn) {
      f.sceneIdx = sceneIndex(site.sceneId);
      f.x = tileCentre(spawn.x, TILE_PX);
      f.y = tileCentre(spawn.y, TILE_PX);
    }
  }
  memory.figures.set(id, f);
  ensureBody(room, id, true); // its health lives in the body (GDD 3.22): no stamina, regained like a seat's
  bindFigureNeeds(room, id, brain);
  rehandleFigure(room, f);
}

/** Copies the figure onto its avatar: a `villager` look, the townsfolk height, no status bit and no seat, ever. */
function writeFigure(avatar: AvatarState, f: Figure): void {
  avatar.lookOf = f.look;
  avatar.height = balance.townsfolk.height;
  const x = Math.round(f.x);
  const y = Math.round(f.y);
  if (avatar.x !== x) avatar.x = x;
  if (avatar.y !== y) avatar.y = y;
  avatar.z = 0;
  if (avatar.yaw !== f.yaw) avatar.yaw = f.yaw;
  const animId = f.moving
    ? AnimId.walk
    : f.threatening
      ? AnimId.threaten
      : f.act?.kind === 'work'
        ? AnimId.interact
        : (moodIdleFor(f.brain) ?? AnimId.idle);
  if (avatar.animId !== animId) avatar.animId = animId;
  avatar.statusBits = 0;
  avatar.transitUntilTick = 0;
  avatar.seat = '';
}

/** Drops the figure's avatar and handle, if any. */
function dropHandle(room: PartyRoom, f: Figure): void {
  const handle = f.handle;
  if (handle === null) return;
  const memory = avatarMemory(room);
  const scene = memory.sceneOf.get(handle);
  if (scene !== undefined) room.state.scenes.get(scene)?.avatars.delete(handle);
  memory.sceneOf.delete(handle);
  townsfolkMemory(room).byHandle.delete(handle);
  f.handle = null;
  simOf(room).viewsDirty = true;
}

/**
 * A new handle for the figure in the scene of `sceneIdx` (every scene entry, like a seat's `rehandle`): the old
 * avatar is deleted, a fresh `Avatar` created; the handle is registered in the handle memory's `sceneOf` (so
 * `avatarOf` finds it and the lobby reset removes it) but never in `seatOf`.
 */
export function rehandleFigure(room: PartyRoom, f: Figure): void {
  dropHandle(room, f);
  const scene = sceneKey(f.sceneIdx);
  const sceneState = room.state.scenes.get(scene);
  if (!sceneState) return;
  const handle = newHandle(room);
  const avatar = new Avatar();
  writeFigure(avatar, f);
  sceneState.avatars.set(handle, avatar);
  avatarMemory(room).sceneOf.set(handle, scene);
  townsfolkMemory(room).byHandle.set(handle, f.id);
  f.handle = handle;
  simOf(room).viewsDirty = true;
}

/** After the figure's tick: its presence onto its avatar; a missing one (the lobby reset's sweep) is re-handled. */
export function publishFigure(room: PartyRoom, f: Figure): void {
  const avatar =
    f.handle === null ? undefined : room.state.scenes.get(sceneKey(f.sceneIdx))?.avatars.get(f.handle);
  if (!avatar) {
    rehandleFigure(room, f);
    return;
  }
  writeFigure(avatar, f);
  const clip = guardClip(room, f); // a guard's strike, flinch and knockdown (round 10, B1)
  if (clip !== null && avatar.animId !== clip) avatar.animId = clip;
}

/**
 * A creature's attack lands on a living figure: the wolf's `mobs.json` damage off its body's health, which
 * `body/run.ts` regains like a seat's (GDD 3.22). Returns whether it killed. Only a creature that `kills` can take
 * a figure to zero; any other leaves it at one.
 */
export function hurtFigure(room: PartyRoom, id: string, kills: boolean): boolean {
  const f = townsfolkMemory(room).figures.get(id);
  if (!f || f.dead) return false;
  const body = ensureBody(room, id, true);
  body.hp = Math.max(kills ? 0 : 1, body.hp - mobs.mobs.wolf!.dmg);
  body.lastHurtTick = room.state.tick;
  if (body.hp > 0) return false;
  killFigure(room, f);
  return true;
}

/**
 * The creature-only death (GDD 3.24): the avatar goes, a public `Body` lies where it fell (`body_<figureId>`,
 * never reportable: a figure's body opens no meeting, so it is marked reported from the start) until the next
 * meeting clears it with a line.
 */
function killFigure(room: PartyRoom, f: Figure): void {
  f.dead = true;
  f.act = null;
  f.moving = false;
  dropHandle(room, f);
  bindFigureNeeds(room, f.id, null);
  removeBody(room, f.id);
  const sceneId = sceneKey(f.sceneIdx);
  spawnBody(room, sceneId, f.id, Math.floor(f.x / TILE_PX), Math.floor(f.y / TILE_PX));
  const bodyId = `body_${f.id}`;
  simOf(room).reportedBodies.add(bodyId);
  townsfolkMemory(room).lost.push({ bodyId, scene: sceneId });
  emitSim(room, {
    tick: room.state.tick,
    kind: 'figure.death',
    data: { figure: f.id, cause: 'wolf', sceneId },
  });
}

/**
 * The locked meeting-start line (seams.md 5): every body the creatures left since the last meeting leaves its
 * scene; returns how many, kept for the meeting line (`figureLossesOf`).
 */
export function clearFigureBodies(room: PartyRoom): number {
  const memory = townsfolkMemory(room);
  const sim = simOf(room);
  for (const { bodyId, scene } of memory.lost) {
    room.state.scenes.get(scene)?.bodies.delete(bodyId);
    sim.reportedBodies.delete(bodyId);
  }
  memory.lastLosses = memory.lost.length;
  memory.lost = [];
  return memory.lastLosses;
}

/** How many townsfolk the last meeting's opening mourned (the meeting text's line, `ui/copy/townsfolk.ts`). */
export const figureLossesOf = (room: PartyRoom): number => townsfolkMemory(room).lastLosses;

/** The lobby: every figure, body and handle goes; the next deal spawns afresh. */
export function clearTownsfolk(room: PartyRoom): void {
  const memory = townsfolkMemory(room);
  for (const f of memory.figures.values()) {
    dropHandle(room, f);
    bindFigureNeeds(room, f.id, null);
    removeBody(room, f.id);
  }
  for (const { bodyId, scene } of memory.lost) room.state.scenes.get(scene)?.bodies.delete(bodyId);
  memory.figures.clear();
  memory.byHandle.clear();
  memory.lost = [];
  memory.lastLosses = 0;
  memory.spawned = false;
  memory.seq = 0;
}
