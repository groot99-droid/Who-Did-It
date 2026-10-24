import { balance, economy, scenes } from '@wdi/content';
import { ErrorCode, TICK_RATE, TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { type PlayerSim, simOf } from '../RoomSim';
import { mapScenesOf } from '../MapSites';
import { isVerbPhase, reject, sceneIndex, tileCentre } from '../World';
import { bagFull, collectMailbag, mailbagOf } from './rumours';
import { haul, haulable } from './rent';
import { perkSum } from './perks';

/**
 * The civic holds of round 8 (GDD 3.23), Session 8D: `act.hold` on the mailbag and on a tally rack. `Hold.ts` hands
 * these actions here in one line each way; each hold runs `clues.collectHoldS` standing still within verb reach of its prop, like a clue's collect.
 */
export const CIVIC_HOLDS = new Set(['mailbag', 'rack']);
export const isCivicHold = (action: unknown): action is string =>
  typeof action === 'string' && CIVIC_HOLDS.has(action);

interface Spot {
  sceneIdx: number;
  x: number;
  y: number;
  id: string;
}

function spotOf(room: PartyRoom, action: string, targetId: string): Spot | null {
  if (action === 'mailbag') return mailbagOf(room);
  if (action !== 'rack' || !economy.quota.racks.includes(targetId)) return null;
  for (const sceneId of mapScenesOf(room)) {
    const prop = scenes[sceneId].props.find((q) => q.id === targetId);
    if (prop) {
      const [x, y] = [tileCentre(prop.x, TILE_PX), tileCentre(prop.y, TILE_PX)];
      return { sceneIdx: sceneIndex(sceneId), x, y, id: prop.id };
    }
  }
  return null;
}

function problem(room: PartyRoom, seat: string, p: PlayerSim, action: string, targetId: string) {
  if (!isVerbPhase(room.state.phase)) return { code: ErrorCode.wrongPhase, msg: 'not now' };
  if (p.dead || !p.placed) return { code: ErrorCode.cannot, msg: 'not now' };
  if (room.state.tick < p.busyUntilTick) return { code: ErrorCode.busy, msg: 'busy' };
  const spot = spotOf(room, action, targetId);
  if (!spot || spot.id !== targetId || spot.sceneIdx !== p.sceneIdx)
    return { code: ErrorCode.cannot, msg: 'nothing there' };
  if (Math.hypot(p.x - spot.x, p.y - spot.y) > balance.doors.reachTiles * TILE_PX)
    return { code: ErrorCode.outOfRange, msg: 'too far' };
  if (action === 'mailbag' && !bagFull(room)) return { code: ErrorCode.cannot, msg: 'the bag is empty' };
  if (action === 'rack' && haulable(room, seat) === 0)
    return { code: ErrorCode.cannot, msg: 'nothing to haul' };
  return null;
}

/** `act.hold {action, targetId, on: true}` for a civic action. */
export function handleCivicHold(room: PartyRoom, seat: string, action: string, targetId: unknown): void {
  const p = simOf(room).players.get(seat);
  if (!p || typeof targetId !== 'string') return;
  const why = problem(room, seat, p, action, targetId);
  if (why) return reject(room, seat, why.code, why.msg);
  if (p.hold?.action === action && p.hold.targetId === targetId) return;
  p.hold = { action, targetId, startTick: room.state.tick };
}

/** One tick of a civic hold (called by `runHolds`): moving or any problem cancels it; the end of the cast completes it. */
export function tickCivicHold(room: PartyRoom, seat: string, p: PlayerSim): void {
  const hold = p.hold;
  if (!hold) return;
  if (problem(room, seat, p, hold.action, hold.targetId) || p.vx !== 0 || p.vy !== 0) {
    p.hold = null;
    return;
  }
  if (room.state.tick - hold.startTick < Math.round(balance.clues.collectHoldS * TICK_RATE)) return;
  p.hold = null;
  if (hold.action === 'mailbag') {
    const held = economy.notices.maxHeld + perkSum(room, seat, 'noticesHeld');
    collectMailbag(room, seat, held, perkSum(room, seat, 'slipsExtra'));
  } else if (hold.action === 'rack') haul(room, seat);
}
