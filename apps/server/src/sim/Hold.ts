import { abilities, balance, roles } from '@wdi/content';
import {
  ErrorCode,
  NotebookEntry,
  NotebookStatus,
  S2C,
  TICK_RATE,
  TILE_PX,
  type PlayerState,
} from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { type PlayerSim, simOf } from './RoomSim';
import { isLoft, isVerbPhase, reject, sceneKey } from './World';
import { handleCraft, tickCraft } from './Craft';
import { handleTaskHold } from './Minigames';
import { handleGather, tickGather } from './Resources';

const CLUE_TEACHING = 'clue_teaching';

/** The clue a collect hold points at, when it is in the holder's own scene. */
function clueFor(room: PartyRoom, p: PlayerSim, clueId: string) {
  return room.state.scenes.get(sceneKey(p.sceneIdx))?.clues.get(clueId);
}

function inReach(p: PlayerSim, x: number, y: number): boolean {
  return Math.hypot(p.x - x, p.y - y) <= balance.doors.reachTiles * TILE_PX;
}

/** Why a collect hold cannot run this tick, or null (also the check that starts it). */
function holdProblem(
  room: PartyRoom,
  sessionId: string,
  p: PlayerSim,
  clueId: string,
): { code: ErrorCode; msg: string } | null {
  if (!isVerbPhase(room.state.phase)) return { code: ErrorCode.wrongPhase, msg: 'not now' };
  if (p.dead || !p.placed || isLoft(p.sceneIdx)) return { code: ErrorCode.cannot, msg: 'not now' };
  if (room.state.tick < p.busyUntilTick) return { code: ErrorCode.busy, msg: 'busy' };
  const clue = clueFor(room, p, clueId);
  if (!clue) return { code: ErrorCode.cannot, msg: 'nothing there' };
  if (!inReach(p, clue.x, clue.y)) return { code: ErrorCode.outOfRange, msg: 'too far' };
  if (simOf(room).clueMeta.get(clueId)?.collectors.has(sessionId)) {
    return { code: ErrorCode.cannot, msg: 'already in your notebook' };
  }
  return null;
}

/** `act.hold {action, targetId, on}`: only Collect exists in M3; the hold lives in `PlayerSim.hold`. */
export function handleHold(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): void {
  const player = room.state.players.get(sessionId);
  const p = simOf(room).players.get(sessionId);
  if (!player || !p) return;
  const { action, targetId, on } = payload;
  if (typeof on !== 'boolean') return;
  if (!on) {
    p.hold = null;
    return;
  }
  // Round 6 (locked call sites): the M5b holds go to their owners' files (6F); each refuses until it lands.
  if ((action === 'gather' || action === 'craft') && typeof targetId === 'string' && targetId.length > 0) {
    if (action === 'gather') handleGather(room, sessionId, targetId);
    else handleCraft(room, sessionId, targetId);
    return;
  }
  // Round 6 (6H): a station task's hold opens its mini-game (GDD 3.16); the answer arrives as `minigame.result`.
  if (action === 'task' && typeof targetId === 'string' && targetId.length > 0 && targetId.length <= 64) {
    handleTaskHold(room, sessionId, targetId);
    return;
  }
  if (action !== 'collect' || typeof targetId !== 'string' || targetId.length === 0 || targetId.length > 64) {
    reject(room, sessionId, ErrorCode.cannot, 'cannot do that');
    return;
  }
  const problem = holdProblem(room, sessionId, p, targetId);
  if (problem) {
    reject(room, sessionId, problem.code, problem.msg);
    return;
  }
  // Pressing again on the same clue keeps the original start; another target restarts.
  if (p.hold?.action === 'collect' && p.hold.targetId === targetId) return;
  p.hold = { action, targetId, startTick: room.state.tick };
}

/** Re-validates every hold each tick (ARCHITECTURE 5.6) and completes the ones whose cast has run. */
export function runHolds(room: PartyRoom): void {
  const tick = room.state.tick;
  const castTicks = Math.round(
    (abilities.abilities.collect?.castS ?? balance.clues.collectHoldS) * TICK_RATE,
  );
  for (const [sessionId, p] of simOf(room).players) {
    const hold = p.hold;
    if (!hold) continue;
    const player = room.state.players.get(sessionId);
    if (!player) {
      p.hold = null;
      continue;
    }
    // Round 6, 6F: gather and craft holds validate and finish in their own files.
    if (hold.action === 'gather' || hold.action === 'craft') {
      if (hold.action === 'gather') tickGather(room, sessionId, p);
      else tickCraft(room, sessionId, p);
      continue;
    }
    // Moving, leaving a verb phase, dying, a crossing or a vanished clue all cancel the hold.
    if (holdProblem(room, sessionId, p, hold.targetId) || p.vx !== 0 || p.vy !== 0) {
      p.hold = null;
      continue;
    }
    if (tick - hold.startTick >= castTicks) completeCollect(room, sessionId, player, p, hold.targetId);
  }
}

function completeCollect(
  room: PartyRoom,
  sessionId: string,
  player: PlayerState,
  p: PlayerSim,
  clueId: string,
): void {
  p.hold = null;
  const sim = simOf(room);
  const clue = clueFor(room, p, clueId);
  const meta = sim.clueMeta.get(clueId);
  if (!clue || !meta || meta.collectors.has(sessionId)) return;
  meta.collectors.add(sessionId);
  clue.claimed = true;
  const verified = roles.roles[player.priv.role.roleId]?.abilities.includes('inspect') === true;
  const entry = new NotebookEntry();
  entry.id = `entry_${++p.entrySeq}`;
  entry.clueKind = clue.kind;
  entry.value = clue.value;
  entry.sceneId = p.sceneIdx;
  entry.tick = room.state.tick;
  entry.status = verified
    ? NotebookStatus.verified
    : clueId === CLUE_TEACHING
      ? NotebookStatus.teaching
      : NotebookStatus.claimed;
  player.priv.notebook.push(entry);
  room.clients.getById(sessionId)?.send(S2C.clueFound, { entryId: entry.id });
}
