import { beforeEach, describe, expect, it, vi } from 'vitest';
import { onubBalance, onubRoles } from '@wdi/content';
import {
  type NightRevealEntry,
  type OnubLegalAct,
  type OnubWakeView,
  ONUB_PREP,
  Phase,
  sfc32,
  TICK_RATE,
} from '@wdi/shared';
import type { PartyRoom } from '../src/rooms/PartyRoom';
import { Brain, NpcMemory } from '../src/sim/npc/memory';
import {
  type PileFacts,
  planAct,
  planClaim,
  planPrep,
  planVote,
  runOnubNpc,
  sightingOf,
} from '../src/sim/npc/onub';
import { createOnubState, onubOf, setOnub } from '../src/sim/onub/state';
import { MatchSeeds } from '../src/sim/seeds';

const mocks = vi.hoisted(() => ({
  ability: vi.fn(),
  claim: vi.fn(),
  vote: vi.fn(),
  view: vi.fn(),
}));
vi.mock('../src/sim/Onub', () => ({ handleOnubAbility: mocks.ability }));
vi.mock('../src/sim/Meeting', () => ({ handleClaim: mocks.claim, handleVote: mocks.vote }));
vi.mock('../src/sim/onub/Acts', () => ({ onubWakeView: mocks.view }));

const { stations } = onubBalance;
const rng = (seed: number) => sfc32(seed, seed ^ 0x9e3779b9, seed + 77, 1234);

/** A stream that counts how many values were drawn from it. */
function counted(seed: number): { rng: () => number; draws: () => number } {
  const base = rng(seed);
  let n = 0;
  return {
    rng: () => {
      n++;
      return base();
    },
    draws: () => n,
  };
}

const goodCards = new Set(stations.flatMap((s) => s.good));
const stationOfCard = (card: string): string =>
  stations.find((s) => [...s.good, ...s.sabotage].includes(card))!.id;

describe('planPrep', () => {
  it('draws a station uniformly whatever the role', () => {
    const counts: Record<string, number> = {};
    const play = rng(1);
    for (let i = 0; i < 4000; i++) {
      const c = planPrep(play, stations, i % 2 === 0, 0.6);
      counts[c.station] = (counts[c.station] ?? 0) + 1;
    }
    for (const s of stations) expect(counts[s.id]! / 4000).toBeGreaterThan(0.2);
  });

  it('plays a sabotage card only for a sabotaging role, with the level chance', () => {
    const play = rng(2);
    let dirty = 0;
    for (let i = 0; i < 4000; i++) {
      const c = planPrep(play, stations, true, 0.6);
      expect(stationOfCard(c.card)).toBe(c.station);
      if (!goodCards.has(c.card)) dirty++;
    }
    expect(dirty / 4000).toBeGreaterThan(0.55);
    expect(dirty / 4000).toBeLessThan(0.65);
    for (let i = 0; i < 500; i++) expect(goodCards.has(planPrep(play, stations, false, 1).card)).toBe(true);
  });

  it('draws the sabotage roll for every card: the stream moves four values, sabotage or not', () => {
    for (const sabotages of [true, false]) {
      const s = counted(3);
      planPrep(s.rng, stations, sabotages, 0.8);
      expect(s.draws()).toBe(4);
    }
    // And the same seed gives the same station and roll whatever the role.
    expect(planPrep(rng(4), stations, true, 0).station).toBe(planPrep(rng(4), stations, false, 1).station);
  });
});

describe('planAct', () => {
  const legal = (act: string, picks: number, slots: string[]): OnubLegalAct => ({ act, picks, slots });
  const view = (acts: OnubLegalAct[], must: boolean): Pick<OnubWakeView, 'legal' | 'must'> => ({
    legal: acts,
    must,
  });

  it('does nothing and draws nothing without a legal act', () => {
    const s = counted(5);
    expect(planAct(view([], false), s.rng)).toBeNull();
    expect(s.draws()).toBe(0);
  });

  it('draws flat over the legal acts plus "nothing" for an act that may be skipped', () => {
    const acts = [
      legal('onub.peekRole', 1, ['seat.1.role', 'seat.2.role']),
      legal('onub.peekPantry', 2, ['pantry.role.0', 'pantry.role.1', 'pantry.role.2']),
    ];
    const play = rng(6);
    const seen = { none: 0, role: 0, pantry: 0 };
    for (let i = 0; i < 3000; i++) {
      const plan = planAct(view(acts, false), play);
      if (!plan) seen.none++;
      else if (plan.act === 'onub.peekRole') seen.role++;
      else seen.pantry++;
    }
    for (const n of Object.values(seen)) expect(n / 3000).toBeGreaterThan(0.28);
  });

  it('never skips a must-act and picks distinct slots from the pool', () => {
    const slots = ['pantry.role.0', 'pantry.role.1', 'pantry.role.2'];
    const play = rng(7);
    for (let i = 0; i < 300; i++) {
      const plan = planAct(view([legal('onub.peekPantry', 2, slots)], true), play);
      expect(plan).not.toBeNull();
      expect(new Set(plan!.targets).size).toBe(2);
      for (const t of plan!.targets) expect(slots).toContain(t);
    }
  });

  it('an act without picks (the Inspecteur) sends no targets', () => {
    expect(planAct(view([legal('onub.inspect', 0, [])], true), rng(8))).toEqual({
      act: 'onub.inspect',
      targets: [],
    });
  });
});

describe('planClaim', () => {
  const deck = onubBalance.byCount['9'].deck;
  const dirtyPiles: PileFacts = {
    fridge: { cards: ['pureDairy'], net: 0 },
    mixer: { cards: ['sawdust', 't55Flour'], net: 0 },
    proofing: { cards: ['coldDraft'], net: 1 },
    oven: { cards: [], net: 0 },
  };
  const base = {
    self: 'me',
    station: 'oven',
    card: 'oakFirewood',
    deck,
    rows: [] as NightRevealEntry[],
    piles: dirtyPiles,
  };
  const bakerRoles = new Set(deck.filter((r) => onubRoles.roles[r]?.team === 'baker'));

  it('tells the truth for a Baker card: dealt role, station, card and the latest sightings', () => {
    const rows: NightRevealEntry[] = [
      { slot: 'seat.2.role', kind: 'role', value: 'inspecteur', of: 'b' },
      { slot: 'pantry.role.1', kind: 'role', value: 'chef', of: '' },
      { slot: 'seat.0.role', kind: 'role', value: 'sousChef', of: 'me' },
    ];
    for (let i = 0; i < 50; i++) {
      const c = planClaim({ ...base, role: 'chef', rows }, rng(i));
      expect(c).toMatchObject({ roleId: 'chef', stationId: 'oven', cardId: 'oakFirewood' });
      expect(c.saw).toEqual([
        { targetId: 'pantry', roleId: 'chef' },
        { targetId: 'b', roleId: 'inspecteur' },
      ]);
      expect(c.saw!.length).toBeLessThanOrEqual(onubBalance.claims.maxSaw);
    }
  });

  it('a Team Mold seat claims a Baker role of the deck at a clean station when it sabotaged', () => {
    for (let i = 0; i < 100; i++) {
      const c = planClaim({ ...base, role: 'levain', station: 'mixer', card: 'sawdust' }, rng(i));
      expect(bakerRoles.has(c.roleId)).toBe(true);
      expect(['fridge', 'oven']).toContain(c.stationId);
      expect(stationOfCard(c.cardId!)).toBe(c.stationId);
      expect(goodCards.has(c.cardId!)).toBe(true);
    }
  });

  it('the lone Spore claims the Baker role it peeked in the Pantry', () => {
    const rows: NightRevealEntry[] = [{ slot: 'pantry.role.2', kind: 'role', value: 'aboyeur', of: '' }];
    for (let i = 0; i < 30; i++) {
      expect(planClaim({ ...base, role: 'champignon', rows }, rng(i)).roleId).toBe('aboyeur');
    }
  });

  it('the Croissant claims a Baker role at a station whose pile holds sabotage, with a sabotage card', () => {
    for (let i = 0; i < 60; i++) {
      const c = planClaim({ ...base, role: 'croissant', card: 'time', station: 'proofing' }, rng(i));
      expect(bakerRoles.has(c.roleId)).toBe(true);
      expect(['mixer', 'proofing']).toContain(c.stationId);
      expect(goodCards.has(c.cardId!)).toBe(false);
      expect(stationOfCard(c.cardId!)).toBe(c.stationId);
    }
  });

  it('draws four values for every role', () => {
    for (const role of ['chef', 'champignon', 'croissant', 'levain']) {
      const s = counted(9);
      planClaim({ ...base, role }, s.rng);
      expect(s.draws()).toBe(4);
    }
  });
});

describe('planVote', () => {
  const others = ['a', 'b', 'c', 'd'];
  const piles: PileFacts = { oven: { cards: ['wetWood'], net: 2 }, fridge: { cards: ['pureDairy'], net: 0 } };
  const base = {
    self: 'me',
    others,
    mates: new Set<string>(),
    rows: [] as NightRevealEntry[],
    claims: [],
    piles,
  };

  it('votes for a seat its own peek showed holding a Team Mold card', () => {
    const rows: NightRevealEntry[] = [{ slot: 'seat.2.role', kind: 'role', value: 'ratDeCave', of: 'c' }];
    for (let i = 0; i < 40; i++) expect(planVote({ ...base, rows }, rng(i), 1)).toBe('c');
  });

  it('else a seat whose claimed station has net sabotage, never a known teammate', () => {
    const claims = [
      { from: 'a', stationId: 'oven' },
      { from: 'b', stationId: 'fridge' },
      { from: 'd', stationId: 'oven' },
    ];
    const seen = new Set<string>();
    for (let i = 0; i < 80; i++) seen.add(planVote({ ...base, claims, mates: new Set(['d']) }, rng(i), 1)!);
    expect([...seen]).toEqual(['a']);
  });

  it('falls back to a seeded other seat: never itself, never the Pantry', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(planVote(base, rng(i), 0)!);
    expect([...seen].sort()).toEqual(others);
    expect(planVote({ ...base, others: [] }, rng(1), 1)).toBeNull();
  });

  it('smartVoteChance sets how often evidence wins', () => {
    const rows: NightRevealEntry[] = [{ slot: 'seat.2.role', kind: 'role', value: 'apprenti', of: 'c' }];
    const play = rng(10);
    let hits = 0;
    for (let i = 0; i < 4000; i++) if (planVote({ ...base, rows }, play, 0.6) === 'c') hits++;
    // 0.6 smart plus a quarter of the other 0.4.
    expect(hits / 4000).toBeGreaterThan(0.66);
    expect(hits / 4000).toBeLessThan(0.74);
  });

  it('draws three values every time', () => {
    for (const smart of [0, 1]) {
      const s = counted(11);
      planVote(base, s.rng, smart);
      expect(s.draws()).toBe(3);
    }
  });
});

describe('sightingOf', () => {
  it('names the Pantry and keeps role and station apart', () => {
    expect(sightingOf({ slot: 'pantry.loc.0', kind: 'loc', value: 'oven', of: '' })).toEqual({
      targetId: 'pantry',
      stationId: 'oven',
    });
    expect(sightingOf({ slot: 'seat.1', kind: 'mate', value: 'champignon', of: 'x' })).toEqual({
      targetId: 'x',
      roleId: 'champignon',
    });
  });
});

// --- runOnubNpc on a fake room: when each verb is sent, and that nothing is sent twice --------------------------

interface Fake {
  room: PartyRoom;
  state: {
    phase: number;
    tick: number;
    phaseEndsTick: number;
    settings: { npcSeats: number; npcDifficulty: number };
    onub: { piles: Map<string, unknown>; deck: string[]; seats: string[] };
    meeting: { claims: unknown[] };
    players: Map<string, unknown>;
  };
  player: {
    id: string;
    connected: boolean;
    hasVoted: boolean;
    priv: { role: { roleId: string }; onubLoc: string; onubCard: string; nightReveal: NightRevealEntry[] };
  };
}

function fake(role: string, seed = 1): Fake {
  const seats = ['npc', 'h1', 'h2', 'h3'];
  const player = {
    id: 'npc',
    connected: true,
    hasVoted: false,
    priv: { role: { roleId: role }, onubLoc: '', onubCard: '', nightReveal: [] as NightRevealEntry[] },
  };
  const state = {
    phase: Phase.dusk,
    tick: 1000,
    phaseEndsTick: 1000 + 60 * TICK_RATE,
    settings: { npcSeats: 3, npcDifficulty: 1 },
    onub: { piles: new Map(), deck: onubBalance.byCount['4'].deck, seats },
    meeting: { claims: [] as unknown[] },
    players: new Map<string, unknown>(
      seats.map((id) => [id, id === 'npc' ? player : { id, connected: true }]),
    ),
  };
  const room = {
    state,
    seeds: new MatchSeeds({ npcTiming: [seed, 2, 3, 4], npcPlay: [seed, 5, 6, 7] }),
  } as unknown as PartyRoom;
  const dealt = new Map(seats.map((id) => [id, id === 'npc' ? role : 'chef']));
  setOnub(room, createOnubState(seats, onubBalance.byCount['4'].deck, dealt, [], []));
  return { room, state, player };
}

const tickOnce = (f: Fake, brain: Brain): void =>
  runOnubNpc(f.room, new NpcMemory(), brain, f.player as never, { dead: false, input: {} } as never);

function runUntilCalled(f: Fake, brain: Brain, call: ReturnType<typeof vi.fn>, maxTicks: number): number {
  const t0 = f.state.tick;
  for (let i = 0; i < maxTicks && call.mock.calls.length === 0; i++) {
    tickOnce(f, brain);
    if (call.mock.calls.length === 0) f.state.tick++;
  }
  return f.state.tick - t0;
}

beforeEach(() => {
  mocks.ability.mockReset();
  mocks.claim.mockReset();
  mocks.vote.mockReset();
  mocks.view.mockReset();
});

describe('runOnubNpc: prep', () => {
  it('commits once, inside the commitS span, and stays put', () => {
    const { min, max } = onubBalance.npc.commitS;
    for (let seed = 1; seed <= 25; seed++) {
      mocks.ability.mockReset();
      const f = fake('chef', seed);
      const brain = new Brain();
      const waited = runUntilCalled(f, brain, mocks.ability, 60 * TICK_RATE);
      expect(waited).toBeGreaterThanOrEqual(min * TICK_RATE - 1);
      expect(waited).toBeLessThanOrEqual(max * TICK_RATE + 1);
      expect(mocks.ability).toHaveBeenCalledTimes(1);
      const [, id, payload] = mocks.ability.mock.calls[0] as [
        unknown,
        string,
        { abilityId: string; targets: string[] },
      ];
      expect(id).toBe('npc');
      expect(payload.abilityId).toBe(ONUB_PREP);
      expect(goodCards.has(payload.targets[1]!)).toBe(true);
      for (let i = 0; i < 100; i++) {
        f.state.tick++;
        tickOnce(f, brain);
      }
      expect(mocks.ability).toHaveBeenCalledTimes(1);
    }
  });

  it('does not commit again when the server already did (the timeout)', () => {
    const f = fake('chef');
    f.player.priv.onubLoc = 'oven';
    const brain = new Brain();
    for (let i = 0; i < 60 * TICK_RATE; i++) {
      f.state.tick++;
      tickOnce(f, brain);
    }
    expect(mocks.ability).not.toHaveBeenCalled();
  });

  it('draws the same two streams for a Baker and a Spore: only the card differs', () => {
    const baker = fake('chef', 9);
    const spore = fake('champignon', 9);
    const b1 = new Brain();
    const b2 = new Brain();
    const w1 = runUntilCalled(baker, b1, mocks.ability, 60 * TICK_RATE);
    const first = mocks.ability.mock.calls[0] as [unknown, string, { targets: string[] }];
    mocks.ability.mockReset();
    const w2 = runUntilCalled(spore, b2, mocks.ability, 60 * TICK_RATE);
    const second = mocks.ability.mock.calls[0] as [unknown, string, { targets: string[] }];
    expect(w2).toBe(w1);
    expect(second[2].targets[0]).toBe(first[2].targets[0]);
  });

  it('two seats draw from their own streams, not each other', () => {
    const a = new MatchSeeds({ npcTiming: [1, 2, 3, 4], npcPlay: [5, 6, 7, 8] });
    expect(a.get('npcTiming', 'x')()).not.toBe(a.get('npcTiming', 'y')());
    expect(a.get('npcPlay', 'x')()).not.toBe(a.get('npcTiming', 'x')());
  });
});

describe('runOnubNpc: the night', () => {
  const peek: OnubLegalAct = { act: 'onub.peekRole', picks: 1, slots: ['seat.1.role', 'seat.2.role'] };
  const swap: OnubLegalAct = { act: 'onub.laminateSwap', picks: 1, slots: ['seat.1.role', 'pantry.role.0'] };
  const wake = (legal: OnubLegalAct[], must = true): OnubWakeView => ({
    mates: [],
    seen: [],
    alone: false,
    cloche: '',
    legal,
    must,
  });
  const SECONDS = 10;

  /** Opens window `idx` now: ends `SECONDS` ahead, `wakers` awake. */
  function open(f: Fake, wakers: string[], idx = 0): void {
    const o = onubOf(f.room)!;
    f.state.phase = Phase.night;
    o.stage = 'window';
    o.windowIdx = idx;
    o.script = [{ order: idx + 1, role: 'chef', seconds: SECONDS }];
    o.wakers = wakers;
    o.stageEndsTick = f.state.tick + SECONDS * TICK_RATE;
  }

  it('a sleeper never has its wake view computed', () => {
    const f = fake('chef');
    open(f, ['h1']);
    const brain = new Brain();
    for (let i = 0; i < 400; i++) {
      f.state.tick++;
      tickOnce(f, brain);
    }
    expect(mocks.view).not.toHaveBeenCalled();
    expect(mocks.ability).not.toHaveBeenCalled();
  });

  it('a waker acts once, inside actFrac of its window', () => {
    const { min, max } = onubBalance.npc.actFrac;
    for (let seed = 1; seed <= 25; seed++) {
      mocks.ability.mockReset();
      mocks.view.mockReturnValue(wake([peek]));
      const f = fake('chef', seed);
      open(f, ['npc']);
      const brain = new Brain();
      const waited = runUntilCalled(f, brain, mocks.ability, SECONDS * TICK_RATE);
      expect(waited).toBeGreaterThanOrEqual(Math.floor(min * SECONDS * TICK_RATE) - 1);
      expect(waited).toBeLessThanOrEqual(Math.ceil(max * SECONDS * TICK_RATE) + 1);
      mocks.view.mockReturnValue(wake([]));
      for (let i = 0; i < 100; i++) {
        f.state.tick++;
        tickOnce(f, brain);
      }
      expect(mocks.ability).toHaveBeenCalledTimes(1);
      const payload = (
        mocks.ability.mock.calls[0] as [unknown, string, { abilityId: string; targets: string[] }]
      )[2];
      expect(payload.abilityId).toBe('onub.peekRole');
      expect(peek.slots).toContain(payload.targets[0]);
    }
  });

  it('follows the first step of a two-step act with the second, then stops', () => {
    const f = fake('tourrier', 3);
    open(f, ['npc']);
    mocks.view.mockReturnValue(wake([{ act: 'onub.laminatePeek', picks: 1, slots: ['pantry.role.0'] }]));
    const brain = new Brain();
    runUntilCalled(f, brain, mocks.ability, SECONDS * TICK_RATE);
    mocks.view.mockReturnValue(wake([swap]));
    let waited = 0;
    while (mocks.ability.mock.calls.length < 2 && waited < 3 * TICK_RATE) {
      f.state.tick++;
      waited++;
      tickOnce(f, brain);
    }
    expect(mocks.ability).toHaveBeenCalledTimes(2);
    expect(waited).toBeGreaterThanOrEqual(onubBalance.npc.stepS.min * TICK_RATE - 1);
    expect(waited).toBeLessThanOrEqual(onubBalance.npc.stepS.max * TICK_RATE + 1);
    expect((mocks.ability.mock.calls[1] as [unknown, string, { abilityId: string }])[2].abilityId).toBe(
      'onub.laminateSwap',
    );
    mocks.view.mockReturnValue(wake([]));
    for (let i = 0; i < 100; i++) {
      f.state.tick++;
      tickOnce(f, brain);
    }
    expect(mocks.ability).toHaveBeenCalledTimes(2);
  });

  it('acts again in the next window it is woken for', () => {
    mocks.view.mockReturnValue(wake([peek]));
    const f = fake('chef', 4);
    open(f, ['npc']);
    const brain = new Brain();
    runUntilCalled(f, brain, mocks.ability, SECONDS * TICK_RATE);
    f.state.tick += 2 * TICK_RATE;
    open(f, ['npc'], 1);
    mocks.view.mockReturnValue(wake([peek]));
    let sends = mocks.ability.mock.calls.length;
    for (let i = 0; i < SECONDS * TICK_RATE; i++) {
      f.state.tick++;
      tickOnce(f, brain);
    }
    sends = mocks.ability.mock.calls.length - sends;
    expect(sends).toBeGreaterThanOrEqual(1);
  });

  it('may leave an optional act undone, and a must-act never', () => {
    let skipped = 0;
    for (let seed = 1; seed <= 60; seed++) {
      mocks.ability.mockReset();
      mocks.view.mockReturnValue(wake([peek], false));
      const f = fake('chef', seed);
      open(f, ['npc']);
      const brain = new Brain();
      for (let i = 0; i < SECONDS * TICK_RATE; i++) {
        f.state.tick++;
        tickOnce(f, brain);
      }
      if (mocks.ability.mock.calls.length === 0) skipped++;
    }
    expect(skipped).toBeGreaterThan(10);
    expect(skipped).toBeLessThan(40);
  });
});

describe('runOnubNpc: the morning', () => {
  const RUSH = 300 * TICK_RATE;
  const CRUST = onubBalance.timers.voteS * TICK_RATE;

  function morning(role: string, seed: number): { f: Fake; brain: Brain } {
    const f = fake(role, seed);
    f.state.phase = Phase.meetingDiscussion;
    f.state.phaseEndsTick = f.state.tick + RUSH;
    f.player.priv.onubLoc = 'oven';
    f.player.priv.onubCard = 'oakFirewood';
    return { f, brain: new Brain() };
  }

  it('posts one claim inside claimFrac of the Rush', () => {
    const { min, max } = onubBalance.npc.claimFrac;
    for (let seed = 1; seed <= 25; seed++) {
      mocks.claim.mockReset();
      const { f, brain } = morning('chef', seed);
      const waited = runUntilCalled(f, brain, mocks.claim, RUSH);
      expect(waited).toBeGreaterThanOrEqual(Math.floor(min * RUSH) - 1);
      expect(waited).toBeLessThanOrEqual(Math.ceil(max * RUSH) + 1);
      for (let i = 0; i < 200; i++) {
        f.state.tick++;
        tickOnce(f, brain);
      }
      expect(mocks.claim).toHaveBeenCalledTimes(1);
      const claim = (
        mocks.claim.mock.calls[0] as [unknown, string, { roleId: string; stationId: string }]
      )[2];
      expect(claim).toMatchObject({ roleId: 'chef', stationId: 'oven' });
    }
  });

  it('votes once inside voteFrac of the Rush plus CRUST, for another seat', () => {
    const { min, max } = onubBalance.npc.voteFrac;
    const targets = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      mocks.vote.mockReset();
      const { f, brain } = morning('chef', seed);
      const waited = runUntilCalled(f, brain, mocks.vote, RUSH);
      expect(waited).toBeGreaterThanOrEqual(Math.floor(min * (RUSH + CRUST)) - 1);
      expect(waited).toBeLessThanOrEqual(Math.ceil(max * (RUSH + CRUST)) + 1);
      for (let i = 0; i < 200; i++) {
        f.state.tick++;
        tickOnce(f, brain);
      }
      expect(mocks.vote).toHaveBeenCalledTimes(1);
      const target = (mocks.vote.mock.calls[0] as [unknown, string, { targetId: string }])[2].targetId;
      expect(['h1', 'h2', 'h3']).toContain(target);
      targets.add(target);
    }
    expect(targets.size).toBe(3);
  });

  it('a new Brain (a new role card) starts the match over', () => {
    const { f } = morning('chef', 5);
    const first = new Brain();
    runUntilCalled(f, first, mocks.vote, RUSH);
    expect(mocks.vote).toHaveBeenCalledTimes(1);
    f.state.phaseEndsTick = f.state.tick + RUSH;
    const second = new Brain();
    runUntilCalled(f, second, mocks.vote, 1);
    f.state.tick++;
    for (let i = 0; i < RUSH && mocks.vote.mock.calls.length < 2; i++) {
      f.state.tick++;
      tickOnce(f, second);
    }
    expect(mocks.vote).toHaveBeenCalledTimes(2);
  });
});
