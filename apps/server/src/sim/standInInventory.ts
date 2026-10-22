import { balance, items } from '@wdi/content';
import { ItemStack, type PlayerState } from '@wdi/shared';

/**
 * Stand-in for Session 6F's `sim/Inventory.ts` (round 6): `addStack` and `take` carry the names the contract gives
 * them (docs/round6/seams.md 2, 6F -> 6H); `count`, `snapshot` and `restore` are 6H's own helpers. When 6F lands, the
 * orchestrator deletes this file and points the imports of `Quests.ts` and `Minigames.ts` at `./Inventory`.
 */

const stackLimit = (defId: string): number =>
  items.items[defId]?.kind === 'material' ? balance.resources.stackMax : 1;

/** How many of `defId` the seat carries. */
export function count(player: PlayerState, defId: string): number {
  let n = 0;
  for (const s of player.priv.inventory.slots) if (s.defId === defId) n += s.qty;
  return n;
}

/** Adds `qty` of `defId`, topping up stacks first; false (and nothing added) when it does not fit. */
export function addStack(player: PlayerState, defId: string, qty: number): boolean {
  const slots = player.priv.inventory.slots;
  const limit = stackLimit(defId);
  let room = 0;
  for (const s of slots) if (s.defId === defId) room += Math.max(0, limit - s.qty);
  const free = Math.max(0, items.inventorySlots - slots.length);
  if (room + free * limit < qty) return false;
  let left = qty;
  for (const s of slots) {
    if (s.defId !== defId || left === 0) continue;
    const put = Math.min(left, limit - s.qty);
    s.qty += put;
    left -= put;
  }
  while (left > 0) {
    const put = Math.min(left, limit);
    const stack = new ItemStack();
    stack.defId = defId;
    stack.qty = put;
    slots.push(stack);
    left -= put;
  }
  return true;
}

/** Removes `qty` of `defId`; false (and nothing removed) when the seat carries fewer. */
export function take(player: PlayerState, defId: string, qty: number): boolean {
  if (count(player, defId) < qty) return false;
  const slots = player.priv.inventory.slots;
  let left = qty;
  for (let i = slots.length - 1; i >= 0 && left > 0; i--) {
    const s = slots[i]!;
    if (s.defId !== defId) continue;
    const out = Math.min(left, s.qty);
    s.qty -= out;
    left -= out;
    if (s.qty === 0) slots.splice(i, 1);
  }
  return true;
}

/** The slots as plain rows, to put back if a turn-in cannot finish. */
export const snapshot = (player: PlayerState): { defId: string; qty: number }[] =>
  player.priv.inventory.slots.map((s) => ({ defId: s.defId, qty: s.qty }));

export function restore(player: PlayerState, rows: { defId: string; qty: number }[]): void {
  const slots = player.priv.inventory.slots;
  slots.clear();
  for (const r of rows) {
    const stack = new ItemStack();
    stack.defId = r.defId;
    stack.qty = r.qty;
    slots.push(stack);
  }
}
