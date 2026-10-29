// Round 10, A12 (GDD 3.30; docs/round9/logic-table.md 8.6): where each slot of a seat's inventory sits. A stack
// carries its slot number (`ItemStack.slot`), like an item in a Minecraft inventory list: the hotbar first, then the
// pack, then the belt, then the head, body and weapon slots. Server and client read the same numbers from here.

export type SlotArea = 'hotbar' | 'pack' | 'belt' | 'head' | 'body' | 'weapon';

/** `general` is `items.inventorySlots` (the hotbar and the pack); `hotbar` and `belt` are `balance.inventory`. */
export interface InventorySizes {
  general: number;
  hotbar: number;
  belt: number;
}

export interface SlotLayout {
  /** One past the last slot number. */
  size: number;
  /** The first slot of each area; an area runs to the start of the next. */
  hotbar: number;
  pack: number;
  belt: number;
  head: number;
  body: number;
  weapon: number;
}

export function slotLayout({ general, hotbar, belt }: InventorySizes): SlotLayout {
  const gear = general + belt;
  return {
    hotbar: 0,
    pack: hotbar,
    belt: general,
    head: gear,
    body: gear + 1,
    weapon: gear + 2,
    size: gear + 3,
  };
}

/** The area a slot number belongs to, or null for a number outside the inventory. */
export function areaOf(layout: SlotLayout, slot: number): SlotArea | null {
  if (!Number.isInteger(slot) || slot < 0 || slot >= layout.size) return null;
  if (slot < layout.pack) return 'hotbar';
  if (slot < layout.belt) return 'pack';
  if (slot < layout.head) return 'belt';
  return slot === layout.head ? 'head' : slot === layout.body ? 'body' : 'weapon';
}

/** The slot numbers of one area, in order. */
export function slotsIn(layout: SlotLayout, area: SlotArea): number[] {
  const from = layout[area];
  const to =
    area === 'hotbar'
      ? layout.pack
      : area === 'pack'
        ? layout.belt
        : area === 'belt'
          ? layout.head
          : from + 1;
  return Array.from({ length: to - from }, (_, i) => from + i);
}
