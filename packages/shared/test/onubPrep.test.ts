import { describe, expect, it } from 'vitest';
import {
  dealOnub,
  dealPantryLocs,
  onubDeckProblem,
  prepCommitProblem,
  resolvePrep,
  sfc32,
  timeoutCommit,
  type OnubCardLike,
  type OnubCommit,
  type OnubDeckRole,
  type OnubPrepStreams,
  type OnubRuinRule,
  type OnubStationLike,
} from '../src/rules';

// Fixtures copying GDD 3.11 (`balance.onub.json` stations, cards and ruin; `roles.onub.json` copies).
const stations: OnubStationLike[] = [
  {
    id: 'fridge',
    good: ['pureDairy', 'activeYeast'],
    sabotage: ['spoiledMilk', 'unpasteurizedMold', 'thermostat'],
    weight: 1,
  },
  {
    id: 'mixer',
    good: ['t55Flour', 'seaSalt'],
    sabotage: ['sawdust', 'plaster', 'floorSweepings'],
    weight: 1,
    underMixBelow: 2,
    underMixWeight: 1,
  },
  {
    id: 'proofing',
    good: ['warmSteam', 'time'],
    sabotage: ['coldDraft', 'overProofing'],
    weight: 1,
    perk: 'peekPantryLoc',
  },
  { id: 'oven', good: ['oakFirewood', 'steamInjection'], sabotage: ['charcoalAsh', 'wetWood'], weight: 2 },
];
const cards: Record<string, OnubCardLike> = {};
for (const s of stations) {
  for (const id of s.good) cards[id] = { kind: 'good', effect: 'none' };
  for (const id of s.sabotage) cards[id] = { kind: 'sabotage', effect: 'none' };
}
cards.thermostat = { kind: 'sabotage', effect: 'discardRandomOther' };
const rule: OnubRuinRule = {
  weight: 3,
  weightByCount: { '4': 3, '5': 3, '6': 4, '7': 5, '8': 5, '9': 5, '10': 5 },
  goodCancels: 1,
};
const seatsOf = (n: number) => Array.from({ length: n }, (_, i) => `s${i}`);
const streams = (n: number): OnubPrepStreams => ({
  piles: sfc32(n, 1, 2, 3),
  thaw: sfc32(n, 4, 5, 6),
  perk: sfc32(n, 7, 8, 9),
});
const commitsOf = (rows: [string, string, string][]): Map<string, OnubCommit> =>
  new Map(rows.map(([seat, station, card]) => [seat, { station, card }]));
const resolve = (rows: [string, string, string][], seats = seatsOf(6), n = 1) =>
  resolvePrep(commitsOf(rows), seats, stations, cards, rule, 3, streams(n));

describe('dealOnub and dealPantryLocs', () => {
  const deck = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  it('deals one card per seat in a shuffle and the rest to the Pantry', () => {
    const { dealt, pantry } = dealOnub(seatsOf(4), deck, sfc32(1, 2, 3, 4));
    expect(dealt.size).toBe(4);
    expect(pantry).toHaveLength(3);
    expect([...dealt.values(), ...pantry].sort()).toEqual(deck);
  });
  it('is deterministic per stream and varies across streams', () => {
    const a = dealOnub(seatsOf(4), deck, sfc32(1, 2, 3, 4));
    const b = dealOnub(seatsOf(4), deck, sfc32(1, 2, 3, 4));
    expect([...a.dealt]).toEqual([...b.dealt]);
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++)
      seen.add([...dealOnub(seatsOf(4), deck, sfc32(i, 0, 0, 1)).dealt.values()].join());
    expect(seen.size).toBeGreaterThan(10);
  });
  it('throws when no card is left for the Pantry', () => {
    expect(() => dealOnub(seatsOf(4), ['a', 'b', 'c', 'd'], sfc32(1, 2, 3, 4))).toThrow();
  });
  it('draws Pantry Locations uniformly with repeats allowed', () => {
    const rng = sfc32(5, 6, 7, 8);
    const counts = new Map<string, number>();
    for (let i = 0; i < 400; i++) {
      for (const id of dealPantryLocs(['fridge', 'mixer', 'proofing', 'oven'], 3, rng)) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    for (const id of ['fridge', 'mixer', 'proofing', 'oven']) expect(counts.get(id)).toBeGreaterThan(200);
    expect(dealPantryLocs(['oven'], 3, rng)).toEqual(['oven', 'oven', 'oven']);
  });
});

describe('onubDeckProblem', () => {
  const roles: Record<string, OnubDeckRole> = {
    champignon: { ships: 'V1', copies: [1, 2], required: true },
    chef: { ships: 'V1', copies: [1], required: false },
    commis: { ships: 'V1', copies: [2], required: false },
    critique: { ships: 'V1.1', copies: [1], required: false },
  };
  it('accepts a legal deck, with and without the size', () => {
    expect(onubDeckProblem(['champignon', 'champignon', 'chef'], roles)).toBeNull();
    expect(onubDeckProblem(['champignon', 'chef', 'commis', 'commis'], roles, 4)).toBeNull();
  });
  it('reports the first problem in the order of the five ids', () => {
    expect(onubDeckProblem(['champignon', 'nobody', 'critique'], roles)).toBe('unknownRole');
    expect(onubDeckProblem(['champignon', 'critique'], roles)).toBe('notShipped');
    expect(onubDeckProblem(['champignon', 'chef', 'chef'], roles)).toBe('copies');
    expect(onubDeckProblem(['champignon', 'commis'], roles)).toBe('copies');
    expect(onubDeckProblem(['champignon', 'champignon', 'champignon'], roles)).toBe('copies');
    expect(onubDeckProblem(['chef'], roles)).toBe('missingRequired');
    expect(onubDeckProblem([], roles)).toBe('missingRequired');
    expect(onubDeckProblem(['champignon', 'chef'], roles, 5)).toBe('size');
  });
  it('checks unknown before copies and copies before the size', () => {
    expect(onubDeckProblem(['chef', 'chef', 'zzz'], roles, 9)).toBe('unknownRole');
    expect(onubDeckProblem(['chef', 'chef'], roles, 9)).toBe('copies');
  });
});

describe('prepCommitProblem and timeoutCommit', () => {
  it('refuses an unknown station, then a card the seat may not play', () => {
    expect(prepCommitProblem({ station: 'attic', card: 'time' }, stations, true)).toBe('station');
    expect(prepCommitProblem({ station: 'fridge', card: 't55Flour' }, stations, true)).toBe('card');
    expect(prepCommitProblem({ station: 'fridge', card: 'x' }, stations, false)).toBe('card');
  });
  it('lets only a sabotaging role play a sabotage card, and anyone play a good one', () => {
    expect(prepCommitProblem({ station: 'oven', card: 'wetWood' }, stations, true)).toBeNull();
    expect(prepCommitProblem({ station: 'oven', card: 'wetWood' }, stations, false)).toBe('card');
    expect(prepCommitProblem({ station: 'oven', card: 'oakFirewood' }, stations, false)).toBeNull();
  });
  it('makes a legal good-card commit and covers every station and card', () => {
    const rng = sfc32(3, 3, 3, 3);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const c = timeoutCommit(stations, rng);
      expect(prepCommitProblem(c, stations, false)).toBeNull();
      seen.add(`${c.station}/${c.card}`);
    }
    expect(seen.size).toBe(8);
  });
});

describe('resolvePrep', () => {
  it('leaves every station present and an empty table calm', () => {
    const out = resolve([]);
    expect(Object.keys(out.piles).sort()).toEqual(['fridge', 'mixer', 'oven', 'proofing']);
    expect(out).toMatchObject({ ruinWeight: 0, ruined: false, perk: null });
    expect(out.piles.mixer).toEqual({ cards: [], lost: [], net: 0, underMixed: false });
  });
  it('keeps every card (cards plus lost equals visitors) and sorts nothing into who played it', () => {
    const out = resolve([
      ['s0', 'fridge', 'thermostat'],
      ['s1', 'fridge', 'pureDairy'],
      ['s2', 'fridge', 'spoiledMilk'],
      ['s3', 'oven', 'wetWood'],
    ]);
    expect(out.piles.fridge!.cards.length + out.piles.fridge!.lost.length).toBe(3);
    expect(out.piles.oven!.cards).toEqual(['wetWood']);
  });
  it('weights the Oven double and lets good cards cancel sabotage', () => {
    expect(resolve([['s0', 'oven', 'wetWood']]).piles.oven!.net).toBe(2);
    expect(resolve([['s0', 'fridge', 'spoiledMilk']]).piles.fridge!.net).toBe(1);
    const mixed = resolve([
      ['s0', 'oven', 'wetWood'],
      ['s1', 'oven', 'charcoalAsh'],
      ['s2', 'oven', 'oakFirewood'],
    ]);
    expect(mixed.piles.oven!.net).toBe(3);
    const cancelled = resolve([
      ['s0', 'fridge', 'spoiledMilk'],
      ['s1', 'fridge', 'pureDairy'],
    ]);
    expect(cancelled.piles.fridge!.net).toBe(0);
    expect(cancelled.ruinWeight).toBe(0);
  });
  it('flags a lone Mixer card as under-mixed and adds its weight, but not an empty Mixer', () => {
    const lone = resolve([['s0', 'mixer', 't55Flour']]);
    expect(lone.piles.mixer!.underMixed).toBe(true);
    expect(lone.ruinWeight).toBe(1);
    const pair = resolve([
      ['s0', 'mixer', 't55Flour'],
      ['s1', 'mixer', 'seaSalt'],
    ]);
    expect(pair.piles.mixer!.underMixed).toBe(false);
    expect(resolve([]).piles.mixer!.underMixed).toBe(false);
  });
  it('ruins the dough at the threshold of the party size', () => {
    const rows: [string, string, string][] = [
      ['s0', 'oven', 'wetWood'],
      ['s1', 'fridge', 'spoiledMilk'],
    ];
    expect(resolve(rows, seatsOf(5)).ruinWeight).toBe(3);
    expect(resolve(rows, seatsOf(5)).ruined).toBe(true);
    expect(resolve(rows, seatsOf(6)).ruined).toBe(false); // 4 at six seats
    expect(resolve(rows, seatsOf(4)).ruined).toBe(true);
    const more: [string, string, string][] = [...rows, ['s2', 'oven', 'charcoalAsh']];
    expect(resolve(more, seatsOf(6)).ruined).toBe(true); // 2 + 2 + 1 = 5
    expect(resolve(more, seatsOf(7)).ruined).toBe(true);
    expect(resolve(rows, seatsOf(7)).ruined).toBe(false);
  });
  it('falls back to the plain weight for a size the table does not list', () => {
    const out = resolvePrep(
      commitsOf([
        ['s0', 'oven', 'wetWood'],
        ['s1', 'fridge', 'spoiledMilk'],
      ]),
      seatsOf(11),
      stations,
      cards,
      { weight: 3, goodCancels: 1 },
      3,
      streams(1),
    );
    expect(out.ruined).toBe(true);
  });
  it('lets a Thermostat Flip discard one other card by seed, and never itself', () => {
    const rows: [string, string, string][] = [
      ['s0', 'fridge', 'thermostat'],
      ['s1', 'fridge', 'pureDairy'],
      ['s2', 'fridge', 'activeYeast'],
    ];
    const lostCards = new Set<string>();
    for (let n = 0; n < 60; n++) {
      const f = resolve(rows, seatsOf(6), n).piles.fridge!;
      expect(f.cards).toContain('thermostat');
      expect(f.lost).toHaveLength(1);
      expect(f.cards).toHaveLength(2);
      lostCards.add(f.lost[0]!);
    }
    expect(lostCards).toEqual(new Set(['pureDairy', 'activeYeast']));
  });
  it('does nothing for a Thermostat Flip played alone and handles two of them', () => {
    expect(resolve([['s0', 'fridge', 'thermostat']]).piles.fridge).toMatchObject({
      cards: ['thermostat'],
      lost: [],
      net: 1,
    });
    for (let n = 0; n < 40; n++) {
      const f = resolve(
        [
          ['s0', 'fridge', 'thermostat'],
          ['s1', 'fridge', 'thermostat'],
          ['s2', 'fridge', 'pureDairy'],
        ],
        seatsOf(6),
        n,
      ).piles.fridge!;
      expect(f.cards.length + f.lost.length).toBe(3);
      expect(f.cards.length).toBeGreaterThanOrEqual(1);
    }
  });
  it('fires the proofing perk only with a visitor and no sabotage card there', () => {
    const fired = resolve([['s0', 'proofing', 'time']]);
    expect(fired.perk?.station).toBe('proofing');
    expect(fired.perk?.slot).toMatch(/^pantry\.loc\.[0-2]$/);
    expect(resolve([]).perk).toBeNull();
    expect(
      resolve([
        ['s0', 'proofing', 'time'],
        ['s1', 'proofing', 'coldDraft'],
      ]).perk,
    ).toBeNull();
    const slots = new Set<string>();
    for (let n = 0; n < 60; n++) slots.add(resolve([['s0', 'proofing', 'time']], seatsOf(6), n).perk!.slot);
    expect(slots.size).toBe(3);
  });
  it('does not let the thaw stream move the piles or the perk', () => {
    const rows: [string, string, string][] = [
      ['s0', 'fridge', 'thermostat'],
      ['s1', 'fridge', 'pureDairy'],
      ['s2', 'proofing', 'time'],
    ];
    const a = streams(7);
    const b = streams(7);
    b.thaw = sfc32(99, 99, 99, 99);
    const x = resolvePrep(commitsOf(rows), seatsOf(6), stations, cards, rule, 3, a);
    const y = resolvePrep(commitsOf(rows), seatsOf(6), stations, cards, rule, 3, b);
    expect(y.perk).toEqual(x.perk);
    expect(y.piles.proofing).toEqual(x.piles.proofing);
  });
  it('throws on an unknown station or card', () => {
    expect(() => resolve([['s0', 'attic', 'time']])).toThrow();
    expect(() => resolve([['s0', 'fridge', 'nothing']])).toThrow();
  });

  // O2 (onub-contract 6): a card's pile position is independent of its committer's deal index.
  it('O2: pile order ignores who committed each card, over 200 runs', () => {
    const cardsAtOven = ['oakFirewood', 'steamInjection', 'wetWood', 'charcoalAsh', 'oakFirewood'];
    const firstSlot = new Map<string, number>();
    for (let n = 0; n < 200; n++) {
      const forward = cardsAtOven.map((card, i): [string, string, string] => [`s${i}`, 'oven', card]);
      const reversed = cardsAtOven.map((card, i): [string, string, string] => [
        `s${cardsAtOven.length - 1 - i}`,
        'oven',
        card,
      ]);
      const a = resolve(forward, seatsOf(6), n).piles.oven!.cards;
      const b = resolve(reversed, seatsOf(6), n).piles.oven!.cards;
      expect(b).toEqual(a);
      const at = a.indexOf('wetWood');
      firstSlot.set(String(at), (firstSlot.get(String(at)) ?? 0) + 1);
    }
    // And the position itself is spread over the pile, not pinned.
    expect(firstSlot.size).toBe(5);
  });
});
