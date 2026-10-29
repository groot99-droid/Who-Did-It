import { balance } from '@wdi/content';
import { Phase, TICK_RATE } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { speedPxPerTick } from '../Movement';
import { type MoveInput, type PlayerSim, simOf } from '../RoomSim';
import { isWorldPhase } from '../World';
import '../townsfolk/invariants'; // round 8, 8A: the registry runs in import order, figureNotSeat before bodyBounds
import './invariants'; // the `bodyBounds` check registers with the body stage
import { showClip, wake } from './damage';
import {
  blocksAct,
  blocksRegen,
  blocksRun,
  deriveEffects,
  factorOf,
  speedFactorOf,
  statusBitsOf,
  tickEffects,
} from './effects';
import { runCreatures } from './fists';
import { type Body, bodies, bodyOf, clearBodies, ensureBody, publishBodies } from './state';

/**
 * The body stage (GDD 3.22), the locked call site after `runMobs` in `sim/Step.ts`: stamina, the effects' tick,
 * regeneration, the knockout's clock, the wire, and the creatures' flinch and corpse window (`runCreatures`). Bodies
 * only tick in the world phases; a meeting, the card and game over freeze them. The lobby has none.
 */
export function runBody(room: PartyRoom): void {
  const phase = room.state.phase;
  if (phase === Phase.lobby) {
    clearBodies(room);
    return;
  }
  const sim = simOf(room);
  // A seat placed after the deal (a late join) gets its body here.
  for (const [id, p] of sim.players) {
    if (p.placed && !p.dead && room.state.players.has(id) && !bodyOf(room, id)) ensureBody(room, id);
  }
  if (isWorldPhase(phase)) {
    for (const [id, body] of [...bodies(room)]) {
      const p = sim.players.get(id);
      if (!body.figure && (!p || p.dead)) continue; // `publishBodies` drops it: a ghost has no body
      tickBody(room, id, body, p);
    }
    runCreatures(room);
  }
  publishBodies(room);
}

function tickBody(room: PartyRoom, id: string, body: Body, p: PlayerSim | undefined): void {
  const b = balance.body;
  const tick = room.state.tick;
  const dt = 1 / TICK_RATE;
  const ko = body.effects.get('knockedOut');
  if (ko && ko.untilTick > 0 && tick >= ko.untilTick) wake(room, id, body);
  if (!body.figure && p) {
    const running =
      p.input?.sprint === true &&
      !p.input.sneak &&
      (p.vx !== 0 || p.vy !== 0) &&
      !blocksRun(body) &&
      body.stamina > 0;
    if (running) body.stamina = Math.max(0, body.stamina - b.runCostPerS * dt);
    else {
      const regen = b.staminaRegenPerS * factorOf(body, (d) => d.staminaRegenFactor) * dt;
      body.stamina = Math.min(body.maxStamina, body.stamina + regen);
    }
  }
  tickEffects(room, id, body);
  const rested = tick - body.lastHurtTick >= Math.round(b.regenAfterS * TICK_RATE);
  if (body.hp > 0 && body.hp < body.maxHp && rested && !blocksRegen(body)) {
    body.hp = Math.min(body.maxHp, body.hp + b.regenHpPerS * dt);
  }
  if (body.clip >= 0 && tick >= body.clipUntilTick) body.clip = -1;
  deriveEffects(room, id, body);
}

/**
 * The speed of a seat this tick (`applyInputs`): the posture table under the effects' factors; a seat that cannot
 * run, or has no stamina, walks when it asks to run; one that cannot move stands.
 */
export function bodySpeedPxPerTick(room: PartyRoom, sessionId: string, input: MoveInput): number {
  const body = bodyOf(room, sessionId);
  if (!body) return speedPxPerTick(input.sprint, input.sneak);
  const sprint = input.sprint && body.stamina > 0 && !blocksRun(body);
  return speedPxPerTick(sprint, input.sneak) * speedFactorOf(body);
}

/** After `publishPresence`: the effects' status bits and a one-shot clip onto the presence (body.md 6). */
export function overlayBody(
  room: PartyRoom,
  sessionId: string,
  presence: { animId: number; statusBits: number },
): void {
  const body = bodyOf(room, sessionId);
  if (!body) return;
  presence.statusBits |= statusBitsOf(body);
  if (body.clip >= 0 && room.state.tick < body.clipUntilTick) presence.animId = body.clip;
}

/** The act gate (`Actions.ts`, `Hold.ts`): Stunned and knocked-out seats act on nothing. */
export function bodyBlocksAct(room: PartyRoom, sessionId: string): boolean {
  const body = bodyOf(room, sessionId);
  return body !== undefined && blocksAct(body);
}

/**
 * A one-shot clip on a seat's figure (`overlayBody` lays it over the presence for `CLIP_TICKS`): the body's own
 * `hurt`, `knockdown` and `getup`, and any other session's one-shot (8B's `inspect`) through this one call.
 */
export function showOneShot(room: PartyRoom, sessionId: string, clip: number): void {
  const body = bodyOf(room, sessionId);
  if (body) showClip(body, clip, room.state.tick);
}
