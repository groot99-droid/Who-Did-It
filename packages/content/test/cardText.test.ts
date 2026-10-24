import { describe, expect, it } from 'vitest';
import rolesJson from '../data/roles.json';
import {
  CARD_FIELDS,
  CARD_TOKEN,
  type CardField,
  content,
  type Content,
  fillCard,
  fillRoles,
} from '../src/index.js';

// Round 8 (8M, DECISIONS A171; teardown.md 2.3): the card-text drift test. Every number typed into a role's text
// (`goal`, `cardText`, `beware`, `win`) is bound to the data it states, and must equal it. A number with no binding
// fails, so a new number in a card cannot ship without saying where it comes from. Spelled-out counts ("one arrest")
// are read in step 4 below: each is a `{word:…}` token or listed in NUMBER_WORDS_EXEMPT with its reason.

const FIELDS = CARD_FIELDS;
type Field = CardField;

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

/** A count spelled out, one to ten or once and twice (the drift test above reads digits only). */
const NUMBER_WORD = /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|once|twice)\b/gi;

/** Count words that are not a number in the data, each with the reason it stays typed. */
export const NUMBER_WORDS_EXEMPT: readonly (Omit<Binding, 'values' | 'source'> & { reason: string })[] = [
  {
    role: 'killer',
    field: 'goal',
    phrase: 'one villager',
    reason: 'the rule is named for it (villageAtMostOne)',
  },
  { role: 'killer', field: 'cardText', phrase: 'clean one clue', reason: 'the Rag cleans one clue per use' },
  {
    role: 'watchman',
    field: 'beware',
    phrase: 'two nights running',
    reason: 'watchRepeatAllowed false bars the next night, so "two" is what running means',
  },
  {
    role: 'herbalist',
    field: 'goal',
    phrase: 'Save one life and end one',
    reason: 'each power targets one seat (target: seat)',
  },
  { role: 'gamekeeper', field: 'goal', phrase: 'the right one', reason: 'a pronoun, not a count' },
  {
    role: 'gamekeeper',
    field: 'cardText',
    phrase: 'the one you take is the one who came',
    reason: 'pronouns',
  },
];

// Step 4 (A171): roles.json holds tokens and the loader fills them, so the words are the ones typed before.
describe('the card text is generated from the data (teardown.md 2.3)', () => {
  const raw = rolesJson.roles as Record<string, Record<CardField, string>>;

  it('ships the words exactly as they were typed', () => {
    const r = content.roles.roles;
    expect(r.killer?.goal).toBe(
      'Kill until the Cabal matches the village (one villager left at 4-5), and never get voted out.',
    );
    expect(r.killer?.beware).toBe(
      'Clues match your own traits whatever face you wear; your height never changes; Blood shows within 3 tiles; ' +
        'a guarded target voids your kill.',
    );
    expect(r.killer?.win).toBe(
      'Parity at 6+ players, living Village at most 1 at 4-5, or the Final Night vote fails.',
    );
    expect(r.detective?.beware).toContain('If you die the Magnifier drops and anyone can Inspect in 6 s.');
    expect(r.child?.beware).toBe('Top kill target; vision -1 tile; cannot pick up items.');
    expect(r.ranger?.beware).toBe('Bolts are loud (noise 10).');
    for (const role of Object.values(r)) for (const f of CARD_FIELDS) expect(role[f]).not.toMatch(/[{}]/);
  });

  it('keeps every bound number in roles.json as a token', () => {
    const typed: string[] = [];
    for (const [id, role] of Object.entries(raw)) {
      for (const field of CARD_FIELDS) {
        let rest = role[field].replace(CARD_TOKEN, '');
        for (const u of UNSHIPPED.filter((x) => x.role === id && x.field === field))
          rest = rest.replace(u.phrase, '');
        // The threshold is the rule's own name (`villageAtMostOne`), not a tunable number.
        rest = rest.replace('at most 1 at', '');
        typed.push(...[...rest.matchAll(NUMBER)].map((m) => `${id}.${field}: ${m[0]}`));
      }
    }
    expect(typed).toEqual([]);
  });

  it('ships the spelled-out counts exactly as they were typed', () => {
    const r = content.roles.roles;
    expect(r.ranger?.goal).toBe('Hunt the wolves and make your one arrest count.');
    expect(r.ranger?.cardText).toBe('You hunt wolves. One arrest per match: be right.');
    expect(r.vicar?.goal).toBe("Learn one soul's faction each night and steer the vote.");
    expect(r.vicar?.cardText).toContain('Each night, learn where one soul stands,');
    expect(r.watchman?.goal).toBe('Stand guard over one neighbour each night.');
    expect(r.watchman?.cardText).toContain('Each night, choose one door to stand by;');
    expect(r.herbalist?.goal).toBe('Save one life and end one, once each, and be right both times.');
    expect(r.herbalist?.cardText).toMatch(/^One bottle saves, one bottle ends\. /);
    expect(r.doctor?.beware).toBe('Two-Killer games outpace your bandages.');
  });

  it('keeps every count word in roles.json as a token or a listed exemption', () => {
    const typed: string[] = [];
    for (const [id, role] of Object.entries(raw)) {
      for (const field of CARD_FIELDS) {
        let rest = role[field].replace(CARD_TOKEN, '');
        for (const e of NUMBER_WORDS_EXEMPT.filter((x) => x.role === id && x.field === field)) {
          expect(rest, `${id}.${field}: the exempt words "${e.phrase}"`).toContain(e.phrase);
          rest = rest.replace(e.phrase, '');
        }
        typed.push(...[...rest.matchAll(NUMBER_WORD)].map((m) => `${id}.${field}: ${m[0]}`));
      }
    }
    expect(typed).toEqual([]);
  });

  it('writes a count in the words its token asks for', () => {
    const data = structuredClone(content);
    data.abilities.abilities.arrest!.usesPerMatch = 2;
    data.balance.nightPowers.perNight = 3;
    data.roles.roles.herbalist!.startKit[0]!.qty = 2;
    const r = fillRoles(rolesJson as unknown as typeof content.roles, data).roles;
    expect(r.ranger?.cardText).toBe('You hunt wolves. Two arrest per match: be right.');
    expect(r.vicar?.goal).toBe("Learn three soul's faction each night and steer the vote.");
    expect(r.herbalist?.goal).toContain('twice each');
    expect(fillCard(content, '{times:balance.noise.bolt}')).toBe('10 times');
    expect(fillCard(content, '{Word:balance.noise.bolt}')).toBe('Ten');
    expect(fillCard(content, '{word:balance.vision.childDeltaTiles}')).toBe('-1');
    expect(fillCard(content, '{word:byCount.parity.from}')).toBe('six');
  });

  it('follows the data when it moves', () => {
    const data = structuredClone(content);
    data.clues.clues.blood!.params!.visibleTiles = 4;
    data.balance.byCount['5'].cabalWin = 'parity';
    const killer = fillRoles(rolesJson as unknown as typeof content.roles, data).roles.killer!;
    expect(killer.beware).toContain('Blood shows within 4 tiles');
    expect(killer.win).toBe(
      'Parity at 5+ players, living Village at most 1 at 4, or the Final Night vote fails.',
    );
  });

  it('refuses a token that names nothing', () => {
    expect(() => fillCard(content, 'within {clues.clues.blood.params.range} tiles')).toThrow(/not a number/);
    expect(() => fillCard(content, 'at {byCount.never.from}')).toThrow(/no party size/);
  });
});
