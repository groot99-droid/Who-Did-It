import { abilities, balance, clues as clueDefs, roles, scenes, type SceneId } from '@wdi/content';
import { ClueKind, DoorState, TICK_RATE, TILE_PX, besideTile, trailDir } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { nearestPortalTile, removeClue, spawnClue } from '../Clues';
import { count, take } from '../Inventory';
import { emitNoise } from '../Noise';
import { refusal, type Refusal } from '../refusal';
import { type PlayerSim, simOf } from '../RoomSim';
import { isVerbPhase, navGrid, reject, sceneKey, tileCentre } from '../World';

// Round 10, V2 (10V; GDD 3.2 and 3.4): the cover-up verbs. Each is an `act.hold` the server re-validates every tick
// (`runHolds`); nothing here adds a message or a field to any client. What a watcher sees is what the verb does in
// the scene: a body that moves or is gone, a clue that is gone or laid, Blood that is gone, a door that is open or
// broken, and a noise from the table of `balance.json`. The hold itself shows what every hold shows (`interact`).

export const COVERUP_HOLDS = ['drag', 'clean', 'wash', 'unlock', 'crowbar'] as const;
export type CoverupHold = (typeof COVERUP_HOLDS)[number];
export const isCoverupHold = (action: unknown): action is CoverupHold =>
  typeof action === 'string' && (COVERUP_HOLDS as readonly string[]).includes(action);

const RAG = 'bloodyRag';
const BUCKET = 'bucket';
const SKELETON_KEY = 'skeletonKey';
const CROWBAR = 'crowbar';
/** Props that hold water to wash in: the basins and the pumps (GDD 3.4, "the well or a basin"). */
const WATER_KINDS: ReadonlySet<string> = new Set(['basin', 'pump', 'well']);
const KIND_ID = new Map<number, string>(Object.entries(ClueKind).map(([id, kind]) => [kind, id]));

const ticks = (s: number): number => Math.round(s * TICK_RATE);
const dist = (p: PlayerSim, x: number, y: number): number => Math.hypot(p.x - x, p.y - y);
const inReach = (p: PlayerSim, x: number, y: number, tiles = balance.doors.reachTiles): boolean =>
  dist(p, x, y) <= tiles * TILE_PX;

const hasCard = (room: PartyRoom, sessionId: string, ability: string): boolean =>
  roles.roles[room.state.players.get(sessionId)?.priv.role.roleId ?? '']?.abilities.includes(ability) ===
  true;

/** Checks every cover-up hold shares: a verb phase, a living placed seat that is not in a crossing. */
function seatProblem(room: PartyRoom, p: PlayerSim): Refusal | null {
  if (!isVerbPhase(room.state.phase)) return refusal('PHASE_CLOSED');
  if (p.dead || !p.placed) return refusal('NOT_IN_PLAY');
  if (room.state.tick < p.busyUntilTick) return refusal('BUSY');
  return null;
}

const castOf = (id: string): number => ticks(abilities.abilities[id]?.castS ?? 0);

// ---- Drag body --------------------------------------------------------------------------------------------------

interface DragState {
  smears: number;
  lastSmear: { x: number; y: number };
  fromTile: { x: number; y: number };
}
const drags = new WeakMap<PlayerSim, DragState>();

/** The speed factor of a seat that drags (`abilities.json` `dragBody`); 1 for everyone else. Called by `applyInputs`. */
export const dragSpeedFactor = (p: PlayerSim): number =>
  p.hold?.action === 'drag' ? (abilities.abilities.dragBody?.params?.speedFactor ?? 1) : 1;

function dragProblem(room: PartyRoom, sessionId: string, p: PlayerSim, bodyId: string): Refusal | null {
  const seat = seatProblem(room, p);
  if (seat) return seat;
  const body = room.state.scenes.get(sceneKey(p.sceneIdx))?.bodies.get(bodyId);
  if (!body || body.hidden) return refusal('NOTHING_THERE');
  for (const [id, other] of simOf(room).players) {
    if (id !== sessionId && other.hold?.action === 'drag' && other.hold.targetId === bodyId) {
      return refusal('BUSY');
    }
  }
  return null;
}

/** `act.hold {action: 'drag', targetId: bodyId, on: true}`: takes hold of a body in reach. Release is `on: false`. */
export function handleDragHold(room: PartyRoom, sessionId: string, targetId: unknown): void {
  const p = simOf(room).players.get(sessionId);
  if (!p) return;
  if (typeof targetId !== 'string' || targetId.length === 0 || targetId.length > 64) {
    return reject(room, sessionId, 'BAD_REQUEST');
  }
  if (!hasCard(room, sessionId, 'dragBody')) return reject(room, sessionId, 'NOT_YOUR_POWER');
  const problem = dragProblem(room, sessionId, p, targetId);
  if (problem) return reject(room, sessionId, problem);
  const body = room.state.scenes.get(sceneKey(p.sceneIdx))?.bodies.get(targetId);
  if (!body) return;
  if (!inReach(p, body.x, body.y)) return reject(room, sessionId, 'TOO_FAR', { of: 'body' });
  if (p.hold?.action === 'drag' && p.hold.targetId === targetId) return;
  p.hold = { action: 'drag', targetId, startTick: room.state.tick };
  const tile = { x: Math.floor(body.x / TILE_PX), y: Math.floor(body.y / TILE_PX) };
  drags.set(p, { smears: 0, lastSmear: tile, fromTile: tile });
  laySmear(room, p, tile, tile);
}

function laySmear(
  room: PartyRoom,
  p: PlayerSim,
  at: { x: number; y: number },
  from: { x: number; y: number },
): void {
  const state = drags.get(p);
  if (!state || state.smears >= balance.coverup.dragSmearMax) return;
  state.smears += 1;
  state.lastSmear = at;
  const portal = nearestPortalTile(sceneKey(p.sceneIdx) as SceneId, at.x, at.y);
  const dir =
    at.x === from.x && at.y === from.y
      ? portal
        ? trailDir(at.x, at.y, portal.x, portal.y)
        : 4
      : trailDir(from.x, from.y, at.x, at.y);
  spawnClue(room, sceneKey(p.sceneIdx) as SceneId, {
    kind: ClueKind.dragSmear,
    value: 0,
    dir,
    tx: at.x,
    ty: at.y,
  });
}

/** The body spot (`B`) of the dragger's scene within reach of the dragger, if any. */
function bodySpotNear(p: PlayerSim) {
  const sceneId = sceneKey(p.sceneIdx) as SceneId;
  return scenes[sceneId].spots.find(
    (s) =>
      s.kind === 'body' &&
      inReach(p, tileCentre(s.x, TILE_PX), tileCentre(s.y, TILE_PX), balance.coverup.spotReachTiles),
  );
}

/** Lets go of a drag. A release beside a body spot hides the body there; anything else leaves it where it lies. */
export function dropDrag(room: PartyRoom, p: PlayerSim, intentional: boolean): void {
  const hold = p.hold;
  p.hold = null;
  drags.delete(p);
  if (!hold || hold.action !== 'drag' || !intentional) return;
  const sceneId = sceneKey(p.sceneIdx) as SceneId;
  const scene = room.state.scenes.get(sceneId);
  const body = scene?.bodies.get(hold.targetId);
  const spot = bodySpotNear(p);
  if (!scene || !body || !spot) return;
  // Out of the scene's view altogether: a watcher sees the body vanish, nothing more. A later Check restores it (V3).
  simOf(room).hiddenBodies.set(body.id, { sceneId, spotId: spot.id, of: body.of, x: body.x, y: body.y });
  scene.bodies.delete(body.id);
}

function tickDrag(room: PartyRoom, sessionId: string, p: PlayerSim): void {
  const hold = p.hold;
  if (!hold) return;
  const body = room.state.scenes.get(sceneKey(p.sceneIdx))?.bodies.get(hold.targetId);
  if (
    dragProblem(room, sessionId, p, hold.targetId) ||
    !body ||
    !inReach(p, body.x, body.y, balance.doors.reachTiles * 2)
  ) {
    return dropDrag(room, p, false);
  }
  const lag = p.positionAt(balance.coverup.dragLagTicks);
  if (!lag) return;
  body.x = Math.round(lag.x);
  body.y = Math.round(lag.y);
  const state = drags.get(p);
  if (!state) return;
  const tile = { x: Math.floor(body.x / TILE_PX), y: Math.floor(body.y / TILE_PX) };
  if (
    Math.hypot(tile.x - state.lastSmear.x, tile.y - state.lastSmear.y) >= balance.coverup.dragSmearEveryTiles
  ) {
    laySmear(room, p, tile, state.lastSmear);
  }
}

// ---- Clean (the Bloody Rag) -------------------------------------------------------------------------------------

function cleanProblem(room: PartyRoom, sessionId: string, p: PlayerSim, clueId: string): Refusal | null {
  const seat = seatProblem(room, p);
  if (seat) return seat;
  const player = room.state.players.get(sessionId);
  const clue = room.state.scenes.get(sceneKey(p.sceneIdx))?.clues.get(clueId);
  if (!player || !clue || clueDefs.clues[KIND_ID.get(clue.kind) ?? '']?.collectible !== true) {
    return refusal('NOTHING_THERE');
  }
  if (!inReach(p, clue.x, clue.y)) return refusal('TOO_FAR', { of: 'clue' });
  if (count(player, RAG) < 1) return refusal('NEED_ITEM', { need: RAG });
  return null;
}

// ---- Wash (the Bucket) ------------------------------------------------------------------------------------------

function waterNear(p: PlayerSim, propId: string) {
  return scenes[sceneKey(p.sceneIdx) as SceneId].props.find(
    (q) => q.id === propId && WATER_KINDS.has(q.kind),
  );
}

function washProblem(room: PartyRoom, sessionId: string, p: PlayerSim, propId: string): Refusal | null {
  const seat = seatProblem(room, p);
  if (seat) return seat;
  const player = room.state.players.get(sessionId);
  const water = waterNear(p, propId);
  if (!player || !water || !inReach(p, tileCentre(water.x, TILE_PX), tileCentre(water.y, TILE_PX))) {
    return refusal('NOTHING_THERE');
  }
  if (count(player, BUCKET) < 1) return refusal('NEED_ITEM', { need: BUCKET });
  if (room.state.tick >= p.bloodyUntilTick) return refusal('NOTHING_THERE');
  return null;
}

// ---- Doors (the Skeleton Key and the Crowbar) -------------------------------------------------------------------

const doorKey = (sceneId: string, portalId: string): string => `${sceneId}/${portalId}`;

/** Whether a portal's lock still holds: a keyed door the Skeleton Key or the Crowbar opened is no longer locked. */
export function lockStands(room: PartyRoom, sceneId: string, portalId: string, locked: boolean): boolean {
  return locked && !simOf(room).openedDoors.has(doorKey(sceneId, portalId));
}

/** The public state a keyed portal shows now (`DoorState`): locked, or what a verb left it as. */
export function openedDoorState(room: PartyRoom, sceneId: string, portalId: string): number | undefined {
  return simOf(room).openedDoors.get(doorKey(sceneId, portalId));
}

function doorProblem(
  room: PartyRoom,
  sessionId: string,
  p: PlayerSim,
  portalId: string,
  action: 'unlock' | 'crowbar',
): Refusal | null {
  const seat = seatProblem(room, p);
  if (seat) return seat;
  const player = room.state.players.get(sessionId);
  const sceneId = sceneKey(p.sceneIdx);
  const portal = scenes[sceneId as SceneId].portals.find((q) => q.id === portalId);
  if (!player || !portal || portal.lock === null) return refusal('NOTHING_THERE');
  if (simOf(room).openedDoors.has(doorKey(sceneId, portalId))) return refusal('ALREADY_DONE');
  if (!inReach(p, tileCentre(portal.x, TILE_PX), tileCentre(portal.y, TILE_PX))) {
    return refusal('TOO_FAR', { of: 'door' });
  }
  if (action === 'unlock')
    return count(player, SKELETON_KEY) < 1 ? refusal('NEED_KEY', { need: SKELETON_KEY }) : null;
  return count(player, CROWBAR) < 1 ? refusal('NEED_TOOL', { need: CROWBAR }) : null;
}

// ---- The entry points -------------------------------------------------------------------------------------------

const problemOf = (
  room: PartyRoom,
  sessionId: string,
  p: PlayerSim,
  action: CoverupHold,
  targetId: string,
): Refusal | null => {
  if (action === 'drag') return dragProblem(room, sessionId, p, targetId);
  if (action === 'clean') return cleanProblem(room, sessionId, p, targetId);
  if (action === 'wash') return washProblem(room, sessionId, p, targetId);
  return doorProblem(room, sessionId, p, targetId, action);
};

/** Call site: `handleHold`, for `on: true` of a cover-up action other than `drag`'s own start. */
export function handleCoverupHold(
  room: PartyRoom,
  sessionId: string,
  action: CoverupHold,
  targetId: unknown,
): void {
  if (action === 'drag') return handleDragHold(room, sessionId, targetId);
  const p = simOf(room).players.get(sessionId);
  if (!p) return;
  if (typeof targetId !== 'string' || targetId.length === 0 || targetId.length > 64) {
    return reject(room, sessionId, 'BAD_REQUEST');
  }
  const problem = problemOf(room, sessionId, p, action, targetId);
  if (problem) return reject(room, sessionId, problem);
  if (p.hold?.action === action && p.hold.targetId === targetId) return;
  p.hold = { action, targetId, startTick: room.state.tick };
}

/** Call site: `runHolds`, once a tick for every seat whose hold is a cover-up action. */
export function tickCoverup(room: PartyRoom, sessionId: string, p: PlayerSim): void {
  const hold = p.hold;
  if (!hold || !isCoverupHold(hold.action)) return;
  if (hold.action === 'drag') return tickDrag(room, sessionId, p);
  if (problemOf(room, sessionId, p, hold.action, hold.targetId) || p.vx !== 0 || p.vy !== 0) {
    p.hold = null;
    return;
  }
  const castId = { clean: 'rag', wash: 'wash', unlock: 'skeletonKey', crowbar: 'crowbar' }[hold.action];
  if (room.state.tick - hold.startTick < castOf(castId)) return;
  p.hold = null;
  if (hold.action === 'clean') finishClean(room, sessionId, p, hold.targetId);
  else if (hold.action === 'wash') finishWash(room, sessionId, p, hold.targetId);
  else finishDoor(room, sessionId, p, hold.targetId, hold.action);
}

function finishClean(room: PartyRoom, sessionId: string, p: PlayerSim, clueId: string): void {
  const player = room.state.players.get(sessionId);
  const scene = room.state.scenes.get(sceneKey(p.sceneIdx));
  const clue = scene?.clues.get(clueId);
  if (!player || !clue || !take(player, RAG, 1)) return;
  removeClue(room, clueId);
  emitNoise(room, sceneKey(p.sceneIdx) as SceneId, clue.x, clue.y, balance.noise.rag, 'rag', player.id);
}

function finishWash(room: PartyRoom, sessionId: string, p: PlayerSim, propId: string): void {
  const sceneId = sceneKey(p.sceneIdx) as SceneId;
  const water = waterNear(p, propId);
  if (!water) return;
  p.bloodyUntilTick = 0;
  const grid = navGrid(sceneId, simOf(room).profile);
  const at = besideTile(
    { x: water.x, y: water.y },
    { x: Math.floor(p.x / TILE_PX), y: Math.floor(p.y / TILE_PX) },
    (x, y) => !grid.solidAt(x, y),
  );
  spawnClue(room, sceneId, { kind: ClueKind.wetBucket, value: 0, dir: 0, tx: at.x, ty: at.y });
}

function finishDoor(
  room: PartyRoom,
  sessionId: string,
  p: PlayerSim,
  portalId: string,
  action: 'unlock' | 'crowbar',
): void {
  const sim = simOf(room);
  const player = room.state.players.get(sessionId);
  const sceneId = sceneKey(p.sceneIdx);
  const portal = scenes[sceneId as SceneId].portals.find((q) => q.id === portalId);
  const door = room.state.scenes.get(sceneId)?.doors.get(portalId);
  if (!player || !portal) return;
  const state = action === 'unlock' ? DoorState.open : DoorState.broken;
  sim.openedDoors.set(doorKey(sceneId, portalId), state);
  if (door) door.state = state;
  if (action === 'unlock') {
    // The Skeleton Key leaves a print on the door: the last three touchers, kept server-side (GDD 3.4).
    const touched = sim.doorTouches.get(doorKey(sceneId, portalId)) ?? [];
    sim.doorTouches.set(
      doorKey(sceneId, portalId),
      [...touched.filter((id) => id !== sessionId), sessionId].slice(-3),
    );
  }
  const noise = action === 'unlock' ? balance.noise.skeletonKey : balance.noise.crowbar;
  emitNoise(
    room,
    sceneId as SceneId,
    tileCentre(portal.x, TILE_PX),
    tileCentre(portal.y, TILE_PX),
    noise,
    action === 'unlock' ? 'skeletonKey' : 'crowbar',
    player.id,
  );
}
