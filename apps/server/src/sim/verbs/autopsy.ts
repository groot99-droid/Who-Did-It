import { abilities, balance, roles } from '@wdi/content';
import { AutopsyCause, ClueKind, NoteKind, TICK_RATE, TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { refusal, type Refusal } from '../refusal';
import { type PlayerSim, simOf } from '../RoomSim';
import { isVerbPhase, reject, sceneKey } from '../World';
import { evidenceOf, writeReading } from './readings';

// Round 10, V1b (10V; GDD 3.2, seams.md 3 row 24): the Doctor's Autopsy. A reading goes only to the Doctor's own
// Notebook. The estimate is the true tick plus a draw from the secret `autopsy` stream, never a public one.

const CARD = 'autopsy';
const read = new WeakMap<object, Set<string>>();
const readBy = (room: PartyRoom): Set<string> => {
  let s = read.get(room.seeds);
  if (!s) read.set(room.seeds, (s = new Set()));
  return s;
};

const causeOf = (cause: string): number =>
  cause === 'knife'
    ? AutopsyCause.knife
    : cause === 'wolf' || cause === 'creature'
      ? AutopsyCause.creature
      : cause === 'poison'
        ? AutopsyCause.poison
        : cause === 'shot' || cause === 'derringer'
          ? AutopsyCause.shot
          : AutopsyCause.other;

function problem(room: PartyRoom, sessionId: string, p: PlayerSim, bodyId: string): Refusal | null {
  if (!isVerbPhase(room.state.phase)) return refusal('PHASE_CLOSED');
  if (p.dead || !p.placed) return refusal('NOT_IN_PLAY');
  if (room.state.tick < p.busyUntilTick) return refusal('BUSY');
  const body = room.state.scenes.get(sceneKey(p.sceneIdx))?.bodies.get(bodyId);
  if (!body) return refusal('NOTHING_THERE');
  if (Math.hypot(p.x - body.x, p.y - body.y) > balance.doors.reachTiles * TILE_PX) {
    return refusal('TOO_FAR', { of: 'body' });
  }
  if (readBy(room).has(`${sessionId}|${bodyId}`)) return refusal('ALREADY_DONE', { what: 'notebook' });
  return null;
}

/** `act.hold {action: 'autopsy', targetId}`: starts reading a body in reach, for a card with Autopsy. */
export function handleAutopsyHold(room: PartyRoom, sessionId: string, targetId: unknown): void {
  const p = simOf(room).players.get(sessionId);
  if (!p) return;
  if (typeof targetId !== 'string' || targetId.length === 0 || targetId.length > 64) {
    return reject(room, sessionId, 'BAD_REQUEST');
  }
  const card = room.state.players.get(sessionId)?.priv.role.roleId ?? '';
  if (roles.roles[card]?.abilities.includes(CARD) !== true) return reject(room, sessionId, 'NOT_YOUR_POWER');
  const issue = problem(room, sessionId, p, targetId);
  if (issue) return reject(room, sessionId, issue);
  if (p.hold?.action === 'autopsy' && p.hold.targetId === targetId) return;
  p.hold = { action: 'autopsy', targetId, startTick: room.state.tick };
}

/** Call site: `runHolds`. At `castS` the cause and an estimated death tick enter the Doctor's own Notebook. */
export function tickAutopsy(room: PartyRoom, sessionId: string, p: PlayerSim): void {
  const hold = p.hold;
  if (!hold) return;
  if (problem(room, sessionId, p, hold.targetId) || p.vx !== 0 || p.vy !== 0) {
    p.hold = null;
    return;
  }
  const def = abilities.abilities[CARD];
  if (room.state.tick - hold.startTick < Math.round((def?.castS ?? 0) * TICK_RATE)) return;
  p.hold = null;
  const victim = room.state.scenes.get(sceneKey(p.sceneIdx))?.bodies.get(hold.targetId)?.of;
  if (victim === undefined) return;
  const death = evidenceOf(room).deaths.get(victim);
  const errorTicks = Math.round((def?.params?.timeOfDeathErrorS ?? 0) * TICK_RATE);
  const offset = Math.round((room.seeds.get('autopsy', sessionId)() * 2 - 1) * errorTicks);
  readBy(room).add(`${sessionId}|${hold.targetId}`);
  writeReading(room, sessionId, p, {
    note: NoteKind.autopsy,
    clueKind: ClueKind.timeOfDeath,
    value: causeOf(death?.cause ?? 'other'),
    of: victim,
    tick: Math.max(0, (death?.tick ?? room.state.tick) + offset),
  });
}
