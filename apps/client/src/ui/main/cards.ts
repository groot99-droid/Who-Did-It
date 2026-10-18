import looksJson from '@wdi/content/data/looks.json';
import rolesJson from '@wdi/content/data/roles.json';

// The card facts the main-mode screens read: public content only (GDD 3.1: the deck list is public by design).

type RoleRow = (typeof rolesJson.roles)[keyof typeof rolesJson.roles];
const ROLES = rolesJson.roles as Record<string, RoleRow>;
const LOOKS = looksJson.looks as Record<string, { name: string; role: string; palette: { base: string } }>;
const DECKS = rolesJson.decks as Record<string, { practice: boolean; cards: string[] }>;

/** A card's display name ("Killer"), or its id for a card the content does not know. */
export const cardName = (roleId: string): string => ROLES[roleId]?.name ?? roleId;

/** A look's display name with its article ("the Baker"), or '' for an unknown or empty look. */
export const lookName = (lookId: string): string => LOOKS[lookId]?.name ?? '';

/** The palette token behind a look's body colour, for its tag. */
export const lookBase = (lookId: string): string => LOOKS[lookId]?.palette.base ?? 'slate';

/** The public deck of a party of `players` seats (the party fills to four with NPCs; ten is the cap). */
export function deckOfParty(players: number): { cards: string[]; practice: boolean; seats: number } | null {
  const seats = Math.min(10, Math.max(4, players));
  const row = DECKS[String(seats)];
  return row === undefined ? null : { cards: row.cards, practice: row.practice, seats };
}

/** Cards in deck order with a count for each one that repeats (the second Killer of the ten-seat deck). */
export function cardCounts(cards: readonly string[]): Array<{ id: string; count: number }> {
  const out: Array<{ id: string; count: number }> = [];
  for (const id of cards) {
    const seen = out.find((c) => c.id === id);
    if (seen) seen.count++;
    else out.push({ id, count: 1 });
  }
  return out;
}
