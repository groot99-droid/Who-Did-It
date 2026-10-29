import { balance, items } from '@wdi/content';
import { areaOf, ItemStack, slotLayout, slotsIn, type PlayerState, type RefusalReason } from '@wdi/shared';

/**
 * The seat's inventory (round 10, A12, GDD 3.30; round 6, M5b, GDD 3.14). The hotbar and the pack are
 * `items.inventorySlots` slots, the first `balance.inventory.hotbar` of them the hotbar; the belt's
 * `balance.inventory.belt` slots take tools only; the head, body and weapon slots take what `equip`s there. A stack
 * names its own slot (`ItemStack.slot`, `rules/inventory.ts`), and an item stacks up to
 * `balance.resources.stackMax` of its kind (1 for a kind not listed). Every call is all-or-nothing: it either does
 * the whole change and returns true, or leaves the inventory as it was. Quest rewards, crafting and trade go
 * through here.
 */

export interface Stack {
  item: string;
  qty: number;
}

/** A stack as the helpers see it: the schema's `ItemStack` or a plain copy of it (the dry runs). */
interface Slot {
  defId: string;
  qty: number;
  slot: number;
}

/** A list of slots: the schema's `ArraySchema<ItemStack>` or a plain copy of it. */
interface SlotList<T extends Slot> {
  readonly length: number;
  [i: number]: T | undefined;
  splice(start: number, deleteCount: number): unknown;
  push(...items: T[]): unknown;
}

export const LAYOUT = slotLayout({
  general: items.inventorySlots,
  hotbar: balance.inventory.hotbar,
  belt: balance.inventory.belt,
});

const def = (item: string) => items.items[item];
const limits = balance.resources.stackMax as Partial<Record<string, number>>;
const stackLimit = (item: string): number => limits[def(item)?.kind ?? ''] ?? 1;

/** Whether `item` may sit in `slot`: anything in the hotbar and the pack, tools on the belt, gear where it fits. */
export function accepts(slot: number, item: string): boolean {
  const area = areaOf(LAYOUT, slot);
  if (area === null || !def(item)) return false;
  if (area === 'hotbar' || area === 'pack') return true;
  if (area === 'belt') return def(item)?.kind === 'tool';
  return def(item)?.equip === area;
}

const GENERAL = [...slotsIn(LAYOUT, 'hotbar'), ...slotsIn(LAYOUT, 'pack')];
const BELT = slotsIn(LAYOUT, 'belt');

/** Where a new stack of `item` goes, in order: a tool to the belt first, then the hotbar, then the pack. */
const placesFor = (item: string): number[] => (def(item)?.kind === 'tool' ? [...BELT, ...GENERAL] : GENERAL);

const slotsOf = (player: PlayerState) => player.priv.inventory.slots;

const valid = (item: string, qty: number): boolean =>
  def(item) !== undefined && Number.isInteger(qty) && qty > 0;

const taken = <T extends Slot>(list: SlotList<T>): Set<number> => {
  const out = new Set<number>();
  for (let i = 0; i < list.length; i++) out.add(list[i]?.slot ?? -1);
  return out;
};

/**
 * Gives every stack a slot of its own that takes it. A stack pushed by hand (a start kit, the Knife an Accomplice
 * inherits) arrives at slot 0; this moves it to the first free place, so the slots stay one stack each.
 */
function settleList<T extends Slot>(list: SlotList<T>): void {
  const used = new Set<number>();
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (!s) continue;
    if (!used.has(s.slot) && accepts(s.slot, s.defId)) {
      used.add(s.slot);
      continue;
    }
    const free = placesFor(s.defId).find((n) => !used.has(n));
    if (free === undefined) continue; // more stacks than slots: left as it is
    s.slot = free;
    used.add(free);
  }
}

function held<T extends Slot>(list: SlotList<T>, item: string): number {
  let n = 0;
  for (let i = 0; i < list.length; i++) if (list[i]?.defId === item) n += list[i]?.qty ?? 0;
  return n;
}

function fits<T extends Slot>(list: SlotList<T>, item: string, qty: number): boolean {
  const limit = stackLimit(item);
  const used = taken(list);
  let room = placesFor(item).filter((n) => !used.has(n)).length * limit;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (s?.defId === item) room += Math.max(0, limit - s.qty);
  }
  return room >= qty;
}

/** Puts `qty` in, topping up open stacks first, then the free places in order; the caller has checked it fits. */
function fill<T extends Slot>(
  list: SlotList<T>,
  make: (item: string, qty: number, slot: number) => T,
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
  const used = taken(list);
  for (const n of placesFor(item)) {
    if (left <= 0) break;
    if (used.has(n)) continue;
    const put = Math.min(limit, left);
    list.push(make(item, put, n));
    left -= put;
  }
}

/** Removes `qty` from the newest stacks first; the caller has checked the seat holds that many. */
function drain<T extends Slot>(list: SlotList<T>, item: string, qty: number): void {
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

const makeStack = (item: string, qty: number, slot: number): InstanceType<typeof ItemStack> => {
  const stack = new ItemStack();
  stack.defId = item;
  stack.qty = qty;
  stack.slot = slot;
  return stack;
};

const copyOf = (player: PlayerState): Slot[] =>
  slotsOf(player).map((s) => ({ defId: s.defId, qty: s.qty, slot: s.slot }));

/** Gives every stack of the seat its own slot (see `settleList`); call it after pushing stacks by hand. */
export function settle(player: PlayerState): void {
  settleList(slotsOf(player));
}

/** Units of `item` held, across every slot. */
export function count(player: PlayerState, item: string): number {
  return held(slotsOf(player), item);
}

/** Whether `addStack(player, item, qty)` would succeed. */
export function canAdd(player: PlayerState, item: string, qty: number): boolean {
  return addRefusal(player, item, qty) === null;
}

/** Why `addStack(player, item, qty)` would fail (`BAD_REQUEST` or `PACK_FULL`), or null when it fits. */
export function addRefusal(player: PlayerState, item: string, qty: number): RefusalReason | null {
  if (!valid(item, qty)) return 'BAD_REQUEST';
  const copy = copyOf(player);
  settleList(copy);
  return fits(copy, item, qty) ? null : 'PACK_FULL';
}

/** Puts `qty` of `item` in, filling its open stacks first; false (and no change) when it does not all fit. */
export function addStack(player: PlayerState, item: string, qty: number): boolean {
  if (!canAdd(player, item, qty)) return false;
  settle(player);
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
  const copy = copyOf(player);
  settleList(copy);
  for (const t of takes) {
    if (!Number.isInteger(t.qty) || t.qty <= 0 || held(copy, t.item) < t.qty) return false;
    drain(copy, t.item, t.qty);
  }
  for (const g of gives) {
    if (!valid(g.item, g.qty) || !fits(copy, g.item, g.qty)) return false;
    fill(copy, (item, qty, slot) => ({ defId: item, qty, slot }), g.item, g.qty);
  }
  return true;
}

/** Takes `takes` and gives `gives` as one change (a craft, a quest turn-in); false and no change when it cannot. */
export function exchange(player: PlayerState, takes: readonly Stack[], gives: readonly Stack[]): boolean {
  if (!canExchange(player, takes, gives)) return false;
  settle(player);
  for (const t of takes) drain(slotsOf(player), t.item, t.qty);
  for (const g of gives) fill(slotsOf(player), makeStack, g.item, g.qty);
  return true;
}

/** The stack in `slot`, if any. */
export function stackAt(player: PlayerState, slot: number): InstanceType<typeof ItemStack> | undefined {
  return slotsOf(player).find((s) => s.slot === slot);
}

/**
 * Moves the stack in `from` to `to` (`inv.move`): into an empty slot, onto a stack of the same item as far as it
 * fits, or swapped with the stack there when each slot takes the other's item. Null when it moved, else the reason:
 * always `BAD_REQUEST`, since the screen offers only the moves that can land.
 */
export function move(player: PlayerState, from: number, to: number): RefusalReason | null {
  settle(player);
  const a = stackAt(player, from);
  if (!a || from === to || areaOf(LAYOUT, to) === null) return 'BAD_REQUEST';
  if (!accepts(to, a.defId)) return 'BAD_REQUEST'; // the screen offers only the slots that take it (A13)
  const b = stackAt(player, to);
  if (!b) {
    a.slot = to;
    return null;
  }
  if (b.defId === a.defId && b.qty < stackLimit(a.defId)) {
    const put = Math.min(stackLimit(a.defId) - b.qty, a.qty);
    b.qty += put;
    if (put === a.qty) slotsOf(player).splice(slotsOf(player).indexOf(a), 1);
    else a.qty -= put;
    return null;
  }
  if (!accepts(from, b.defId)) return 'BAD_REQUEST';
  b.slot = from;
  a.slot = to;
  return null;
}

/** Selects the hotbar slot whose item is held (`inv.select`). Null when selected, else the reason. */
export function select(player: PlayerState, slot: number): RefusalReason | null {
  if (areaOf(LAYOUT, slot) !== 'hotbar') return 'BAD_REQUEST';
  player.priv.inventory.selected = slot;
  return null;
}

/** The item id in the selected hotbar slot, or '' for an empty hand. */
export function heldItem(player: PlayerState): string {
  return stackAt(player, player.priv.inventory.selected)?.defId ?? '';
}

/**
 * Empties what a dropped body loses (`docs/round9/round10-plan.md` A12; the train's return and a robbery use it):
 * the hotbar, the pack, the belt and the purse. Bound kit (`onDeath: kept`), the equipment slots and the bank stay.
 * Returns what came out, for the caller to leave on the ground or hand over.
 */
export function strip(player: PlayerState): { stacks: Stack[]; scrip: number } {
  const list = slotsOf(player);
  const stacks: Stack[] = [];
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i];
    if (!s) continue;
    const area = areaOf(LAYOUT, s.slot);
    const gear = area === 'head' || area === 'body' || area === 'weapon';
    if (gear || def(s.defId)?.onDeath === 'kept') continue;
    stacks.unshift({ item: s.defId, qty: s.qty });
    list.splice(i, 1);
  }
  const scrip = player.priv.purse;
  player.priv.purse = 0;
  return { stacks, scrip };
}
