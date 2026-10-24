import { type Ability, abilities, items, roles } from '@wdi/content';
import { ErrorCode, type PlayerState, TICK_RATE, TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { livingActor } from '../Actions';
import { resolveHandle } from '../Avatars';
import { count } from '../Inventory';
import { type PlayerSim, simOf } from '../RoomSim';
import { reject } from '../World';
import { handleCure, handleEat } from './cures';
import { handleSlingshot, handleStrike } from './fists';
import { type Body, bodyOf } from './state';

/**
 * The body's verbs (GDD 3.22; docs/round8/body.md 4 and 6), dispatched from the locked `act.ability` switch in
 * `Actions.ts`: the fists and the slingshot (`fists.ts`), the curing items and the Wake Loaf (`cures.ts`). Every
 * payload is untrusted; every refusal is sent here or in the handler, never thrown.
 */
export function handleBodyAbility(
  room: PartyRoom,
  sessionId: string,
  payload: Record<string, unknown>,
): void {
  switch (payload.abilityId) {
    case 'strike':
      return handleStrike(room, sessionId, payload);
    case 'slingshot':
      return handleSlingshot(room, sessionId, payload);
    case 'heal':
    case 'salts':
    case 'antidote':
      return handleCure(room, sessionId, payload.abilityId, payload);
    case 'eat':
      return handleEat(room, sessionId);
    default:
      reject(room, sessionId, ErrorCode.cannot, 'cannot do that');
  }
}

/** A verb that passed the shared checks, with what every handler needs. */
export interface Verb {
  def: Ability;
  player: PlayerState;
  actor: PlayerSim;
  body: Body;
  tick: number;
}

/**
 * The checks every body verb shares, in the order of the Bandage's: the row; the card, for a `role` row; a living,
 * placed actor in a verb phase that may act (`livingActor`); a body; the cooldown; the item the row requires. Null
 * with the refusal sent.
 */
export function openVerb(room: PartyRoom, sessionId: string, id: string): Verb | null {
  const def = abilities.abilities[id];
  const player = room.state.players.get(sessionId);
  if (!def || !player) return null;
  if (def.scope === 'role' && !roles.roles[player.priv.role.roleId]?.abilities.includes(id)) {
    reject(room, sessionId, ErrorCode.cannot, `no ${def.name.toLowerCase()}`);
    return null;
  }
  const actor = livingActor(room, sessionId);
  if (!actor) return null;
  const body = bodyOf(room, sessionId);
  if (!body) {
    reject(room, sessionId, ErrorCode.cannot, 'not now');
    return null;
  }
  const tick = room.state.tick;
  if (tick < (player.priv.cooldownEndTick.get(id) ?? 0)) {
    reject(room, sessionId, ErrorCode.cooldown, 'not ready');
    return null;
  }
  if (def.requires !== undefined && count(player, def.requires) < 1) {
    reject(
      room,
      sessionId,
      ErrorCode.cannot,
      `no ${items.items[def.requires]?.name.toLowerCase() ?? def.requires}`,
    );
    return null;
  }
  return { def, player, actor, body, tick };
}

/** Starts the row's cooldown, times `factor` (a Fatigued striker's 1.5). */
export function startCooldown(v: Verb, factor = 1): void {
  v.player.priv.cooldownEndTick.set(
    v.def.id,
    v.tick + Math.round((v.def.cooldownS ?? 0) * factor * TICK_RATE),
  );
}

/** Whether a world point is within the row's reach of the actor. */
export const inReach = (v: Verb, x: number, y: number): boolean =>
  Math.hypot(x - v.actor.x, y - v.actor.y) <= (v.def.rangeTiles ?? 0) * TILE_PX;

/**
 * A `target: 'player'` row's target: an avatar handle (never the actor's own, GDD 3.17) resolved to a living, placed
 * seat with a body in the actor's scene and reach. Null with the refusal sent.
 */
export function seatInReach(room: PartyRoom, sessionId: string, v: Verb, handle: unknown): string | null {
  const targetId = resolveHandle(room, sessionId, handle);
  const target = targetId === null ? undefined : simOf(room).players.get(targetId);
  if (
    targetId === null ||
    !target ||
    target.dead ||
    !target.placed ||
    target.sceneIdx !== v.actor.sceneIdx ||
    !bodyOf(room, targetId)
  ) {
    reject(room, sessionId, ErrorCode.cannot, 'no target');
    return null;
  }
  if (!inReach(v, target.x, target.y)) {
    reject(room, sessionId, ErrorCode.outOfRange, 'too far');
    return null;
  }
  return targetId;
}
