import balance from '@wdi/content/data/balance.json';
import items from '@wdi/content/data/items.json';
import { areaOf, slotLayout, slotsIn, type SlotArea } from '@wdi/shared';
import type { StackSnap } from '../net/world';

// Round 10, A13 (GDD 3.30; UI.md 14.44): the inventory screen's slot rules, the same the server applies to `inv.move`
// (`apps/server/src/sim/Inventory.ts`), so the screen offers only the moves that can land.

const DEFS = items.items as Record<string, { kind: string; equip?: string }>;
const LIMITS = balance.resources.stackMax as Record<string, number>;

export const LAYOUT = slotLayout({
  general: items.inventorySlots,
  hotbar: balance.inventory.hotbar,
  belt: balance.inventory.belt,
});

/** The areas of the screen, in the order it draws them. */
export const AREAS: readonly SlotArea[] = ['hotbar', 'pack', 'belt', 'head', 'body', 'weapon'];

export { areaOf, slotsIn };

/** How many units of `item` one slot holds: its kind's `stackMax`, else 1. */
export const stackLimit = (item: string): number => LIMITS[DEFS[item]?.kind ?? ''] ?? 1;

/** Whether `item` may sit in `slot`: anything in the hotbar and the pack, tools on the belt, gear where it fits. */
export function accepts(slot: number, item: string): boolean {
  const area = areaOf(LAYOUT, slot);
  if (area === null || !DEFS[item]) return false;
  if (area === 'hotbar' || area === 'pack') return true;
  if (area === 'belt') return DEFS[item]?.kind === 'tool';
  return DEFS[item]?.equip === area;
}

/** The stacks by slot. A stack without a slot (a mock) takes the next free general slot, in list order. */
export function slotted(stacks: readonly StackSnap[]): Map<number, StackSnap> {
  const out = new Map<number, StackSnap>();
  const loose: StackSnap[] = [];
  for (const s of stacks) {
    if (s.defId === '' || s.qty <= 0) continue;
    if (s.slot === undefined) loose.push(s);
    else out.set(s.slot, s);
  }
  let n = 0;
  for (const s of loose) {
    while (out.has(n)) n++;
    out.set(n, s);
  }
  return out;
}

/** Whether `inv.move {from, to}` lands: the same cases as the server's `move`. */
export function canMove(slots: ReadonlyMap<number, StackSnap>, from: number, to: number): boolean {
  const a = slots.get(from);
  if (!a || from === to || areaOf(LAYOUT, to) === null || !accepts(to, a.defId)) return false;
  const b = slots.get(to);
  if (!b) return true;
  if (b.defId === a.defId && b.qty < stackLimit(a.defId)) return true;
  return b.defId !== a.defId && accepts(from, b.defId);
}

/** Whether a role-bound item may not go in the crafting grid (logic-table 10.1). */
export const isBound = (item: string): boolean =>
  (items.items as Record<string, { roleBound?: boolean }>)[item]?.roleBound === true;
