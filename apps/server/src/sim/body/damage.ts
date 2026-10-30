import { type DamageRow, type EffectKey, type MobDef, balance } from '@wdi/content';
import { type DeathCause, TICK_RATE } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { AnimId } from '../constants';
import { emitSim } from '../events/bus';
import { creatureKill } from '../Kill';
import { mobBodies } from '../Mobs';
import { simOf } from '../RoomSim';
import { armourOf } from './armour';
import { applyEffect, cureEffect, deriveEffects, hasEffect } from './effects';
import { type Body, bodies, bodyOf, bodyRng, removeBody } from './state';

/**
 * The damage table (GDD 3.22; docs/round8/body.md 3): every attack but the Knife is a `DamageRow` (`balance.json`
 * `body.damage`, or a creature's `mobs.json` row) landed through `hurt`. Zero health from a row that kills is a
 * death with the row's cause; from one that does not, a knockout (body.md 5). The Knife never comes here (A89).
 */

/** A one-shot clip shows this long on the wire (presentation, like the knife's swing). */
export const CLIP_TICKS = TICK_RATE / 2;

export interface Hit {
  /** A `body.damage` key or a creature id. */
  source: string;
  /** The attacking seat, when one. */
  by?: string;
  /** The death cause when the row kills. */
  cause?: 'wolf' | 'creature';
  /** Factor on the damage (the striker's Weakened). */
  factor?: number;
}

export type HitOutcome = 'hurt' | 'down' | 'dead' | 'none';

export function showClip(body: Body, clip: number, tick: number): void {
  body.clip = clip;
  body.clipUntilTick = tick + CLIP_TICKS;
}

/** A row lands on a seat or figure with a body. A downed seat takes no second knockout; a killing row still kills it. */
export function hurt(room: PartyRoom, target: string, row: DamageRow, hit: Hit): HitOutcome {
  const body = bodyOf(room, target);
  if (!body) return 'none';
  if (hasEffect(body, 'knockedOut') && !row.kills) return 'none';
  const tick = room.state.tick;
  // The wearer's armour (round 10, D6a, GDD 3.22); the Knife never comes here, so it ignores armour.
  const dmg = Math.max(0, Math.round(row.dmg * (hit.factor ?? 1) * (armourOf(room, target)?.damage ?? 1)));
  body.hp = Math.max(0, body.hp - dmg);
  body.lastHurtTick = tick;
  const applied: EffectKey[] = [];
  for (const [id, chance] of Object.entries(row.effects) as [EffectKey, number][]) {
    if (bodyRng(room)() < chance) {
      applyEffect(room, target, body, id);
      applied.push(id);
    }
  }
  emitSim(room, {
    tick,
    kind: 'body.hit',
    seat: target,
    data: { target, ...(hit.by !== undefined && { by: hit.by }), source: hit.source, dmg, effects: applied },
  });
  if (body.hp > 0) {
    showClip(body, AnimId.hurt, tick);
    deriveEffects(room, target, body);
    return 'hurt';
  }
  if (row.kills) {
    die(room, target, hit.cause ?? 'creature');
    return 'dead';
  }
  knockOut(room, target, body, hit.by);
  return 'down';
}

/** A death the body made: a creature's bite (`wolf`, `creature`); drains stop at 1 health (A6). The ghost has no body. */
export function die(room: PartyRoom, target: string, cause: DeathCause & ('wolf' | 'creature')): void {
  creatureKill(room, target, cause);
  removeBody(room, target);
}

/**
 * The knockout (body.md 5): down for `body.koS`, unable to move or act, the hold dropped; `body.ko` for 8C's coin
 * drop. Never a death: no body on the floor, no meeting, no clue.
 */
export function knockOut(room: PartyRoom, target: string, body: Body, by?: string): void {
  const tick = room.state.tick;
  const p = simOf(room).players.get(target);
  if (p) p.hold = null;
  body.hp = 0;
  applyEffect(room, target, body, 'knockedOut', Math.round(balance.body.koS * TICK_RATE));
  showClip(body, AnimId.knockdown, tick);
  emitSim(room, { tick, kind: 'body.ko', seat: target, data: { target, ...(by !== undefined && { by }) } });
}

/** Up again at `body.koWakeHp`, Dazed; returns whether the seat was down. */
export function wake(room: PartyRoom, target: string, body: Body): boolean {
  if (!cureEffect(room, target, body, 'knockedOut')) return false;
  const tick = room.state.tick;
  body.hp = Math.max(body.hp, balance.body.koWakeHp);
  applyEffect(room, target, body, 'dazed');
  showClip(body, AnimId.getup, tick);
  emitSim(room, { tick, kind: 'body.wake', seat: target, data: { target } });
  deriveEffects(room, target, body);
  return true;
}

/** Meeting start (the locked line in `Meeting.ts`, seams.md 5): the gather wakes every knocked-out seat. */
export function wakeAll(room: PartyRoom): void {
  for (const [id, body] of bodies(room)) wake(room, id, body);
}

/** The creature whose attack lands on `seat` this tick (`Mobs.ts` sets `reachSinceTick` and the swing before the bite). */
function attackerOf(room: PartyRoom, seat: string): MobDef | undefined {
  const tick = room.state.tick;
  for (const b of mobBodies(room).values()) {
    if (b.mind.prey === seat && b.reachSinceTick === tick && b.swingUntilTick > tick) return b.def;
  }
  return undefined;
}

/**
 * A creature's attack lands on a living seat (GDD 3.15): its `mobs.json` row is the damage row, the wolf's death is
 * `wolf` and any other creature's `creature`. Returns whether it killed. The locked caller in `Mobs.ts` still passes
 * `def.kills`; until that line passes `def`, the attacker is found by its swing.
 */
export function hurtByCreature(room: PartyRoom, seat: string, by: boolean | MobDef): boolean {
  const def = typeof by === 'boolean' ? attackerOf(room, seat) : by;
  const p = simOf(room).players.get(seat);
  if (!def || !p || p.dead) return false;
  const row: DamageRow = { dmg: def.dmg, effects: def.effects, kills: def.kills };
  return hurt(room, seat, row, { source: def.id, cause: def.id === 'wolf' ? 'wolf' : 'creature' }) === 'dead';
}
