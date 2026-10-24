import { describe, expect, it } from 'vitest';
import { content, type Content } from '../src/index.js';

// Round 8 (8M, DECISIONS A171; teardown.md 2.3): the card-text drift test. Every number typed into a role's text
// (`goal`, `cardText`, `beware`, `win`) is bound to the data it states, and must equal it. A number with no binding
// fails, so a new number in a card cannot ship without saying where it comes from. Spelled-out counts ("one arrest")
// are words, not numbers, and are not read here.

const FIELDS = ['goal', 'cardText', 'beware', 'win'] as const;
type Field = (typeof FIELDS)[number];

/** A number as typed: an integer or a decimal, signed only when the sign starts a word ("-1 tile", not "4-5"). */
const NUMBER = /(?:(?<![\w.])[-+])?\d+(?:\.\d+)?/g;

/** The party sizes whose `byCount` row plays `rule`, as the first and last of one unbroken run. */
function sizesOf(c: Content, rule: string): [number, number] {
  const sizes = Object.entries(c.balance.byCount)
    .filter(([, row]) => row.cabalWin === rule)
    .map(([n]) => Number(n))
    .sort((a, b) => a - b);
  return [sizes[0] ?? NaN, sizes.at(-1) ?? NaN];
}

/** `villageAtMostOne` (GDD 3.8) names its threshold: the Cabal wins when the living Village is at most this. */
const VILLAGE_AT_MOST_ONE = 1;

interface Binding {
  role: string;
  field: Field;
  /** The exact words of the text that carry the numbers, in order. */
  phrase: string;
  /** Where the numbers come from, for the failure message. */
  source: string;
  values: (c: Content) => number[];
}

export const BINDINGS: readonly Binding[] = [
  {
    role: 'killer',
    field: 'goal',
    phrase: 'one villager left at 4-5',
    source: 'balance.byCount[*].cabalWin villageAtMostOne',
    values: (c) => sizesOf(c, 'villageAtMostOne'),
  },
  {
    role: 'killer',
    field: 'beware',
    phrase: 'Blood shows within 3 tiles',
    source: 'clues.blood.params.visibleTiles',
    values: (c) => [c.clues.clues.blood?.params?.visibleTiles as number],
  },
  {
    role: 'killer',
    field: 'win',
    phrase: 'Parity at 6+ players',
    source: 'balance.byCount[*].cabalWin parity',
    values: (c) => [sizesOf(c, 'parity')[0]],
  },
  {
    role: 'killer',
    field: 'win',
    phrase: 'living Village at most 1 at 4-5',
    source: 'balance.byCount[*].cabalWin villageAtMostOne',
    values: (c) => [VILLAGE_AT_MOST_ONE, ...sizesOf(c, 'villageAtMostOne')],
  },
  {
    role: 'detective',
    field: 'beware',
    phrase: 'anyone can Inspect in 6 s',
    source: 'abilities.inspect.params.droppedMagnifierCastS',
    values: (c) => [c.abilities.abilities.inspect?.params?.droppedMagnifierCastS as number],
  },
  {
    role: 'child',
    field: 'beware',
    phrase: 'vision -1 tile',
    source: 'balance.vision.childDeltaTiles',
    values: (c) => [c.balance.vision.childDeltaTiles],
  },
  {
    role: 'ranger',
    field: 'beware',
    phrase: 'Bolts are loud (noise 10)',
    source: 'balance.noise.bolt',
    values: (c) => [c.balance.noise.bolt],
  },
];

/**
 * Numbers with no data behind them yet, allowed only while their role has not shipped (`ships` is not V1): the
 * Thief is V1.5 and its Heirloom count is "decided when it ships" (GDD 3.2).
 */
export const UNSHIPPED: readonly Omit<Binding, 'values' | 'source'>[] = [
  { role: 'thief', field: 'goal', phrase: 'holding 3 Heirlooms' },
  { role: 'thief', field: 'win', phrase: 'holding 3 Heirlooms' },
];

const numbersIn = (s: string): number[] => [...s.matchAll(NUMBER)].map((m) => Number(m[0]));

/** Every drift between the role text of `c` and its data, one line each; empty when the cards agree. */
export function cardTextDrift(c: Content): string[] {
  const errors: string[] = [];
  for (const [id, role] of Object.entries(c.roles.roles)) {
    for (const field of FIELDS) {
      let rest = role[field];
      const at = `roles.json ${id}.${field}`;
      for (const b of BINDINGS.filter((x) => x.role === id && x.field === field)) {
        if (!rest.includes(b.phrase)) {
          errors.push(`${at}: the bound words "${b.phrase}" are gone (bind the new words to ${b.source})`);
          continue;
        }
        const typed = numbersIn(b.phrase);
        const data = b.values(c);
        if (typed.length !== data.length || typed.some((n, i) => n !== data[i])) {
          errors.push(`${at}: "${b.phrase}" says ${typed.join(', ')} but ${b.source} is ${data.join(', ')}`);
        }
        rest = rest.replace(b.phrase, '');
      }
      for (const u of UNSHIPPED.filter((x) => x.role === id && x.field === field)) {
        if (role.ships === 'V1') errors.push(`${at}: "${u.phrase}" has no data and the role now ships`);
        rest = rest.replace(u.phrase, '');
      }
      for (const n of numbersIn(rest)) {
        errors.push(`${at}: ${n} is typed by hand with no data behind it (add a binding)`);
      }
    }
  }
  return errors;
}

function drifted(edit: (c: Content) => void): string[] {
  const copy = structuredClone(content);
  edit(copy);
  return cardTextDrift(copy);
}

describe('the card text agrees with the data (teardown.md 2.3)', () => {
  it('has no drift as shipped', () => {
    expect(cardTextDrift(content)).toEqual([]);
  });

  it('binds only to roles and fields that exist', () => {
    for (const b of [...BINDINGS, ...UNSHIPPED]) {
      expect(content.roles.roles[b.role]?.[b.field], `${b.role}.${b.field}`).toContain(b.phrase);
    }
  });

  it('fails when the data moves and the words do not', () => {
    expect(drifted((c) => (c.clues.clues.blood!.params!.visibleTiles = 4))).toEqual([
      'roles.json killer.beware: "Blood shows within 3 tiles" says 3 but clues.blood.params.visibleTiles is 4',
    ]);
    expect(drifted((c) => (c.balance.noise.bolt = 12))).toHaveLength(1);
    expect(drifted((c) => (c.balance.vision.childDeltaTiles = -2))).toHaveLength(1);
    expect(drifted((c) => (c.abilities.abilities.inspect!.params!.droppedMagnifierCastS = 8))).toHaveLength(
      1,
    );
    // Parity from 5 players moves the Killer's goal and both phrases of its win line.
    expect(drifted((c) => (c.balance.byCount['5'].cabalWin = 'parity'))).toHaveLength(3);
  });

  it('fails when the words move and the data does not', () => {
    expect(
      drifted(
        (c) => (c.roles.roles.killer!.beware = c.roles.roles.killer!.beware.replace('3 tiles', '2 tiles')),
      ),
    ).toEqual([
      'roles.json killer.beware: the bound words "Blood shows within 3 tiles" are gone ' +
        '(bind the new words to clues.blood.params.visibleTiles)',
      'roles.json killer.beware: 2 is typed by hand with no data behind it (add a binding)',
    ]);
  });

  it('fails on a new number typed by hand', () => {
    expect(drifted((c) => (c.roles.roles.vicar!.cardText += ' Pray for 5 s.'))).toEqual([
      'roles.json vicar.cardText: 5 is typed by hand with no data behind it (add a binding)',
    ]);
  });

  it('fails when an unshipped role ships with its number still typed', () => {
    expect(drifted((c) => (c.roles.roles.thief!.ships = 'V1'))).toHaveLength(2);
  });
});
