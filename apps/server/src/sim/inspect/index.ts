import { balance, relations } from '@wdi/content';
import { ErrorCode, Phase, S2C, TICK_RATE, TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { avatarMemory, avatarOf } from '../Avatars';
import { emitSim } from '../events/bus';
import { npcMemory } from '../npc/memory';
import { type PlayerSim, simOf } from '../RoomSim';
import { canSee } from '../Sight';
import { isWorldPhase, reject } from '../World';
import { healthBand, lightOf, purseBand, signsOf } from './read';
import { matchRelations, type Seen } from './relations';

/**
 * `act.inspect { targetId }` (GDD 3.22 "Inspect"; docs/round8/body.md 7), Session 8B. A living seat studies the avatar
 * of another living seat in reach and in sight, in any world phase, once per `inspect.cooldownS`. The inspector gets
 * `inspect.result` (the drawn look, signs from public bits, the health and purse bands, a burning light); the
 * inspected seat gets `inspect.noticed` with the inspector's drawn look. A `relations.json` row that holds raises the
 * inspector's drawn face in the suspicion of every NPC that saw the look (the inspected one too when it is an NPC),
 * and its note goes to the inspected seat as `inspect.hunch`. Nothing reaches a third client.
 */
export function handleInspect(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): void {
  const sim = simOf(room);
  const player = room.state.players.get(sessionId);
  const actor = sim.players.get(sessionId);
  if (!player || !actor) return;
  const tick = room.state.tick;
  if (actor.dead || !actor.placed) return reject(room, sessionId, ErrorCode.cannot, 'not now');
  if (!isWorldPhase(room.state.phase)) return reject(room, sessionId, ErrorCode.wrongPhase, 'not now');
  if (tick < actor.busyUntilTick) return reject(room, sessionId, ErrorCode.busy, 'busy');
  if (tick < (player.priv.cooldownEndTick.get('inspect') ?? 0))
    return reject(room, sessionId, ErrorCode.cooldown, 'not ready');

  const memory = avatarMemory(room);
  const handle = typeof payload.targetId === 'string' ? payload.targetId : '';
  const seat = memory.seatOf.get(handle);
  const target = seat === undefined ? undefined : sim.players.get(seat);
  const avatar = avatarOf(room, handle);
  if (
    seat === undefined ||
    seat === sessionId ||
    memory.handleOf.get(seat) !== handle ||
    !target ||
    !avatar ||
    target.dead ||
    !target.placed ||
    target.sceneIdx !== actor.sceneIdx ||
    !canSee(room, actor, target)
  ) {
    return reject(room, sessionId, ErrorCode.cannot, 'no one there');
  }
  if (Math.hypot(target.x - actor.x, target.y - actor.y) > relations.inspect.rangeTiles * TILE_PX)
    return reject(room, sessionId, ErrorCode.outOfRange, 'too far');

  player.priv.cooldownEndTick.set('inspect', tick + Math.round(relations.inspect.cooldownS * TICK_RATE));
  const targetPlayer = room.state.players.get(seat);
  const by = seenAs(room, sessionId);
  const of: Seen = { seat, look: lookOfFace(room, avatar.lookOf) };
  room.clients.getById(sessionId)?.send(S2C.inspectResult, {
    targetId: handle,
    lookId: of.look,
    signs: signsOf(avatar, targetPlayer),
    health: healthBand(room, seat),
    purse: targetPlayer ? purseBand(targetPlayer) : 'unknown',
    light: lightOf(avatar),
  });
  const targetClient = room.clients.getById(seat);
  targetClient?.send(S2C.inspectNoticed, { lookId: by.look });

  const rows = matchRelations(room, by, of);
  const raise = rows.reduce((sum, row) => sum + row.suspicion, 0);
  if (raise > 0) raiseSuspicion(room, actor, by.face, seat, raise);
  const note = rows.find((row) => row.note !== undefined)?.note;
  if (note !== undefined) targetClient?.send(S2C.inspectHunch, { copyId: note });

  emitSim(room, { tick, kind: 'inspect', seat: sessionId, data: { by: sessionId, target: seat } });
}

/** The public look of the seat whose face an avatar shows (`Avatar.lookOf`). */
const lookOfFace = (room: PartyRoom, face: string): string => room.state.players.get(face)?.look ?? '';

/** The inspector as the eye sees it: its seat, the face it shows (a disguise's while applied) and that face's look. */
function seenAs(room: PartyRoom, seat: string): Seen & { face: string } {
  const disguise = avatarMemory(room).disguise.get(seat);
  const face = disguise?.applied ? disguise.as : seat;
  return { seat, face, look: lookOfFace(room, face) };
}

/**
 * Every living NPC seat that saw the look (the inspector in its scene, in sight and within the vision radius), and
 * the inspected seat when it is an NPC, counts `face` `raise` more in its suspicion (`Brain.suspicion`).
 */
function raiseSuspicion(
  room: PartyRoom,
  actor: PlayerSim,
  face: string,
  inspected: string,
  raise: number,
): void {
  const sim = simOf(room);
  const npcs = npcMemory(room);
  const sight =
    (room.state.phase === Phase.night ? balance.vision.nightTiles : balance.vision.dayTiles) * TILE_PX;
  for (const id of npcs.ids) {
    const npc = sim.players.get(id);
    if (!npc || npc.dead || !npc.placed || npc === actor || id === face) continue;
    const saw =
      id === inspected ||
      (npc.sceneIdx === actor.sceneIdx &&
        Math.hypot(npc.x - actor.x, npc.y - actor.y) <= sight &&
        canSee(room, npc, actor));
    if (!saw) continue;
    const brain = npcs.brain(id);
    brain.suspicion.set(face, (brain.suspicion.get(face) ?? 0) + raise);
  }
}
