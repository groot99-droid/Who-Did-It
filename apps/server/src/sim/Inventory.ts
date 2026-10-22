import { balance, items } from '@wdi/content';
import { ItemStack, type PlayerState } from '@wdi/shared';

/**
 * The seat's inventory (round 6, M5b, GDD 3.5 and 3.14; docs/round6/m5b-data.md 2.1): `items.inventorySlots` slots;
 * a material stacks up to `balance.resources.stackMax` units in one slot, anything else takes a slot per unit
 * (a tool, a key, a kit charge). Every call is all-or-nothing: it either does the whole change and returns true,
 * or leaves the inventory as it was and returns false. Quest rewards (6H) and crafting (`sim/Craft.ts`) go through here.
 */

export interface Stack {
  item: string;
  qty: number;
}

/** A list of `{defId, qty}` slots: the schema's `ArraySchema<ItemStack>` or a plain copy of it (the dry runs). */
interface SlotList<T extends { defId: string; qty: number }> {
  readonly length: number;
  [i: number]: T | undefined;
  splice(start: number, deleteCount: number): unknown;
  push(...items: T[]): unknown;
}

const stackLimit = (item: string): number =>
  items.items[item]?.kind === 'material' ? balance.resources.stackMax : 1;

const slotsOf = (player: PlayerState) => player.priv.inventory.slots;

const valid = (item: string, qty: number): boolean =>
  items.items[item] !== undefined && Number.isInteger(qty) && qty > 0;

function held<T extends { defId: string; qty: number }>(list: SlotList<T>, item: string): number {
  let n = 0;
  for (let i = 0; i < list.length; i++) if (list[i]?.defId === item) n += list[i]?.qty ?? 0;
  return n;
}

function fits<T extends { defId: string; qty: number }>(
  list: SlotList<T>,
  item: string,
  qty: number,
): boolean {
  const limit = stackLimit(item);
  let room = (items.inventorySlots - list.length) * limit;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (s?.defId === item) room += Math.max(0, limit - s.qty);
  }
  return room >= qty;
}

/** Puts `qty` in, topping up open stacks first; the caller has checked it fits. */
function fill<T extends { defId: string; qty: number }>(
  list: SlotList<T>,
  make: (item: string, qty: number) => T,
  item: string,
  qty: number,
): void {
  const limit = stackLimit(item);
  let left = qty;
  for (let i = 0; i < list.length && left > 0; i++) {
    const s = list[i];
    if (!s || s.defId !== item || s.qty >= limit) continue;
    const put = Math.min(limit - s.qty, left);
    s.qty += put;
    left -= put;
  }
  while (left > 0) {
    const put = Math.min(limit, left);
    list.push(make(item, put));
    left -= put;
  }
}

/** Removes `qty` from the newest stacks first; the caller has checked the seat holds that many. */
function drain<T extends { defId: string; qty: number }>(list: SlotList<T>, item: string, qty: number): void {
  let left = qty;
  for (let i = list.length - 1; i >= 0 && left > 0; i--) {
    const s = list[i];
    if (!s || s.defId !== item) continue;
    const out = Math.min(s.qty, left);
    left -= out;
    if (out === s.qty) list.splice(i, 1);
    else s.qty -= out;
  }
}

const makeStack = (item: string, qty: number): InstanceType<typeof ItemStack> => {
  const stack = new ItemStack();
  stack.defId = item;
  stack.qty = qty;
  return stack;
};

/** Units of `item` held, across every slot. */
export function count(player: PlayerState, item: string): number {
  return held(slotsOf(player), item);
}

/** Whether `addStack(player, item, qty)` would succeed. */
export function canAdd(player: PlayerState, item: string, qty: number): boolean {
  return valid(item, qty) && fits(slotsOf(player), item, qty);
}

/** Puts `qty` of `item` in, filling its open stacks first; false (and no change) when it does not all fit. */
export function addStack(player: PlayerState, item: string, qty: number): boolean {
  if (!canAdd(player, item, qty)) return false;
  fill(slotsOf(player), makeStack, item, qty);
  return true;
}

/** Removes `qty` of `item` (the newest stacks first); false (and no change) when the seat holds fewer. */
export function take(player: PlayerState, item: string, qty: number): boolean {
  if (!Number.isInteger(qty) || qty <= 0 || count(player, item) < qty) return false;
  drain(slotsOf(player), item, qty);
  return true;
}

/** The dry run of `exchange`: the takes first (they free slots), then the gives, on a copy. */
export function canExchange(player: PlayerState, takes: readonly Stack[], gives: readonly Stack[]): boolean {
  const copy = slotsOf(player).map((s) => ({ defId: s.defId, qty: s.qty }));
  for (const t of takes) {
    if (!Number.isInteger(t.qty) || t.qty <= 0 || held(copy, t.item) < t.qty) return false;
    drain(copy, t.item, t.qty);
  }
  for (const g of gives) {
    if (!valid(g.item, g.qty) || !fits(copy, g.item, g.qty)) return false;
    fill(copy, (item, qty) => ({ defId: item, qty }), g.item, g.qty);
  }
  return true;
}

/** Takes `takes` and gives `gives` as one change (a craft, a quest turn-in); false and no change when it cannot. */
export function exchange(player: PlayerState, takes: readonly Stack[], gives: readonly Stack[]): boolean {
  if (!canExchange(player, takes, gives)) return false;
  for (const t of takes) drain(slotsOf(player), t.item, t.qty);
  for (const g of gives) fill(slotsOf(player), makeStack, g.item, g.qty);
  return true;
}
