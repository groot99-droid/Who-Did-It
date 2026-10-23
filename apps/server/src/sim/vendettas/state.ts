import { balance, profileFor, roles, scenes, vendettas, type Vendetta } from '@wdi/content';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { mapIdOfRoom } from '../MapSites';
import { profileOpen } from '../World';

/**
 * Vendettas (round 7, GDD 3.20; docs/round7/vendettas.md 2), Session 7H: which seat holds which vendetta. The deal
 * draws one per seat dealt a card that carries vendettas, on the `vendetta` stream keyed by that seat, so no other
 * draw moves with it and nothing public shares it (`sim/seeds.ts`). The holding lives in room memory, keyed by the
 * match's `MatchSeeds` (a new object at every Start, as `sim/Minigames.ts` keys its puzzles); the seat's own
 * `Private.vendetta` mirrors it once the schema carries the field (version 4, after 7D's bump).
 */

type VendettaRow = Vendetta & { kind: 'conversion' | 'sabotage' | 'heist' | 'contract' };

const held = new WeakMap<object, Map<string, string>>();

function heldOf(room: PartyRoom): Map<string, string> {
  let m = held.get(room.seeds);
  if (!m) held.set(room.seeds, (m = new Map()));
  return m;
}

/** The rows a seat dealt `card` may draw in this match (GDD 3.20 "The draw"), in `vendettas.json` order. */
export function eligibleVendettas(room: PartyRoom, card: string, dealt: readonly string[]): VendettaRow[] {
  const map = mapIdOfRoom(room);
  const seats = Math.min(balance.players.max, Math.max(balance.players.min, dealt.length));
  const profile = profileFor(seats);
  return Object.values(vendettas.vendettas).filter(
    (v) =>
      v.role === card &&
      (v.maps === undefined || v.maps.includes(map)) &&
      (v.needsCard === undefined || dealt.includes(v.needsCard)) &&
      (v.needsScene === undefined || profileOpen(scenes[v.needsScene].profile, profile)),
  ) as VendettaRow[];
}

/**
 * The draw at the deal (`dealMainDeck`, the one-line hook in `sim/Deck.ts`): for each seat, in seat order, whose
 * card carries vendettas, one eligible row uniformly from `seeds.get('vendetta', seat)`; a seat with no eligible
 * row holds none. The quick mode never deals here.
 */
export function drawVendettas(room: PartyRoom, dealt: ReadonlyMap<string, string>): void {
  const m = heldOf(room);
  m.clear();
  const cards = [...dealt.values()];
  for (const [seat, card] of dealt) {
    const rows = eligibleVendettas(room, card, cards);
    if (rows.length === 0) continue;
    const rng = room.seeds.get('vendetta', seat);
    const row = rows[Math.min(rows.length - 1, Math.floor(rng() * rows.length))] as VendettaRow;
    m.set(seat, row.id);
  }
}

/** The vendetta row a seat holds, or null (its own: an Accomplice holds none). */
export function vendettaOf(room: PartyRoom, seat: string): VendettaRow | null {
  const id = heldOf(room).get(seat);
  return id === undefined ? null : ((vendettas.vendettas[id] as VendettaRow | undefined) ?? null);
}

/** Every holder of the match and its vendetta id, in seat order. */
export function vendettaHolders(room: PartyRoom): ReadonlyMap<string, string> {
  return heldOf(room);
}

/**
 * What the seat's own `Private.vendetta` holds (GDD 3.20 "On the card"): a holder's vendetta id; for a seat whose
 * faction knows its mates (the Accomplice), the ids of its mates' vendettas joined by commas, so its card shows
 * their goal and nothing else; '' for everyone else.
 */
export function privateVendetta(room: PartyRoom, seat: string): string {
  const own = heldOf(room).get(seat);
  if (own !== undefined) return own;
  const player = room.state.players.get(seat);
  const card = player?.priv?.role.roleId ?? '';
  if (roles.roles[card]?.abilities.includes('kill') === true) return '';
  const mates = [...(player?.priv?.cabalMates ?? [])];
  return mates.flatMap((m) => heldOf(room).get(m) ?? []).join(',');
}

/** Gives `seat` the vendetta `id` (tests and the debug start, which deal no card through `dealMainDeck`). */
export function holdVendetta(room: PartyRoom, seat: string, id: string): void {
  if (vendettas.vendettas[id]) heldOf(room).set(seat, id);
}
