import { abilities, balance, clues as clueDefs, roles, type SceneId } from '@wdi/content';
import {
  ClueKind,
  NotebookStatus,
  S2C,
  TICK_RATE,
  TILE_PX,
  TRAIT_IDS,
  besideTile,
  trailDir,
} from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { nearestPortalTile, spawnClue } from '../Clues';
import { addStack, count, take } from '../Inventory';
import { refusal, type Refusal } from '../refusal';
import { type PlayerSim, type RoomSim, simOf } from '../RoomSim';
import { isVerbPhase, navGrid, reject, sceneKey } from '../World';
import { entryFor, isPlanted, markPlanted, writeClueEntry } from './notebook';

// Round 10, V1a (10V; GDD 3.2 and 3.4): the Lens Inspect and Plant Clue. A plant is a clue like any other on the
// wire; only the planted mark in room memory (`notebook.ts`) tells it apart, and only a Lens reads that mark, into
// the inspector's own Notebook.

const LENS = 'lens';
const MAGNIFIER = 'magnifier';
const KIND_ID = new Map<number, string>(Object.entries(ClueKind).map(([id, kind]) => [kind, id]));

const hasCard = (room: PartyRoom, sessionId: string, ability: string): boolean =>
  roles.roles[room.state.players.get(sessionId)?.priv.role.roleId ?? '']?.abilities.includes(ability) ===
  true;

const inReach = (p: PlayerSim, x: number, y: number): boolean =>
  Math.hypot(p.x - x, p.y - y) <= balance.doors.reachTiles * TILE_PX;

/** Why a Lens Inspect of `clueId` cannot start or go on this tick, or null. */
function inspectProblem(room: PartyRoom, sessionId: string, p: PlayerSim, clueId: string): Refusal | null {
  const player = room.state.players.get(sessionId);
  if (!player) return refusal('NOT_IN_PLAY');
  if (!isVerbPhase(room.state.phase)) return refusal('PHASE_CLOSED');
  if (p.dead || !p.placed) return refusal('NOT_IN_PLAY');
  if (room.state.tick < p.busyUntilTick) return refusal('BUSY');
  const clue = room.state.scenes.get(sceneKey(p.sceneIdx))?.clues.get(clueId);
  const meta = simOf(room).clueMeta.get(clueId);
  const def = clueDefs.clues[KIND_ID.get(clue?.kind ?? -1) ?? ''];
  if (!clue || !meta || def?.collectible !== true) return refusal('NOTHING_THERE');
  if (!inReach(p, clue.x, clue.y)) return refusal('TOO_FAR', { of: 'clue' });
  if (count(player, MAGNIFIER) < 1) return refusal('NEED_TOOL', { need: MAGNIFIER });
  if (count(player, LENS) < 1) return refusal('NEED_ITEM', { need: LENS });
  const read = entryFor(player, sessionId, meta)?.status;
  if (read === NotebookStatus.verified || read === NotebookStatus.forged) {
    return refusal('ALREADY_DONE', { what: 'notebook' });
  }
  return null;
}

/** `act.hold {action: 'inspect', targetId}`: starts a Lens Inspect of a clue in reach. */
export function handleInspectHold(room: PartyRoom, sessionId: string, targetId: unknown): void {
  const p = simOf(room).players.get(sessionId);
  if (!p) return;
  if (typeof targetId !== 'string' || targetId.length === 0 || targetId.length > 64) {
    return reject(room, sessionId, 'BAD_REQUEST');
  }
  const problem = inspectProblem(room, sessionId, p, targetId);
  if (problem) return reject(room, sessionId, problem);
  if (p.hold?.action === 'inspect' && p.hold.targetId === targetId) return;
  p.hold = { action: 'inspect', targetId, startTick: room.state.tick };
}

/** Call site: `runHolds`. The card's Inspect takes `castS`; anyone else with a Magnifier takes the dropped cast. */
export function tickInspect(room: PartyRoom, sessionId: string, p: PlayerSim): void {
  const hold = p.hold;
  const player = room.state.players.get(sessionId);
  if (!hold || !player) return;
  if (inspectProblem(room, sessionId, p, hold.targetId) || p.vx !== 0 || p.vy !== 0) {
    p.hold = null;
    return;
  }
  const def = abilities.abilities.inspect;
  const castS = hasCard(room, sessionId, 'inspect') ? def?.castS : def?.params?.droppedMagnifierCastS;
  if (room.state.tick - hold.startTick < Math.round((castS ?? 0) * TICK_RATE)) return;
  p.hold = null;
  const sim = simOf(room);
  const clue = room.state.scenes.get(sceneKey(p.sceneIdx))?.clues.get(hold.targetId);
  const meta = sim.clueMeta.get(hold.targetId);
  if (!clue || !meta || !take(player, LENS, 1)) return;
  // The Lens sets only the status: a hidden attribute (the felt's hat) will be a reading entry of its own (6Z).
  const status = isPlanted(meta) ? NotebookStatus.forged : NotebookStatus.verified;
  const entry = entryFor(player, sessionId, meta);
  if (entry) {
    entry.status = status;
    room.clients.getById(sessionId)?.send(S2C.clueFound, { entryId: entry.id });
  } else {
    meta.collectors.add(sessionId);
    clue.claimed = true;
    writeClueEntry(room, sessionId, player, p, clue, meta, status);
  }
  player.priv.lensCharges = Math.min(255, count(player, LENS));
}

const PLANTS: Readonly<Record<string, { kind: number; values: readonly string[] }>> = {
  footprints: { kind: ClueKind.footprints, values: TRAIT_IDS.height },
  thread: { kind: ClueKind.thread, values: TRAIT_IDS.scarf },
};

/** `act.ability {abilityId: 'plantClue', kind, value}`: lays a footprint or a thread with the traits chosen. */
export function handlePlantClue(
  room: PartyRoom,
  sessionId: string,
  payload: Record<string, unknown>,
  actorOf: (room: PartyRoom, sessionId: string) => PlayerSim | null,
): void {
  const def = abilities.abilities.plantClue;
  const player = room.state.players.get(sessionId);
  if (!def || !player) return;
  if (!hasCard(room, sessionId, 'plantClue')) return reject(room, sessionId, 'NOT_YOUR_POWER');
  const p = actorOf(room, sessionId);
  if (!p) return;
  const tick = room.state.tick;
  if (tick < (player.priv.cooldownEndTick.get('plantClue') ?? 0)) return reject(room, sessionId, 'COOLDOWN');
  const plant = typeof payload.kind === 'string' ? PLANTS[payload.kind] : undefined;
  const value = payload.value;
  if (
    !plant ||
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value >= plant.values.length
  ) {
    return reject(room, sessionId, 'BAD_REQUEST');
  }
  // A plant follows its kind's true rule in every wire field (6Z): a kill's Footprints lie on its tile and run
  // toward the nearest portal, and its Thread lies on the walkable tile beside that portal, so a thread is planted
  // only within reach of a portal, there.
  const sceneId = sceneKey(p.sceneIdx) as SceneId;
  const tx = Math.floor(p.x / TILE_PX);
  const ty = Math.floor(p.y / TILE_PX);
  const portal = nearestPortalTile(sceneId, tx, ty);
  const thread = plant.kind === ClueKind.thread;
  if (thread && (!portal || Math.hypot(portal.x - tx, portal.y - ty) > balance.doors.reachTiles)) {
    return reject(room, sessionId, 'TOO_FAR', { of: 'door' });
  }
  if (!take(player, def.consumes ?? 'plantKit', 1))
    return reject(room, sessionId, 'SPENT', { what: 'stock' });
  const grid = navGrid(sceneId, simOf(room).profile);
  const at =
    thread && portal ? besideTile(portal, { x: tx, y: ty }, (x, y) => !grid.solidAt(x, y)) : { x: tx, y: ty };
  const dir = thread ? 0 : portal ? trailDir(tx, ty, portal.x, portal.y) : 4;
  const id = spawnClue(room, sceneId, { kind: plant.kind, value, dir, tx: at.x, ty: at.y });
  const meta = id === null ? undefined : simOf(room).clueMeta.get(id);
  if (meta) markPlanted(meta);
  player.priv.cooldownEndTick.set('plantClue', tick + Math.round((def.cooldownS ?? 0) * TICK_RATE));
  p.busyUntilTick = tick + Math.round((def.castS ?? 0) * TICK_RATE);
}

const lastRound = new WeakMap<RoomSim, number>();

/**
 * Call site: `runHolds`, every tick. At each new day (`GameState.round`, so a pause in the phases never runs it
 * twice) a card with Inspect gets `lensPerMeeting` Lenses back, up to `lensMax` (world mode has no daily meeting);
 * `Private.lensCharges` mirrors the Lens count of every seat.
 */
export function runEvidence(room: PartyRoom): void {
  const sim = simOf(room);
  const round = room.state.round;
  const seen = lastRound.get(sim);
  const dawn = seen !== undefined && round > seen;
  lastRound.set(sim, round);
  const params = abilities.abilities.inspect?.params;
  for (const [sessionId, player] of room.state.players) {
    if (!player.priv) continue;
    let lenses = count(player, LENS);
    const max = params?.lensMax ?? 0;
    if (dawn && lenses < max && !sim.players.get(sessionId)?.dead && hasCard(room, sessionId, 'inspect')) {
      if (addStack(player, LENS, Math.min(params?.lensPerMeeting ?? 0, max - lenses)))
        lenses = count(player, LENS);
    }
    if (player.priv.lensCharges !== Math.min(255, lenses)) player.priv.lensCharges = Math.min(255, lenses);
  }
}
