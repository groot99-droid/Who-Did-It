import { describe, expect, it } from 'vitest';
import { onubBalance } from '@wdi/content';
import { type NightRevealEntry, ONUB_PREP, Phase, TICK_RATE, type OnubWakeView } from '@wdi/shared';
import {
  PACES,
  QuickPlayer,
  type QuickState,
  followUp,
  planBotVote,
  planClaimOf,
  planCommit,
  planNightAct,
  revealLeak,
  ruinReport,
  ruinSample,
  wakeLeak,
  windowRoles,
} from '../quick';
import { mulberry } from '../walk';

const { stations } = onubBalance;
const goods = new Set(stations.flatMap((s) => s.good));

describe('planCommit', () => {
  it('plays a sabotage card only for a sabotaging card, with the given chance', () => {
    const rng = mulberry(1);
    let dirty = 0;
    for (let i = 0; i < 3000; i++) if (!goods.has(planCommit(rng, true, 0.6).card)) dirty++;
    expect(dirty / 3000).toBeGreaterThan(0.55);
    expect(dirty / 3000).toBeLessThan(0.65);
    for (let i = 0; i < 300; i++) expect(goods.has(planCommit(rng, false, 1).card)).toBe(true);
    for (let i = 0; i < 100; i++) expect(goods.has(planCommit(rng, true, 0).card)).toBe(true);
  });

  it('names a card of the station it chose', () => {
    const rng = mulberry(2);
    for (let i = 0; i < 200; i++) {
      const c = planCommit(rng, true, 0.5);
      const s = stations.find((x) => x.id === c.station)!;
      expect([...s.good, ...s.sabotage]).toContain(c.card);
    }
  });
});

describe('planNightAct', () => {
  const peek = {
    act: 'onub.peekPantry',
    picks: 2,
    slots: ['pantry.role.0', 'pantry.role.1', 'pantry.role.2'],
  };
  it('picks distinct slots of the pool, and never skips a must-act', () => {
    const rng = mulberry(3);
    for (let i = 0; i < 200; i++) {
      const plan = planNightAct({ legal: [peek], must: true }, rng)!;
      expect(new Set(plan.targets).size).toBe(2);
      for (const t of plan.targets) expect(peek.slots).toContain(t);
    }
  });
  it('may skip an optional act, and does nothing without a legal act', () => {
    const rng = mulberry(4);
    let none = 0;
    for (let i = 0; i < 600; i++) if (planNightAct({ legal: [peek], must: false }, rng) === null) none++;
    expect(none / 600).toBeGreaterThan(0.4);
    expect(none / 600).toBeLessThan(0.6);
    expect(planNightAct({ legal: [], must: false }, rng)).toBeNull();
  });
});

describe('followUp', () => {
  it('rebuilds the Tourrier swap over every Role card but the cloche', () => {
    const f = followUp('onub.laminatePeek', ['a', 'b', 'c'], 'seat.1.role')!;
    expect(f).toEqual({ act: 'onub.laminateSwap', picks: 1, slots: ['seat.0.role', 'seat.2.role'] });
    expect(followUp('onub.peekRole', ['a'], '')).toBeNull();
  });
});

describe('planClaimOf', () => {
  it('claims the dealt role, station and card with the latest sightings of other seats first', () => {
    const rows: NightRevealEntry[] = [
      { slot: 'seat.1.role', kind: 'role', value: 'chef', of: 'b' },
      { slot: 'pantry.role.0', kind: 'role', value: 'croissant', of: '' },
      { slot: 'seat.0.role', kind: 'role', value: 'sousChef', of: 'me' },
    ];
    const c = planClaimOf('me', 'sousChef', { station: 'oven', card: 'oakFirewood' }, rows);
    expect(c).toEqual({
      roleId: 'sousChef',
      stationId: 'oven',
      cardId: 'oakFirewood',
      saw: [
        { targetId: 'pantry', roleId: 'croissant' },
        { targetId: 'b', roleId: 'chef' },
      ],
    });
  });
  it('leaves the parts it does not have out', () => {
    expect(planClaimOf('me', 'croissant', null, [])).toEqual({ roleId: 'croissant' });
  });
});

describe('planBotVote', () => {
  const base = { self: 'me', others: ['a', 'b', 'c'], rows: [] as NightRevealEntry[], claims: [], piles: {} };
  it('is never itself and never Skip; the Pantry only by its chance', () => {
    const rng = mulberry(5);
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) seen.add(planBotVote(base, rng, 0, 0)!);
    expect([...seen].sort()).toEqual(['a', 'b', 'c']);
    expect(planBotVote(base, mulberry(6), 0, 1)).toBe('pantry');
    expect(planBotVote({ ...base, others: [] }, mulberry(7), 1, 0)).toBeNull();
  });
  it('follows its own peek of a Team Mold card, then a claimed dirty station', () => {
    const rows: NightRevealEntry[] = [{ slot: 'seat.1.role', kind: 'role', value: 'levain', of: 'b' }];
    expect(planBotVote({ ...base, rows }, mulberry(8), 1, 0)).toBe('b');
    const claims = [{ from: 'c', stationId: 'oven' }];
    expect(planBotVote({ ...base, claims, piles: { oven: { net: 2 } } }, mulberry(9), 1, 0)).toBe('c');
  });
});

describe('the leak monitor', () => {
  const windows = windowRoles(onubBalance.byCount['6'].deck);
  it('knows which roles have a window in the deck', () => {
    expect(windows.has('chef')).toBe(true);
    expect(windows.has('boulanger')).toBe(false);
    expect(windows.has('croissant')).toBe(false);
  });
  it('flags a nightWake for another role than the dealt one', () => {
    expect(wakeLeak('chef', 'chef')).toBe(false);
    expect(wakeLeak('croissant', 'chef')).toBe(true);
  });
  it('flags a nightReveal to a sleeper, except the proofing perk', () => {
    const row: NightRevealEntry = { slot: 'seat.1.role', kind: 'role', value: 'chef', of: 'b' };
    const perk: NightRevealEntry = { slot: 'pantry.loc.1', kind: 'loc', value: 'oven', of: '' };
    expect(revealLeak([row], 'chef', 'oven', windows)).toBe(false);
    expect(revealLeak([row], 'croissant', 'oven', windows)).toBe(true);
    expect(revealLeak([perk], 'croissant', 'proofing', windows)).toBe(false);
    expect(revealLeak([perk], 'croissant', 'oven', windows)).toBe(true);
    expect(revealLeak([], 'croissant', 'oven', windows)).toBe(false);
  });
});

// --- QuickPlayer over a fake room -----------------------------------------------------------------------------

function harness(role: string, seed = 1) {
  const sent: { type: string; payload: unknown }[] = [];
  const seats = ['me', 'b', 'c', 'd'];
  const me = {
    id: 'me',
    connected: true,
    hasVoted: false,
    priv: { onubLoc: '', onubCard: '', nightReveal: [] as NightRevealEntry[] },
  };
  const players = new Map<string, typeof me | { id: string; connected: boolean; hasVoted: boolean }>([
    ['me', me],
    ...seats.slice(1).map((id) => [id, { id, connected: true, hasVoted: false }] as const),
  ]);
  const state = {
    phase: Phase.dusk as number,
    tick: 100,
    phaseEndsTick: 100 + 60 * TICK_RATE,
    players,
    onub: { seats, deck: onubBalance.byCount['4'].deck, piles: new Map<string, { net: number }>() },
    meeting: { claims: [] as { from: string; stationId: string }[] },
  };
  const player = new QuickPlayer(
    { send: (type, payload) => sent.push({ type, payload }) },
    () => 'me',
    mulberry(seed),
    {
      pace: 'human',
    },
  );
  player.onCard(role);
  const tick = () => player.tick(state as unknown as QuickState);
  return { sent, me, state, player, tick };
}

describe('QuickPlayer', () => {
  it('commits once, inside the commitS span', () => {
    const { min, max } = PACES.human.commitS;
    for (let seed = 1; seed <= 15; seed++) {
      const h = harness('chef', seed);
      let waited = 0;
      while (h.sent.length === 0 && waited < 60 * TICK_RATE) {
        h.tick();
        if (h.sent.length === 0) h.state.tick++;
        waited++;
      }
      expect(waited).toBeGreaterThanOrEqual(min * TICK_RATE - 1);
      expect(waited).toBeLessThanOrEqual(max * TICK_RATE + 1);
      for (let i = 0; i < 100; i++) {
        h.state.tick++;
        h.tick();
      }
      expect(h.sent).toHaveLength(1);
      expect(h.sent[0]!.type).toBe('act.ability');
      expect((h.sent[0]!.payload as { abilityId: string }).abilityId).toBe(ONUB_PREP);
    }
  });

  it('acts in its window once, from the view it was sent, and counts a wake', () => {
    const h = harness('chef', 2);
    h.state.phase = Phase.night;
    const view: OnubWakeView = {
      mates: [],
      seen: [],
      alone: false,
      cloche: '',
      must: true,
      legal: [{ act: 'onub.peekRole', picks: 1, slots: ['seat.1.role', 'seat.2.role'] }],
    };
    h.player.onWake({ windowRole: 'chef', endsTick: h.state.tick + 12 * TICK_RATE, view }, h.state.tick);
    for (let i = 0; i < 14 * TICK_RATE; i++) {
      h.state.tick++;
      h.tick();
    }
    expect(h.player.stats.wakes).toBe(1);
    expect(h.sent).toHaveLength(1);
    expect((h.sent[0]!.payload as { abilityId: string }).abilityId).toBe('onub.peekRole');
    expect(h.player.stats.nightLeaks).toBe(0);
  });

  it('plays both steps of the Tourrier', () => {
    const h = harness('tourrier', 3);
    h.state.phase = Phase.night;
    const view: OnubWakeView = {
      mates: [],
      seen: [],
      alone: false,
      cloche: '',
      must: true,
      legal: [{ act: 'onub.laminatePeek', picks: 1, slots: ['pantry.role.0'] }],
    };
    h.player.onWake({ windowRole: 'tourrier', endsTick: h.state.tick + 14 * TICK_RATE, view }, h.state.tick);
    for (let i = 0; i < 14 * TICK_RATE; i++) {
      h.state.tick++;
      h.tick();
    }
    expect(h.sent.map((m) => (m.payload as { abilityId: string }).abilityId)).toEqual([
      'onub.laminatePeek',
      'onub.laminateSwap',
    ]);
  });

  it('counts a nightWake for another role, a sleeper reveal and a presence as leaks', () => {
    const h = harness('croissant', 4);
    h.player.onWake(
      {
        windowRole: 'chef',
        endsTick: 1,
        view: { mates: [], seen: [], alone: false, cloche: '', must: false, legal: [] },
      },
      0,
    );
    h.player.onReveal([{ slot: 'seat.1.role', kind: 'role', value: 'chef', of: 'b' }]);
    expect(h.player.stats.nightLeaks).toBe(2);
    (h.state.players.get('b') as { presence?: unknown }).presence = { x: 1, y: 2 };
    h.tick();
    expect(h.player.stats.nightLeaks).toBe(3);
    // The seat's own all-zero default presence (its own view) is not a leak.
    delete (h.state.players.get('b') as { presence?: unknown }).presence;
    (h.state.players.get('me') as { presence?: unknown }).presence = { x: 0, y: 0 };
    h.tick();
    expect(h.player.stats.nightLeaks).toBe(3);
  });

  it('claims once and votes once in the Rush, for another seat', () => {
    const h = harness('chef', 5);
    h.state.phase = Phase.meetingDiscussion;
    h.state.phaseEndsTick = h.state.tick + 300 * TICK_RATE;
    h.me.priv.onubLoc = 'oven';
    h.me.priv.onubCard = 'oakFirewood';
    for (let i = 0; i < 300 * TICK_RATE; i++) {
      h.state.tick++;
      h.tick();
      if (h.sent.some((m) => m.type === 'meeting.vote')) h.me.hasVoted = true;
      if (h.sent.some((m) => m.type === 'meeting.claim') && h.state.meeting.claims.length === 0)
        h.state.meeting.claims.push({ from: h.me.id, stationId: 'oven' });
    }
    const claims = h.sent.filter((m) => m.type === 'meeting.claim');
    const votes = h.sent.filter((m) => m.type === 'meeting.vote');
    expect(claims).toHaveLength(1);
    expect(claims[0]!.payload).toMatchObject({ roleId: 'chef', stationId: 'oven', cardId: 'oakFirewood' });
    expect(votes).toHaveLength(1);
    expect(['b', 'c', 'd', 'pantry']).toContain((votes[0]!.payload as { targetId: string }).targetId);
  });

  it('resends a claim without its sightings once when the board still lacks it', () => {
    const h = harness('chef', 5);
    h.state.phase = Phase.meetingDiscussion;
    h.state.phaseEndsTick = h.state.tick + 300 * TICK_RATE;
    for (let i = 0; i < 300 * TICK_RATE; i++) {
      h.state.tick++;
      h.tick();
    }
    const claims = h.sent.filter((m) => m.type === 'meeting.claim');
    expect(claims).toHaveLength(2);
    expect(claims[1]!.payload).not.toHaveProperty('saw');
  });

  it('starts a new match at the lobby', () => {
    const h = harness('chef', 6);
    for (let i = 0; i < 50 * TICK_RATE; i++) {
      h.state.tick++;
      h.tick();
    }
    expect(h.sent).toHaveLength(1);
    h.state.phase = Phase.lobby;
    h.tick();
    h.state.phase = Phase.dusk;
    h.player.onCard('chef');
    for (let i = 0; i < 50 * TICK_RATE; i++) {
      h.state.tick++;
      h.tick();
    }
    expect(h.sent).toHaveLength(2);
  });
});

describe('the ruin report', () => {
  const dealt = (roles: string[]) => Object.fromEntries(roles.map((r, i) => [`s${i}`, r]));
  it('reads the size, the ruin and whether a Team Mold card was dealt from gameOver.onub', () => {
    expect(
      ruinSample({ dealt: dealt(['chef', 'champignon', 'inspecteur', 'aboyeur']), ruined: true }),
    ).toEqual({
      size: 4,
      ruined: true,
      mold: true,
    });
    expect(ruinSample({ dealt: dealt(['chef', 'inspecteur']), ruined: false }).mold).toBe(false);
  });
  it('tabulates the rate per size against the 20-30% target', () => {
    const samples = [
      ...Array.from({ length: 10 }, (_, i) => ({ size: 5, ruined: i < 2, mold: true })),
      ...Array.from({ length: 10 }, (_, i) => ({ size: 7, ruined: i < 7, mold: true })),
      { size: 9, ruined: false, mold: false },
    ];
    const lines = ruinReport(samples);
    expect(lines[0]).toContain('players');
    expect(lines[1]).toContain('in range');
    expect(lines[2]).toContain('above');
    expect(lines[3]).toContain('no Mold card dealt');
  });
});
