import { balance, items } from '@wdi/content';
import { areaOf } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { perkMul } from '../economy/perks';
import { LAYOUT } from '../Inventory';

/**
 * Armour (round 10, D6a; GDD 3.22, logic-table 8.2): what the items in a seat's body and head slots do. An item's
 * `armor.tier` picks its damage factor from `balance.json` `armor.tierMult` by slot; the rest (`resist`,
 * `staminaRegenMult`, `speedMult`) is on the item. Armour is private kit like any item: nothing on the wire shows it,
 * and it drops with the rest of the kit on death.
 */
export interface Worn {
  /** Product of the worn items' tier factors (1 when bare). */
  damage: number;
  /** Factor on the rate of Bleeding / Poisoned drains, by effect id. */
  resist: Record<string, number>;
  regen: number;
  speed: number;
}

/** What the seat wears, summed over its body and head slots (a seat that is not one, or wears none, gets 1s). */
export function armourOf(room: PartyRoom, sessionId: string): Worn {
  const worn: Worn = { damage: 1, resist: {}, regen: 1, speed: 1 };
  const stacks = room.state.players.get(sessionId)?.priv.inventory.slots;
  if (!stacks) return worn;
  for (const s of stacks) {
    const area = areaOf(LAYOUT, s.slot);
    const a = items.items[s.defId]?.armor;
    if (!a || (area !== 'body' && area !== 'head')) continue;
    worn.damage *= balance.armor.tierMult[area][a.tier - 1] ?? 1;
    for (const [id, f] of Object.entries(a.resist ?? {})) worn.resist[id] = (worn.resist[id] ?? 1) * f;
    worn.regen *= a.staminaRegenMult ?? 1;
    worn.speed *= a.speedMult ?? 1;
  }
  return worn;
}

/**
 * The factor a hit's damage takes: the armour, and for a creature's bite the Lodge's `creatureDmg` perk, never below
 * `balance.json` `armor.cap`. A bare seat takes 1 (the Knife and Nightshade never come through here).
 */
export function damageFactor(room: PartyRoom, sessionId: string, creature: boolean): number {
  const f = armourOf(room, sessionId).damage * (creature ? perkMul(room, sessionId, 'creatureDmg') : 1);
  return capped(f);
}

/** A damage factor held to `armor.cap` (and never above 1: armour only ever lowers a hit). */
export const capped = (f: number): number => Math.min(1, Math.max(balance.armor.cap, f));
