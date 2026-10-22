import { balance } from '@wdi/content';
import { TICK_RATE } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { creatureKill } from '../Kill';
import { simOf } from '../RoomSim';

/**
 * Creature damage (GDD 3.6 and 3.15). The sim has no hit points beyond this: the Knife kills outright, so a seat's
 * HP lives here, in room memory, and only a creature's bite reads or writes it. A bite lands `health.wolfDamage`; a
 * seat regains `health.regenHp` every `health.regenEveryS` after its last bite, up to `health.maxHp`. A wolf's bite
 * that takes the seat to 0 is a `wolf` death; the other creatures never take a seat below 1.
 */
interface Hurt {
  hp: number;
  atTick: number;
}

const memories = new WeakMap<PartyRoom, Map<string, Hurt>>();
function hurtsOf(room: PartyRoom): Map<string, Hurt> {
  let hurts = memories.get(room);
  if (!hurts) memories.set(room, (hurts = new Map()));
  return hurts;
}

/** A seat's hit points now, with the regeneration since its last bite. */
export function hpOf(room: PartyRoom, seat: string): number {
  const h = balance.health;
  const hurt = hurtsOf(room).get(seat);
  if (!hurt) return h.maxHp;
  const every = Math.max(1, Math.round(h.regenEveryS * TICK_RATE));
  const regained = Math.floor((room.state.tick - hurt.atTick) / every) * h.regenHp;
  return Math.min(h.maxHp, hurt.hp + regained);
}

/** A creature's attack lands on a living seat; returns whether it killed. */
export function hurtByCreature(room: PartyRoom, seat: string, kills: boolean): boolean {
  const p = simOf(room).players.get(seat);
  if (!p || p.dead) return false;
  const floor = kills ? 0 : 1;
  const hp = Math.max(floor, hpOf(room, seat) - balance.health.wolfDamage);
  hurtsOf(room).set(seat, { hp, atTick: room.state.tick });
  if (hp > 0) return false;
  creatureKill(room, seat);
  return true;
}

/** The lobby reset and every Start: everyone back to full health. */
export function resetHurts(room: PartyRoom): void {
  hurtsOf(room).clear();
}
