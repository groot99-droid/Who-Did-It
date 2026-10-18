import { shuffle, type Rng } from './prng';

// The main-mode deck (GDD 3.1, 3.17; round-5 `deck/wire.md` 2.1). Session 5G owns `dealDeck` (tested in
// `apps/server/test/dealDeck.test.ts`), Session 5F owns `coverHints`.

export interface DeckDeal {
  /** Seat id -> card role id. */
  dealt: Map<string, string>;
  /** The cards nobody holds, `cards.length - ids.length` of them, in the order the deal's shuffle left them. */
  undealt: string[];
}

/**
 * GDD 3.1: every card for which `alwaysDealt` holds is dealt; the other cards are shuffled and the first
 * `ids.length - always` of them join the hand, the rest are `undealt` in shuffled order; the hand is shuffled
 * onto the seats. Throws when more cards must be dealt than there are seats or there are fewer cards than seats.
 * The rng is the `deal` stream.
 */
export function dealDeck(
  ids: readonly string[],
  cards: readonly string[],
  alwaysDealt: (card: string) => boolean,
  rng: Rng,
): DeckDeal {
  if (cards.length < ids.length) throw new Error(`a deck of ${cards.length} cards for ${ids.length} seats`);
  const always = cards.filter((c) => alwaysDealt(c));
  if (always.length > ids.length)
    throw new Error(`${always.length} cards must be dealt to ${ids.length} seats`);
  const rest = shuffle(
    cards.filter((c) => !alwaysDealt(c)),
    rng,
  );
  const fill = ids.length - always.length;
  const hand = shuffle([...always, ...rest.slice(0, fill)], rng);
  return {
    dealt: new Map(ids.map((id, i) => [id, hand[i] as string])),
    undealt: rest.slice(fill),
  };
}

/**
 * GDD 3.17, no draw: the undealt non-cover cards, in `undealt` order (already shuffled by the deal), are matched to
 * the cover seats ordered by their card's first index in `cards` (Killers first, then the Accomplice, then the
 * Drifter; two Killers in `dealt` order): cover seat i needs card i. A Cabal cover seat is shown its own card
 * first, then its Cabal mates' cards and every card no cover seat needs; the Drifter is shown only its own. So a
 * lone cover seat sees them all, Cabal mates share one list with different first hints, and no Drifter hint is in
 * a Cabal list. Returns seat -> card ids; throws if a cover seat has no card (never, for a deck that passes
 * validate.ts). Pre-seed stub: returns an empty map (Session 5F fills it).
 */
export function coverHints(
  dealt: ReadonlyMap<string, string>,
  undealt: readonly string[],
  cards: readonly string[],
  isCover: (card: string) => boolean,
  isCabal: (card: string) => boolean,
): Map<string, string[]> {
  void dealt;
  void undealt;
  void cards;
  void isCover;
  void isCabal;
  return new Map();
}
