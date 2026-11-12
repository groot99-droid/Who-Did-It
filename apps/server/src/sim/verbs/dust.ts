import { abilities, balance, clues, roles, scenes, type SceneId } from '@wdi/content';
import { ClueKind, NoteKind, TICK_RATE, TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { count } from '../Inventory';
import { refusal, type Refusal } from '../refusal';
import { type PlayerSim, simOf } from '../RoomSim';
import { isVerbPhase, reject, sceneKey, tileCentre } from '../World';
import { evidenceOf, writeReading } from './readings';

// Round 10, V1b (10V; GDD 3.2, seams.md 3 row 24): Dust and Compare.

const KIT = 'fingerprintKit';
const CARD = 'dustCompare';

/**
 * Call site: a living crossing of a door, a seat's (`seat:<id>`, the true actor whatever face it wears) or a
 * figure's (`figure:<id>`). Every crosser is kept the same way so a lift never tells one from the other.
 */
function recordCrossing(room: PartyRoom, sceneId: string, portalId: string, token: string): void {
  const kept = clues.clues.fingerprint?.params?.touchersKept ?? 3;
  const key = `${sceneId}|${portalId}`;
  const list = evidenceOf(room).crossers.get(key) ?? [];
  list.push(token);
  while (list.length > kept) list.shift();
  evidenceOf(room).crossers.set(key, list);
}

/** A crossing of `portal` from `from`: kept at the door it left and at the door it came through. */
export function recordCrossings(
  room: PartyRoom,
  from: string,
  portal: { id: string; to: string | null; toSpawn: string | null },
  token: string,
): void {
  recordCrossing(room, from, portal.id, token);
  const to = portal.to as SceneId | null;
  const spawn = to === null ? undefined : scenes[to]?.spawns.find((s) => s.id === portal.toSpawn);
  if (to === null || !spawn) return;
  let best: string | null = null;
  let bestD = Infinity;
  for (const q of scenes[to].portals) {
    const d = Math.hypot(q.x - spawn.x, q.y - spawn.y);
    if (d < bestD) [best, bestD] = [q.id, d];
  }
  if (best !== null) recordCrossing(room, to, best, token);
}

const hasCard = (room: PartyRoom, sessionId: string, ability: string): boolean =>
  roles.roles[room.state.players.get(sessionId)?.priv.role.roleId ?? '']?.abilities.includes(ability) ===
  true;

const printOfBody = (room: PartyRoom, victim: string): string => {
  const d = evidenceOf(room).deaths.get(victim);
  return d?.cause === 'knife' && d.killer !== undefined ? `seat:${d.killer}` : `body:${victim}`;
};

/** Where a dust target is and the print a lift of it would carry, or the refusal. */
function targetOf(room: PartyRoom, sessionId: string, p: PlayerSim, id: string) {
  const sceneId = sceneKey(p.sceneIdx) as SceneId;
  const body = room.state.scenes.get(sceneId)?.bodies.get(id);
  if (body) return { x: body.x, y: body.y, print: printOfBody(room, body.of), of: body.of, sceneId };
  const portal = scenes[sceneId].portals.find((q) => q.id === id);
  if (!portal) return null;
  const others = (evidenceOf(room).crossers.get(`${sceneId}|${id}`) ?? []).filter(
    (t) => t !== `seat:${sessionId}`,
  );
  const last = others[others.length - 1];
  return {
    x: tileCentre(portal.x, TILE_PX),
    y: tileCentre(portal.y, TILE_PX),
    print: last ?? null,
    of: '',
    sceneId,
  };
}

function dustProblem(room: PartyRoom, sessionId: string, p: PlayerSim, id: string): Refusal | null {
  const player = room.state.players.get(sessionId);
  if (!player) return refusal('NOT_IN_PLAY');
  if (!isVerbPhase(room.state.phase)) return refusal('PHASE_CLOSED');
  if (p.dead || !p.placed) return refusal('NOT_IN_PLAY');
  if (room.state.tick < p.busyUntilTick) return refusal('BUSY');
  const t = targetOf(room, sessionId, p, id);
  if (!t || t.print === null) return refusal('NOTHING_THERE');
  if (Math.hypot(p.x - t.x, p.y - t.y) > balance.doors.reachTiles * TILE_PX) {
    return refusal('TOO_FAR', { of: 'clue' });
  }
  if (count(player, KIT) < 1) return refusal('NEED_TOOL', { need: KIT });
  if ((evidenceOf(room).dusts.get(sessionId) ?? 0) >= (abilities.abilities[CARD]?.usesPerMatch ?? 0)) {
    return refusal('SPENT', { what: 'match' });
  }
  return null;
}

/** `act.hold {action: 'dust', targetId}`: starts a lift from a body or a door in reach. */
export function handleDustHold(room: PartyRoom, sessionId: string, targetId: unknown): void {
  const p = simOf(room).players.get(sessionId);
  if (!p) return;
  if (typeof targetId !== 'string' || targetId.length === 0 || targetId.length > 64) {
    return reject(room, sessionId, 'BAD_REQUEST');
  }
  if (!hasCard(room, sessionId, CARD)) return reject(room, sessionId, 'NOT_YOUR_POWER');
  const problem = dustProblem(room, sessionId, p, targetId);
  if (problem) return reject(room, sessionId, problem);
  if (p.hold?.action === 'dust' && p.hold.targetId === targetId) return;
  p.hold = { action: 'dust', targetId, startTick: room.state.tick };
}

/** Call site: `runHolds`. Moving, a closed phase or a lost target cancels; at `castS` the print is lifted. */
export function tickDust(room: PartyRoom, sessionId: string, p: PlayerSim): void {
  const hold = p.hold;
  if (!hold) return;
  if (dustProblem(room, sessionId, p, hold.targetId) || p.vx !== 0 || p.vy !== 0) {
    p.hold = null;
    return;
  }
  const castS = abilities.abilities[CARD]?.castS ?? 0;
  if (room.state.tick - hold.startTick < Math.round(castS * TICK_RATE)) return;
  p.hold = null;
  const t = targetOf(room, sessionId, p, hold.targetId);
  if (!t || t.print === null) return;
  const mem = evidenceOf(room);
  mem.dusts.set(sessionId, (mem.dusts.get(sessionId) ?? 0) + 1);
  const entry = writeReading(room, sessionId, p, {
    note: NoteKind.lift,
    clueKind: ClueKind.fingerprint,
    value: 0,
    of: t.of,
  });
  if (entry) mem.lifts.set(entry, t.print);
}

/**
 * `act.ability {abilityId: 'dustCompare', targetId, with}`: Compare two of the seat's own lifts. The reading says
 * match or no match, lists the two entry ids in `of`, and never names a seat.
 */
export function handleCompare(
  room: PartyRoom,
  sessionId: string,
  payload: Record<string, unknown>,
  actorOf: (room: PartyRoom, sessionId: string) => PlayerSim | null,
): void {
  const player = room.state.players.get(sessionId);
  if (!player) return;
  if (!hasCard(room, sessionId, CARD)) return reject(room, sessionId, 'NOT_YOUR_POWER');
  const p = actorOf(room, sessionId);
  if (!p) return;
  const { targetId: a, with: b } = payload;
  if (typeof a !== 'string' || typeof b !== 'string' || a === b || a.length > 64 || b.length > 64) {
    return reject(room, sessionId, 'BAD_REQUEST');
  }
  const mem = evidenceOf(room);
  const find = (id: string) =>
    player.priv.notebook.find((e) => e.id === id && e.note === NoteKind.lift && mem.lifts.has(e));
  const first = find(a);
  const second = find(b);
  if (!first || !second) return reject(room, sessionId, 'NOTHING_THERE');
  writeReading(room, sessionId, p, {
    note: NoteKind.comparison,
    clueKind: ClueKind.fingerprint,
    value: mem.lifts.get(first) === mem.lifts.get(second) ? 1 : 0,
    of: `${a},${b}`,
  });
}
