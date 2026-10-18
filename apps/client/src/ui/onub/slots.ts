import { fill } from '../copy';
import { ONUB_NIGHT_COPY as C } from '../copy/onubNight';

// Card slots of the quick-mode table (onub-contract.md 2.3): `seat.<i>.role`, `seat.<i>.loc`, `pantry.role.<k>`,
// `pantry.loc.<k>`; `seat.<i>` names a seat for a `mate` row. `<i>` indexes `OnubBoard.seats`.

export type SlotRef =
  | { kind: 'seat'; index: number; card: 'role' | 'loc' }
  | { kind: 'pantry'; index: number; card: 'role' | 'loc' };

export const seatSlot = (index: number, card: 'role' | 'loc') => `seat.${index}.${card}`;
export const pantrySlot = (index: number, card: 'role' | 'loc') => `pantry.${card}.${index}`;

export function parseSlot(slot: string): SlotRef | null {
  const seat = /^seat\.(\d+)\.(role|loc)$/.exec(slot);
  if (seat !== null) return { kind: 'seat', index: Number(seat[1]), card: seat[2] as 'role' | 'loc' };
  const pantry = /^pantry\.(role|loc)\.(\d+)$/.exec(slot);
  if (pantry !== null) return { kind: 'pantry', index: Number(pantry[2]), card: pantry[1] as 'role' | 'loc' };
  return null;
}

/** The seat id behind a `seat.<i>` or `seat.<i>.<card>` slot, or null. */
export function seatOfSlot(slot: string, seats: readonly string[]): string | null {
  const m = /^seat\.(\d+)/.exec(slot);
  return m === null ? null : (seats[Number(m[1])] ?? null);
}

/** "Hana's Role card", "Pantry Location card 2". */
export function slotLabel(slot: string, nameOfSeatIndex: (index: number) => string): string {
  const ref = parseSlot(slot);
  if (ref === null) return slot;
  if (ref.kind === 'seat') {
    const key = ref.card === 'role' ? 'onub.night.slot.seatRole' : 'onub.night.slot.seatLoc';
    return fill(C[key], { name: nameOfSeatIndex(ref.index) });
  }
  const key = ref.card === 'role' ? 'onub.night.slot.pantryRole' : 'onub.night.slot.pantryLoc';
  return fill(C[key], { n: ref.index + 1 });
}
