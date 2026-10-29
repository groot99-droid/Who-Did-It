import items from '@wdi/content/data/items.json';
import type { StackSnap } from '../net/world';

export const DEFS = items.items as Record<
  string,
  { name: string; kind: string; use?: string; tooltip?: string }
>;
export const INVENTORY_SLOTS = items.inventorySlots;

/** The display name of an item id (`items.json`); the id itself for a row the content lacks. */
export const itemName = (id: string): string => DEFS[id]?.name ?? id;

/** A carried light the owner can light or douse (`items.json` `use: 'light'`). */
export const isLight = (id: string): boolean => DEFS[id]?.use === 'light';

/** Stacks of the pockets without empty slots, in slot order. */
export function stacksOf(slots: readonly StackSnap[]): StackSnap[] {
  return slots.filter((s) => s.defId !== '' && s.qty > 0);
}

/** `Resin x2, Timber x1`: a want or reward list as one line. */
export function itemList(list: ReadonlyArray<{ item: string; qty: number }>): string {
  return list.map((i) => (i.qty > 1 ? `${itemName(i.item)} x${i.qty}` : itemName(i.item))).join(', ');
}
