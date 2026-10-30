import { type PartyRoom } from '../../rooms/PartyRoom';
import { balance } from '@wdi/content';
import { areaOf, slotsIn } from '@wdi/shared';
import { LAYOUT } from '../Inventory';

/**
 * Armour (round 10, D6a; GDD 3.22, logic-table 8.2): what the item in a seat's body slot does. The numbers are the
 * rows of `balance.json` `armor`; the slot is the A12 inventory's, so a seat wears what it has put there. Armour is
 * public kit like any item and reveals no role.
 */
export type ArmorRow = (typeof balance.armor.items)[string];

const BODY = slotsIn(LAYOUT, 'body');

/** The armour row of the seat's body slot, or undefined when it wears none (or is not a seat). */
export function armourOf(room: PartyRoom, sessionId: string): ArmorRow | undefined {
  const stacks = room.state.players.get(sessionId)?.priv.inventory.slots;
  if (!stacks) return undefined;
  for (let i = 0; i < stacks.length; i++) {
    const s = stacks[i];
    if (s && areaOf(LAYOUT, s.slot) === 'body' && BODY.includes(s.slot)) return balance.armor.items[s.defId];
  }
  return undefined;
}
