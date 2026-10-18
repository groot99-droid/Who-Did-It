import { describe, expect, it } from 'vitest';
import onubBalance from '@wdi/content/data/balance.onub.json';
import onubRoles from '@wdi/content/data/roles.onub.json';
import type { OnubDeckProblem, OnubDeckRole } from '@wdi/shared/rules';
import { ONUB_PREP_COPY } from '../copy/onubPrep';
import { defaultDeck, deckProblem, deckSize, localDeckProblem, nextCount, toggleRole } from './DeckEditor';

const ROLES = onubRoles.roles as Record<string, OnubDeckRole>;
const five = onubBalance.byCount['5'].deck;

describe('deck editor problems', () => {
  it('accepts every default deck at its size', () => {
    for (const n of [4, 5, 6, 7, 8, 9, 10]) {
      expect(localDeckProblem(defaultDeck(n), ROLES, deckSize(n))).toBeNull();
    }
  });

  it('names the five problems in check order', () => {
    expect(localDeckProblem([...five, 'soufflé'], ROLES)).toBe('unknownRole');
    expect(localDeckProblem(five, { ...ROLES, chef: { ...ROLES.chef!, ships: 'V2' } })).toBe('notShipped');
    expect(localDeckProblem([...five, 'chef'], ROLES)).toBe('copies');
    expect(
      localDeckProblem(
        five.filter((r) => r !== 'champignon'),
        ROLES,
      ),
    ).toBe('missingRequired');
    expect(localDeckProblem(five, ROLES, 9)).toBe('size');
  });

  it('has a copy line for each problem', () => {
    const ids: OnubDeckProblem[] = ['unknownRole', 'notShipped', 'copies', 'missingRequired', 'size'];
    for (const id of ids) expect(ONUB_PREP_COPY[`onub.deck.problem.${id}`]).toBeTruthy();
  });

  it('uses the shared rule or its stand-in with the same answers', () => {
    expect(deckProblem(five, deckSize(5))).toBeNull();
    expect(deckProblem(five, 20)).toBe('size');
  });

  it('adds the Pantry cards to the party, and fills a party below the minimum', () => {
    expect(deckSize(6)).toBe(6 + onubBalance.pantry.roles);
    expect(deckSize(1)).toBe(deckSize(4));
  });
});

describe('deck editor toggles', () => {
  it('cycles a Spore through none, one and two copies', () => {
    expect([nextCount('champignon', 0), nextCount('champignon', 1), nextCount('champignon', 2)]).toEqual([
      1, 2, 0,
    ]);
  });

  it('adds the Commis as a pair and removes it together', () => {
    const withPair = toggleRole(five, 'commis');
    expect(withPair.filter((r) => r === 'commis')).toHaveLength(2);
    expect(toggleRole(withPair, 'commis').filter((r) => r === 'commis')).toHaveLength(0);
  });

  it('keeps the deck in roles.onub.json order', () => {
    const order = Object.keys(ROLES);
    const idx = toggleRole(five, 'boulanger').map((r) => order.indexOf(r));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
  });
});
