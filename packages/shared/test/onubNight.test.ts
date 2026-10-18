import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  type OnubActLike,
  type OnubRoleInfo,
  type OnubVoteRule,
  type OnubWindowLike,
  type OnubWinnerRowLike,
  type TableSize,
  actTargetsProblem,
  applyCardAct,
  mulberry32,
  onubWinFlags,
  onubWinnerName,
  onubWinners,
  pantrySlot,
  resolveDawn,
  seatSlot,
  seededTargets,
  tableAtNight,
  targetPool,
  wakeView,
} from '../src/rules';

// The real data: the acts, windows, vote rule and winners table are `balance.onub.json`, the roles `roles.onub.json`.
const read = <T>(file: string): T =>
  JSON.parse(readFileSync(new URL(`../../content/data/${file}`, import.meta.url), 'utf8')) as T;
const balance = read<{
  acts: Record<string, OnubActLike>;
  windows: OnubWindowLike[];
  vote: OnubVoteRule;
  winners: OnubWinnerRowLike[];
}>('balance.onub.json');
const rolesJson = read<{ roles: Record<string, OnubRoleInfo> }>('roles.onub.json');
const info = (id: string): OnubRoleInfo => rolesJson.roles[id] as OnubRoleInfo;
const act = (id: string): OnubActLike => balance.acts[id] as OnubActLike;
const win = (role: string): OnubWindowLike => balance.windows.find((w) => w.role === role) as OnubWindowLike;

const SEATS = ['a', 'b', 'c', 'd', 'e'];
const size: TableSize = { seats: 5, pantryRoles: 3, pantryLocs: 3 };
const table = () =>
  tableAtNight(
    ['champignon', 'chef', 'sousChef', 'croissant', 'critique'],
    ['fridge', 'mixer', 'oven', 'proofing', 'fridge'],
    ['inspecteur', 'aboyeur', 'plongeur'],
    ['oven', 'oven', 'mixer'],
  );
const multiset = (m: Map<string, string>): string[] => [...m.values()].sort();

describe('targetPool', () => {
  it('lists seats in deal order then the Pantry, role before location for anySeatCard', () => {
    expect(targetPool(act('onub.cloche'), 1, size, '').slice(0, 4)).toEqual([
      'seat.0.role',
      'seat.0.loc',
      'seat.1.role',
      'seat.1.loc',
    ]);
    expect(targetPool(act('onub.cloche'), 1, size, '')).toHaveLength(10);
  });

  it('never offers the actor`s own card for other* kinds, and always for any* kinds', () => {
    expect(targetPool(act('onub.peekLoc'), 2, size, '')).not.toContain('seat.2.loc');
    expect(targetPool(act('onub.peekLoc'), 2, size, '')).toHaveLength(4);
    expect(targetPool(act('onub.laminateSwap'), 2, size, '')).toContain('seat.2.role');
    expect(targetPool(act('onub.laminateSwap'), 2, size, '')).toHaveLength(5);
  });

  it('puts seat slots before Pantry slots across target kinds', () => {
    const pool = targetPool(act('onub.vent'), 0, size, '');
    expect(pool).toEqual([
      'seat.1.loc',
      'seat.2.loc',
      'seat.3.loc',
      'seat.4.loc',
      'pantry.loc.0',
      'pantry.loc.1',
      'pantry.loc.2',
    ]);
  });

  it('removes the cloche, and empties a swap whose own card is covered', () => {
    expect(targetPool(act('onub.peekRole'), 0, size, 'seat.1.role')).not.toContain('seat.1.role');
    expect(targetPool(act('onub.rob'), 2, size, 'seat.2.role')).toEqual([]);
    expect(targetPool(act('onub.drunk'), 2, size, 'seat.2.role')).toEqual([]);
    expect(targetPool(act('onub.vent'), 2, size, 'seat.2.loc')).toEqual([]);
    // a covered Location card does not stop a Role swap
    expect(targetPool(act('onub.rob'), 2, size, 'seat.2.loc')).toHaveLength(4);
  });

  it('is empty for an act without picks', () => {
    expect(targetPool(act('onub.inspect'), 0, size, '')).toEqual([]);
  });
});

describe('actTargetsProblem', () => {
  const problem = (id: string, targets: string[], cloche = '', peeked = '', actor = 0) =>
    actTargetsProblem(act(id), actor, size, cloche, targets, peeked);

  it('accepts a legal pick', () => {
    expect(problem('onub.peekLoc', ['seat.2.loc'])).toBeNull();
    expect(problem('onub.inspect', [])).toBeNull();
    expect(problem('onub.dishRoles', ['seat.1.role', 'seat.2.role'])).toBeNull();
  });

  it('refuses the wrong count, a repeat, a slot outside the pool and the cloche', () => {
    expect(problem('onub.peekLoc', [])).toBe('count');
    expect(problem('onub.peekLoc', ['seat.1.loc', 'seat.2.loc'])).toBe('count');
    expect(problem('onub.peekLocs', ['seat.1.loc', 'seat.1.loc'])).toBe('duplicate');
    expect(problem('onub.peekLoc', ['seat.0.loc'])).toBe('slot'); // own
    expect(problem('onub.peekLoc', ['seat.1.role'])).toBe('slot'); // wrong kind
    expect(problem('onub.peekLoc', ['nonsense'])).toBe('slot');
    expect(problem('onub.peekLoc', ['seat.1.loc'], 'seat.1.loc')).toBe('slot');
    expect(problem('onub.dishLocs', ['seat.1.loc', 'seat.9.loc'])).toBe('slot');
  });

  it('refuses a swap of a covered own card', () => {
    expect(problem('onub.rob', ['seat.1.role'], 'seat.0.role')).toBe('slot');
  });

  it('keeps the Tourrier`s two steps in order', () => {
    expect(problem('onub.laminateSwap', ['seat.1.role'])).toBe('step'); // no peek yet
    expect(problem('onub.laminateSwap', ['seat.1.role'], '', 'pantry.role.0')).toBeNull();
    expect(problem('onub.laminatePeek', ['pantry.role.1'], '', 'pantry.role.0')).toBe('step'); // one is pending
    expect(problem('onub.laminatePeek', ['pantry.role.1'])).toBeNull();
  });
});

describe('applyCardAct', () => {
  it('a cloche changes nothing and names its slot', () => {
    const cards = table();
    const r = applyCardAct(cards, act('onub.cloche'), 0, ['seat.3.loc'], '');
    expect(r.cloche).toBe('seat.3.loc');
    expect(r.next).toEqual(cards);
    expect(r.reveal).toEqual([]);
    expect(r.logSlots).toEqual(['seat.3.loc']);
  });

  it('a peek shows the picks and changes nothing', () => {
    const cards = table();
    const r = applyCardAct(cards, act('onub.peekPantry'), 0, ['pantry.role.2', 'pantry.role.0'], '');
    expect(r.reveal).toEqual([
      { slot: 'pantry.role.2', kind: 'role', value: 'plongeur' },
      { slot: 'pantry.role.0', kind: 'role', value: 'inspecteur' },
    ]);
    expect(r.next).toEqual(cards);
    expect(applyCardAct(cards, act('onub.peekLoc'), 0, ['seat.1.loc'], '').reveal).toEqual([
      { slot: 'seat.1.loc', kind: 'loc', value: 'mixer' },
    ]);
  });

  it('the Inspecteur reads both own cards', () => {
    const r = applyCardAct(table(), act('onub.inspect'), 2, [], '');
    expect(r.reveal).toEqual([
      { slot: 'seat.2.role', kind: 'role', value: 'sousChef' },
      { slot: 'seat.2.loc', kind: 'loc', value: 'oven' },
    ]);
    expect(r.logSlots).toEqual(['seat.2.role', 'seat.2.loc']);
  });

  it('the Sous-Chef swaps Role cards and sees the new one', () => {
    const r = applyCardAct(table(), act('onub.rob'), 2, ['seat.0.role'], '');
    expect(r.next.roles.get('seat.2.role')).toBe('champignon');
    expect(r.next.roles.get('seat.0.role')).toBe('sousChef');
    expect(r.reveal).toEqual([{ slot: 'seat.2.role', kind: 'role', value: 'champignon' }]);
    expect(r.logSlots).toEqual(['seat.2.role', 'seat.0.role']);
    expect(r.next.locs).toEqual(table().locs);
  });

  it('the Rat swaps Location cards with the Pantry and sees the new one', () => {
    const r = applyCardAct(table(), act('onub.vent'), 3, ['pantry.loc.2'], '');
    expect(r.next.locs.get('seat.3.loc')).toBe('mixer');
    expect(r.next.locs.get('pantry.loc.2')).toBe('proofing');
    expect(r.reveal).toEqual([{ slot: 'seat.3.loc', kind: 'loc', value: 'mixer' }]);
  });

  it('the Garde Manger swaps with the Pantry and sees nothing', () => {
    const r = applyCardAct(table(), act('onub.drunk'), 0, ['pantry.role.1'], '');
    expect(r.next.roles.get('seat.0.role')).toBe('aboyeur');
    expect(r.next.roles.get('pantry.role.1')).toBe('champignon');
    expect(r.reveal).toEqual([]);
  });

  it('the Tourrier swaps the peeked card into any Role, their own included', () => {
    const r = applyCardAct(table(), act('onub.laminateSwap'), 1, ['seat.1.role'], 'pantry.role.0');
    expect(r.next.roles.get('seat.1.role')).toBe('inspecteur');
    expect(r.next.roles.get('pantry.role.0')).toBe('chef');
    expect(r.logSlots).toEqual(['pantry.role.0', 'seat.1.role']);
    expect(r.reveal).toEqual([]);
  });

  it('the Plongeur swaps two other cards of one kind without a reveal', () => {
    const r = applyCardAct(table(), act('onub.dishLocs'), 0, ['seat.1.loc', 'seat.2.loc'], '');
    expect(r.next.locs.get('seat.1.loc')).toBe('oven');
    expect(r.next.locs.get('seat.2.loc')).toBe('mixer');
    expect(r.reveal).toEqual([]);
    expect(r.logSlots).toEqual(['seat.1.loc', 'seat.2.loc']);
  });

  it('never mutates its input and throws on a cross-kind swap', () => {
    const cards = table();
    applyCardAct(cards, act('onub.rob'), 2, ['seat.0.role'], '');
    expect(cards).toEqual(table());
    expect(() => applyCardAct(cards, act('onub.dishRoles'), 0, ['seat.1.role', 'seat.2.loc'], '')).toThrow();
  });

  it('keeps the multiset of Role cards and of Location cards across 500 random legal acts', () => {
    const rng = mulberry32(7);
    const ids = Object.keys(balance.acts).filter((id) => id !== 'onub.laminateSwap');
    for (let n = 0; n < 500; n++) {
      const cards = table();
      const id = ids[Math.floor(rng() * ids.length)] as string;
      const actor = Math.floor(rng() * size.seats);
      const cloche = rng() < 0.5 ? seatSlot(Math.floor(rng() * 5), rng() < 0.5 ? 'role' : 'loc') : '';
      const picks = seededTargets(act(id), actor, size, cloche, rng);
      if (!picks) continue;
      expect(actTargetsProblem(act(id), actor, size, cloche, picks, '')).toBeNull();
      const r = applyCardAct(cards, act(id), actor, picks, '');
      expect(multiset(r.next.roles)).toEqual(multiset(cards.roles));
      expect(multiset(r.next.locs)).toEqual(multiset(cards.locs));
      if (cloche) {
        // nothing moves under the cloche
        expect(r.next.roles.get(cloche) ?? r.next.locs.get(cloche)).toBe(
          cards.roles.get(cloche) ?? cards.locs.get(cloche),
        );
      }
    }
  });
});

describe('wakeView', () => {
  const dealt = ['champignon', 'chef', 'champignon', 'levain', 'commis'];
  const acts = balance.acts;
  const view = (role: string, actor: number, cloche = '', state = { acted: false, peeked: '' }) =>
    wakeView(win(role), actor, dealt, SEATS, acts, size, cloche, state);

  it('shows the Spores to each other and gives no act while a mate is there', () => {
    const v = view('champignon', 0);
    expect(v.mates).toEqual(['c']);
    expect(v.alone).toBe(false);
    expect(v.legal).toEqual([]);
    expect(v.must).toBe(false);
  });

  it('lets a lone Spore peek at a Pantry Role card', () => {
    const lone = wakeView(
      win('champignon'),
      0,
      ['champignon', 'chef', 'a', 'b', 'c'],
      SEATS,
      acts,
      size,
      '',
      {
        acted: false,
        peeked: '',
      },
    );
    expect(lone.alone).toBe(true);
    expect(lone.legal).toEqual([
      { act: 'onub.sporePeek', picks: 1, slots: ['pantry.role.0', 'pantry.role.1', 'pantry.role.2'] },
    ]);
  });

  it('shows the Levain the dealt Spores', () => {
    expect(view('levain', 3).seen).toEqual([
      { seat: 'a', roleId: 'champignon' },
      { seat: 'c', roleId: 'champignon' },
    ]);
  });

  it('carries the cloche and drops an act that cannot be made', () => {
    expect(view('chef', 1, 'seat.2.role').cloche).toBe('seat.2.role');
    const rat = wakeView(win('ratDeCave'), 3, dealt, SEATS, acts, size, 'seat.3.loc', {
      acted: false,
      peeked: '',
    });
    expect(rat.legal).toEqual([]);
  });

  it('lists the Chef`s two acts with their pools, and nothing once acted', () => {
    const v = view('chef', 1);
    expect(v.legal.map((l) => l.act)).toEqual(['onub.peekRole', 'onub.peekPantry']);
    expect(v.legal[1]).toMatchObject({ picks: 2 });
    expect(view('chef', 1, '', { acted: true, peeked: '' }).legal).toEqual([]);
  });

  it('moves the Tourrier to the swap alone once a card was peeked, and marks the must-acts', () => {
    const first = view('tourrier', 0);
    expect(first.legal.map((l) => l.act)).toEqual(['onub.laminatePeek']);
    expect(first.must).toBe(true);
    const second = view('tourrier', 0, '', { acted: false, peeked: 'pantry.role.1' });
    expect(second.legal.map((l) => l.act)).toEqual(['onub.laminateSwap']);
    expect(second.legal[0]?.slots).toHaveLength(5);
    expect(view('gardeManger', 0).must).toBe(true);
  });

  it('gives the Inspecteur a pickless act', () => {
    expect(view('inspecteur', 0).legal).toEqual([{ act: 'onub.inspect', picks: 0, slots: [] }]);
  });
});

describe('seededTargets', () => {
  it('draws distinct slots of the pool and is reproducible', () => {
    const a = seededTargets(act('onub.peekPantry'), 0, size, '', mulberry32(3));
    const b = seededTargets(act('onub.peekPantry'), 0, size, '', mulberry32(3));
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(2);
    for (const s of a ?? []) expect(targetPool(act('onub.peekPantry'), 0, size, '')).toContain(s);
  });

  it('is null when the pool is too small and empty for no picks', () => {
    expect(seededTargets(act('onub.drunk'), 0, size, 'seat.0.role', mulberry32(1))).toBeNull();
    expect(seededTargets(act('onub.inspect'), 0, size, '', mulberry32(1))).toEqual([]);
  });

  it('is roughly uniform over the pool', () => {
    const rng = mulberry32(11);
    const counts = new Map<string, number>();
    for (let n = 0; n < 3000; n++) {
      const [pick] = seededTargets(act('onub.drunk'), 0, size, '', rng) as string[];
      counts.set(pick as string, (counts.get(pick as string) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual([0, 1, 2].map((k) => pantrySlot('role', k)).sort());
    for (const c of counts.values()) expect(c).toBeGreaterThan(850);
  });
});

describe('resolveDawn', () => {
  const finals = new Map([
    ['a', 'champignon'],
    ['b', 'chef'],
    ['c', 'critique'],
    ['d', 'croissant'],
    ['e', 'sousChef'],
  ]);
  const dawn = (votes: Record<string, string>, seats = SEATS, rule: Partial<OnubVoteRule> = {}) =>
    resolveDawn(votes, seats, finals, info, { ...balance.vote, ...rule });

  it('turns out everyone at the top with at least two votes, ties included', () => {
    expect(dawn({ a: 'b', c: 'b', d: 'e', e: 'd', b: 'a' }).outs).toEqual(['b']);
    const tie = dawn({ a: 'b', c: 'b', d: 'e', e: 'd', b: 'e' });
    expect(tie.tally).toEqual({ b: 2, e: 2, d: 1 });
    expect(tie.outs).toEqual(['b', 'e']);
  });

  it('turns out nobody under the minimum, and names the abstainers', () => {
    const r = dawn({ a: 'b', c: 'd', d: 'e' });
    expect(r.outs).toEqual([]);
    expect(r.abstained).toEqual(['b', 'e']);
  });

  it('counts the Pantry, which removes nobody', () => {
    const r = dawn({ a: 'pantry', b: 'pantry', c: 'd' });
    expect(r.pantryOut).toBe(true);
    expect(r.outs).toEqual([]);
    expect(r.tally.pantry).toBe(2);
    const tied = dawn({ a: 'pantry', b: 'pantry', c: 'd', d: 'e', e: 'd' });
    expect(tied.pantryOut).toBe(true);
    expect(tied.outs).toEqual(['d']);
    expect(
      dawn({ a: 'pantry', b: 'pantry', c: 'd', d: 'e', e: 'd' }, SEATS, { pantryTarget: false }).pantryOut,
    ).toBe(false);
  });

  it('abstains a self vote, a non-target and a vote from outside the seats', () => {
    const r = dawn({ a: 'a', b: 'zed', zed: 'c', c: 'd', d: 'c' });
    expect(r.tally).toEqual({ d: 1, c: 1 });
    expect(r.abstained).toEqual(['a', 'b', 'e']);
    expect(dawn({ b: 'a', c: 'a', e: 'a' }, ['b', 'c', 'e']).outs).toEqual([]); // a left: no target
  });

  it('ejects no tie when ties do not turn out all', () => {
    const r = dawn({ a: 'e', c: 'b', d: 'e', b: 'e' }, SEATS, { tiesTurnOutAll: false });
    expect(r.outs).toEqual(['e']);
    expect(dawn({ a: 'b', c: 'b', d: 'e', e: 'd', b: 'e' }, SEATS, { tiesTurnOutAll: false }).outs).toEqual(
      [],
    );
  });

  it('drags the Critique`s vote in with them, once, in seat order', () => {
    const r = dawn({ a: 'c', b: 'c', c: 'e', d: 'a', e: 'a' });
    expect(r.tally).toEqual({ c: 2, e: 1, a: 2 });
    expect(r.outs).toEqual(['a', 'c', 'e']);
    expect(r.hop).toBe('e');
    // a vote at the Pantry or an abstention drags nobody
    expect(dawn({ a: 'c', b: 'c', c: 'pantry' }).hop).toBe('');
    expect(dawn({ a: 'c', b: 'c' }).outs).toEqual(['c']);
    // the target is already in the oven: no hop
    expect(dawn({ a: 'c', b: 'c', c: 'a', d: 'a' }).hop).toBe('');
    // one hop at most
    expect(dawn({ a: 'c', b: 'c', c: 'e', e: 'a' }, SEATS, { critiqueHops: 0 }).hop).toBe('');
  });

  it('reads the Critique from the FINAL card, so a swapped Critique drags, not the dealt one', () => {
    const swapped = new Map(finals).set('c', 'chef').set('b', 'critique');
    const r = resolveDawn({ a: 'b', c: 'b', b: 'e' }, SEATS, swapped, info, balance.vote);
    expect(r.outs).toEqual(['b', 'e']);
  });
});

describe('winners', () => {
  const flagsFor = (outs: string[], finals: Map<string, string>, ruined = false) =>
    onubWinFlags(outs, finals, ruined, info);
  const winners = (outs: string[], finals: Map<string, string>, ruined = false) =>
    onubWinners(flagsFor(outs, finals, ruined), finals, info, balance.winners);
  const deal = (...roles: string[]) => new Map(roles.map((r, i) => [SEATS[i] as string, r]));

  it('computes the flags from the final cards in the oven and at the table', () => {
    const finals = deal('champignon', 'chef', 'croissant', 'levain', 'sousChef');
    expect(flagsFor(['c', 'd'], finals, true)).toEqual({
      ruined: true,
      croissantOut: true,
      sporeOut: false,
      sporeAmongPlayers: true,
      moldOut: true,
      anyoneOut: true,
    });
    expect(flagsFor([], deal('chef', 'chef', 'levain', 'sousChef', 'critique'))).toMatchObject({
      sporeAmongPlayers: false,
      anyoneOut: false,
      moldOut: false,
    });
  });

  it('croissantAndBakers: the Croissant and a Spore both go in and the dough held', () => {
    const finals = deal('champignon', 'chef', 'croissant', 'levain', 'sousChef');
    expect(winners(['a', 'c'], finals)).toEqual({ rowId: 'croissantAndBakers', winnerIds: ['b', 'c', 'e'] });
  });

  it('croissant beats ruin and wins alone', () => {
    const finals = deal('champignon', 'chef', 'croissant', 'levain', 'sousChef');
    expect(winners(['c'], finals, true)).toEqual({ rowId: 'croissant', winnerIds: ['c'] });
    expect(winners(['a', 'c'], finals, true)).toEqual({ rowId: 'croissant', winnerIds: ['c'] });
  });

  it('ruined: every Team Mold card wins, those in the oven too', () => {
    const finals = deal('champignon', 'chef', 'levain', 'sousChef', 'ratDeCave');
    expect(winners(['a'], finals, true)).toEqual({ rowId: 'ruined', winnerIds: ['a', 'c', 'e'] });
  });

  it('sporeOut: a Spore in the oven, the Bakers win', () => {
    const finals = deal('champignon', 'chef', 'levain', 'sousChef', 'critique');
    expect(winners(['a'], finals)).toEqual({ rowId: 'sporeOut', winnerIds: ['b', 'd', 'e'] });
  });

  it('sporesHide: a Spore at the table and none in the oven, Team Mold wins', () => {
    const finals = deal('champignon', 'chef', 'levain', 'sousChef', 'critique');
    expect(winners(['b'], finals)).toEqual({ rowId: 'sporesHide', winnerIds: ['a', 'c'] });
    expect(winners([], finals)).toEqual({ rowId: 'sporesHide', winnerIds: ['a', 'c'] });
  });

  it('cleanTable: no Spore at the table and nobody in the oven, the Bakers win', () => {
    const finals = deal('chef', 'chef', 'levain', 'sousChef', 'critique');
    expect(winners([], finals)).toEqual({ rowId: 'cleanTable', winnerIds: ['a', 'b', 'd', 'e'] });
  });

  it('moldOut: no Spore at the table and a Team Mold card in the oven, the Bakers win', () => {
    const finals = deal('chef', 'inspecteur', 'levain', 'sousChef', 'critique');
    expect(winners(['c'], finals)).toEqual({ rowId: 'moldOut', winnerIds: ['a', 'b', 'd', 'e'] });
  });

  it('wrongOven: no Spore, a Baker in the oven, Team Mold wins, or nobody does', () => {
    const withMold = deal('chef', 'inspecteur', 'levain', 'sousChef', 'critique');
    expect(winners(['a'], withMold)).toEqual({ rowId: 'wrongOven', winnerIds: ['c'] });
    const none = deal('chef', 'inspecteur', 'aboyeur', 'sousChef', 'critique');
    const r = winners(['a'], none);
    expect(r).toEqual({ rowId: 'wrongOven', winnerIds: [] });
    const row = balance.winners.find((w) => w.id === r.rowId) as OnubWinnerRowLike;
    expect(onubWinnerName(row, r.winnerIds)).toBe('nobody');
  });

  it('every dawn reaches a row (the table is total)', () => {
    const cards = ['champignon', 'chef', 'levain', 'croissant', 'critique', 'sousChef'];
    const rng = mulberry32(99);
    for (let n = 0; n < 400; n++) {
      const finals = new Map(SEATS.map((s) => [s, cards[Math.floor(rng() * cards.length)] as string]));
      const outs = SEATS.filter(() => rng() < 0.3);
      expect(() => winners(outs, finals, rng() < 0.2)).not.toThrow();
    }
  });

  it('names the GameState winner', () => {
    const row = (id: string) => balance.winners.find((w) => w.id === id) as OnubWinnerRowLike;
    expect(onubWinnerName(row('croissantAndBakers'), ['b', 'c'])).toBe('croissant');
    expect(onubWinnerName(row('croissant'), ['c'])).toBe('croissant');
    expect(onubWinnerName(row('ruined'), ['a'])).toBe('cabal');
    expect(onubWinnerName(row('sporeOut'), ['b'])).toBe('village');
    expect(onubWinnerName(row('sporesHide'), ['a'])).toBe('cabal');
    expect(onubWinnerName(row('cleanTable'), ['b'])).toBe('village');
    expect(onubWinnerName(row('sporeOut'), [])).toBe('nobody');
  });

  it('throws when no row holds', () => {
    const finals = deal('chef', 'chef', 'chef', 'chef', 'chef');
    expect(() => onubWinners(flagsFor([], finals), finals, info, [])).toThrow();
  });
});
