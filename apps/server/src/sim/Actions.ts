import { abilities, roles } from '@wdi/content';
import { Phase, TICK_RATE, TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { resolveHandle } from './Avatars';
import { cureBy } from './body/cures';
import { bodyBlocksAct } from './body/run';
import { handleBodyAbility } from './body/verbs';
import { handleHold } from './Hold';
import { handleImpersonate } from './Impersonate';
import { handleKill } from './Kill';
import { emitSim } from './events/bus';
import { bellOf, hubOf } from './MapSites';
import { handleNightPower } from './NightPowers';
import { type PlayerSim, simOf } from './RoomSim';
import { isVerbPhase, reject, sceneKey, tileCentre } from './World';

/** Dispatches the `act.*` verbs of the Round 3 brief; every payload is untrusted. */
export function runAction(
  room: PartyRoom,
  sessionId: string,
  type: string,
  payload: Record<string, unknown>,
): void {
  switch (type) {
    case 'act.ability':
      return handleAbility(room, sessionId, payload);
    case 'act.hold':
      return handleHold(room, sessionId, payload);
    case 'act.reportBody':
      return handleReport(room, sessionId, payload);
    case 'act.bell':
      return handleBell(room, sessionId);
    default:
  }
}

/** A living, placed player in a phase where verbs work, else the refusal is sent and null returned. */
export function livingActor(room: PartyRoom, sessionId: string, needBellPhase = false): PlayerSim | null {
  const p = simOf(room).players.get(sessionId);
  if (!p) return null;
  const phase = room.state.phase;
  const phaseOk = needBellPhase
    ? phase === Phase.grace || phase === Phase.day // the Bell is silent after dark (GDD 3.3, M5a)
    : isVerbPhase(phase);
  if (p.dead || !p.placed) reject(room, sessionId, 'NOT_IN_PLAY');
  else if (!phaseOk) reject(room, sessionId, 'PHASE_CLOSED');
  else if (room.state.tick < p.busyUntilTick) reject(room, sessionId, 'BUSY');
  else if (bodyBlocksAct(room, sessionId))
    reject(room, sessionId, 'DOWN_OR_STUNNED'); // round 8, 8A
  else return p;
  return null;
}

function handleAbility(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): void {
  switch (payload.abilityId) {
    case 'kill':
      return handleKill(room, sessionId, payload);
    case 'bandage':
      return handleBandage(room, sessionId, payload);
    // Round 5 (locked dispatch): Impersonate is 5F's, the night powers and the Last Shot are 5G's.
    case 'impersonate':
      return handleImpersonate(room, sessionId, payload);
    case 'confession':
    case 'keepWatch':
    case 'remedy':
    case 'poison':
    case 'lastShot':
      return handleNightPower(room, sessionId, payload);
    // Round 8, 8A (GDD 3.22): the fists, the slingshot, the curing items and the Wake Loaf (`sim/body/verbs.ts`).
    case 'strike':
    case 'slingshot':
    case 'heal':
    case 'salts':
    case 'antidote':
    case 'eat':
    case 'eatHerbBread':
    case 'skin':
      return handleBodyAbility(room, sessionId, payload);
    default:
      reject(room, sessionId, 'NFY', { feature: 'this action' });
  }
}

/** Bandage (GDD 3.2): consumes one from the kit, protects the target from the next strike for `protectS`. */
function handleBandage(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): void {
  const def = abilities.abilities.bandage;
  const player = room.state.players.get(sessionId);
  if (!def || !player) return;
  if (!roles.roles[player.priv.role.roleId]?.abilities.includes('bandage')) {
    reject(room, sessionId, 'NOT_YOUR_POWER');
    return;
  }
  const actor = livingActor(room, sessionId);
  if (!actor) return;
  const tick = room.state.tick;
  if (tick < (player.priv.cooldownEndTick.get('bandage') ?? 0)) {
    reject(room, sessionId, 'COOLDOWN');
    return;
  }
  // `target: 'player'`: an avatar handle, resolved to a seat (round 5, 5F's `resolveHandle`).
  const targetId = resolveHandle(room, sessionId, payload.targetId);
  const target = targetId !== null && targetId !== sessionId ? simOf(room).players.get(targetId) : undefined;
  if (!target || target.dead || !target.placed || target.sceneIdx !== actor.sceneIdx) {
    reject(room, sessionId, 'NO_TARGET');
    return;
  }
  if (Math.hypot(target.x - actor.x, target.y - actor.y) > (def.rangeTiles ?? 0) * TILE_PX) {
    reject(room, sessionId, 'TOO_FAR', { of: 'person' });
    return;
  }
  const slots = player.priv.inventory.slots;
  const at = slots.findIndex((s) => s.defId === (def.consumes ?? 'bandage') && s.qty > 0);
  const stack = slots[at];
  if (!stack) {
    reject(room, sessionId, 'SPENT', { what: 'stock' });
    return;
  }
  if (stack.qty <= 1) slots.splice(at, 1);
  else stack.qty -= 1;
  target.bandagedUntilTick = tick + Math.round((def.params?.protectS ?? 0) * TICK_RATE);
  if (targetId !== null) cureBy(room, targetId, def.consumes ?? 'bandage'); // round 8, 8A: it stops Bleeding (GDD 3.22)
  player.priv.cooldownEndTick.set('bandage', tick + Math.round((def.cooldownS ?? 0) * TICK_RATE));
}

/** `act.reportBody {bodyId}`: a living player near an unreported body in its scene asks for a meeting. */
function handleReport(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): void {
  const actor = livingActor(room, sessionId);
  if (!actor) return;
  const sim = simOf(room);
  const bodyId = payload.bodyId;
  const body =
    typeof bodyId === 'string'
      ? room.state.scenes.get(sceneKey(actor.sceneIdx))?.bodies.get(bodyId)
      : undefined;
  if (typeof bodyId !== 'string' || !body) {
    reject(room, sessionId, 'NOTHING_THERE');
    return;
  }
  if (
    Math.hypot(body.x - actor.x, body.y - actor.y) >
    (abilities.abilities.report?.rangeTiles ?? 0) * TILE_PX
  ) {
    reject(room, sessionId, 'TOO_FAR', { of: 'body' });
    return;
  }
  if (sim.reportedBodies.has(bodyId)) {
    reject(room, sessionId, 'ALREADY_DONE', { what: 'report' });
    return;
  }
  sim.reportedBodies.add(bodyId);
  sim.meetingRequests.push({ reason: 'body', callerId: sessionId, bodyOf: body.of });
}

/** Round 8, 8R (A174, GDD 3.8): an unreported body anywhere in the world lets the bell ring after dark too. */
function unreportedBody(room: PartyRoom): boolean {
  const reported = simOf(room).reportedBodies;
  for (const scene of room.state.scenes.values()) {
    for (const body of scene.bodies.values()) if (!body.hidden && !reported.has(body.id)) return true;
  }
  return false;
}

/** `act.bell`: on the hub within reach of the map's bell (`bellOf`), at most the role's `bellPulls` per match. */
function handleBell(room: PartyRoom, sessionId: string): void {
  const player = room.state.players.get(sessionId);
  const phase = room.state.phase;
  const nightBell = isVerbPhase(phase) && phase !== Phase.finalNight && unreportedBody(room);
  const actor = livingActor(room, sessionId, !nightBell);
  const bell = bellOf(room);
  if (!player || !actor || !bell) return;
  if (sceneKey(actor.sceneIdx) !== hubOf(room)) {
    reject(room, sessionId, 'TOO_FAR', { of: 'bell' });
    return;
  }
  const reach = (abilities.abilities.bell?.rangeTiles ?? 0) * TILE_PX;
  if (Math.hypot(actor.x - tileCentre(bell.x, TILE_PX), actor.y - tileCentre(bell.y, TILE_PX)) > reach) {
    reject(room, sessionId, 'TOO_FAR', { of: 'bell' });
    return;
  }
  if (actor.bellPulls >= (roles.roles[player.priv.role.roleId]?.bellPulls ?? 0)) {
    reject(room, sessionId, 'SPENT', { what: 'power' });
    return;
  }
  actor.bellPulls++;
  simOf(room).meetingRequests.push({ reason: 'bell', callerId: sessionId });
  const sceneId = hubOf(room);
  emitSim(room, { tick: room.state.tick, kind: 'bell', sceneId, data: { sceneId } }); // round 8, 8R
}
