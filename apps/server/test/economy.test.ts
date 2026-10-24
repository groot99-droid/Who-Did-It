import type { ColyseusTestServer } from '@colyseus/testing';
import { balance, economy, looks, roles } from '@wdi/content';
import { C2S, Phase } from '@wdi/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PartyRoom } from '../src/rooms/PartyRoom';
import { runInvariants } from '../src/sim/auto/invariants';
import {
  TOWN,
  balanceOf,
  bankAccount,
  dealPurses,
  movePurse,
  purseBand,
  scripConserved,
  stakeFor,
} from '../src/sim/economy/purse';
import { pendingSim } from '../src/sim/events/bus';
import { MatchSeeds, type SeedWords } from '../src/sim/seeds';
import { bootFlowServer, until } from './flowHelpers';
import { fixSeeds } from './seedHelpers';
import { type Bot, opts, sleep, stateOf } from './simHelpers';

// Round 8, Session 8C (GDD 3.23; docs/round8/economy.md 2 and 5): the purse, the stake and `movePurse`.

const WORDS: SeedWords = [0x5c219, 0x2468ace0, 0x13579bdf, 0x0ddba11];

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootFlowServer()));
afterAll(async () => release());

/** A party of `n` that Started through the lobby and is out of the role card. */
async function played(n: number, words?: SeedWords): Promise<{ room: PartyRoom; bots: Bot[] }> {
  const leader = await colyseus.sdk.create('party', opts('Bot0'));
  const rooms = [leader];
  for (let i = 1; i < n; i++) rooms.push(await colyseus.sdk.joinById(leader.roomId, opts(`Bot${i}`)));
  const bots = rooms.map((room) => ({ room, id: room.sessionId, events: [] }));
  const room = colyseus.getRoomById(leader.roomId) as unknown as PartyRoom;
  if (words) fixSeeds(room, { purse: words });
  leader.send(C2S.lobbyStart, {});
  expect(await until(() => room.state.phase === Phase.roleReveal)).toBe(true);
  room.state.phaseEndsTick = room.state.tick;
  expect(await until(() => room.state.phase === Phase.grace)).toBe(true);
  await sleep(150);
  return { room, bots };
}

const failing = (room: PartyRoom, name: string) => runInvariants(room).filter((f) => f.name === name);

/** The parts of a room `movePurse` reads, with seats `s0..` holding private state. */
function fakeRoom(n: number, fixed?: SeedWords): PartyRoom {
  const players = new Map(
    Array.from({ length: n }, (_, i) => [`s${i}`, { look: '', priv: { purse: 0, bank: 0 } }]),
  );
  return {
    seeds: new MatchSeeds(fixed && { purse: fixed }),
    state: { tick: 1, phase: Phase.day, players },
  } as unknown as PartyRoom;
}

describe('economy.json stakes', () => {
  it('names real looks, never a cover card, and keeps each tier on one side of the heavy purse', () => {
    const covers = Object.values(roles.roles)
      .filter((r) => r.cover)
      .map((r) => r.look);
    for (const [look, tier] of Object.entries(economy.stakes.byLook)) {
      expect(looks.looks[look]).toBeDefined();
      expect(covers).not.toContain(look);
      expect(economy.stakes.tiers[tier]).toBeDefined();
    }
    const heavy = balance.economy.heavyPurse;
    const bands = Object.values(economy.stakes.tiers).map((t) => [t.min >= heavy, t.max >= heavy]);
    for (const [lo, hi] of bands) expect(lo).toBe(hi);
    // Two bands at most, both in use: the light and the heavy purse.
    expect(new Set(bands.map(([lo]) => lo)).size).toBe(2);
  });
});

describe('the stake', () => {
  it('is drawn at Start per seat on its own stream, and its look picks the tier', () => {
    const drawn = (words: SeedWords) => {
      const room = fakeRoom(3, words);
      dealPurses(room);
      return ['s0', 's1', 's2'].map((s) => room.seeds.get('purse', s)());
    };
    // The same words give the same draws: the next number of each seat's stream matches too.
    expect(drawn(WORDS)).toEqual(drawn(WORDS));
    for (const [look, tierId] of Object.entries(economy.stakes.byLook)) {
      const tier = economy.stakes.tiers[tierId]!;
      expect(stakeFor(look, 0)).toBe(tier.min);
      expect(stakeFor(look, 0.999999)).toBe(tier.max);
    }
    // A seat with no look (a figure with no character) takes the default tier.
    expect(stakeFor('', 0)).toBe(economy.stakes.tiers[economy.stakes.default]!.min);
  });

  it('is paid once the looks are public, to every seat, and only its owner sees it', async () => {
    const { room, bots } = await played(5, WORDS);
    for (const [seat, player] of room.state.players) {
      const tier = economy.stakes.byLook[player.look] ?? economy.stakes.default;
      const t = economy.stakes.tiers[tier]!;
      expect(player.priv.purse).toBeGreaterThanOrEqual(t.min);
      expect(player.priv.purse).toBeLessThanOrEqual(t.max);
      expect(player.priv.bank).toBe(0);
      expect(purseBand(room, seat)).toBe(t.min >= balance.economy.heavyPurse ? 'heavy' : 'light');
    }
    await sleep(200);
    for (const bot of bots) {
      const state = stateOf(bot);
      expect(state.players.get(bot.id)?.priv.purse).toBe(room.state.players.get(bot.id)?.priv.purse);
      for (const other of bots) if (other !== bot) expect(state.players.get(other.id)?.priv).toBeUndefined();
    }
    expect(failing(room, 'scripConserved')).toEqual([]);
    expect(failing(room, 'privLeak')).toEqual([]);
    // Paid once: a later tick pays nothing more.
    const before = [...room.state.players.values()].map((p) => p.priv.purse);
    await sleep(200);
    expect([...room.state.players.values()].map((p) => p.priv.purse)).toEqual(before);
  });
});

describe('movePurse', () => {
  it('mints only stakes, wages, sales and fences, and burns only spending', () => {
    const room = fakeRoom(2);
    expect(movePurse(room, TOWN, 's0', 10, 'wage')).toBe(10);
    expect(movePurse(room, TOWN, 's0', 10, 'theft')).toBe(0);
    expect(scripConserved(room)?.detail).toMatch(/refused/);
    const clean = fakeRoom(2);
    movePurse(clean, TOWN, 's0', 10, 'stake');
    expect(movePurse(clean, 's0', TOWN, 3, 'buy')).toBe(3);
    expect(balanceOf(clean, 's0')).toBe(7);
    expect(scripConserved(clean)).toBeNull();
  });

  it('never moves more than the holder has, and sends `purse` for each seat it touches', () => {
    const room = fakeRoom(2);
    movePurse(room, TOWN, 's0', 5, 'stake');
    const seen = pendingSim(room).length;
    expect(movePurse(room, 's0', 's1', 9, 'theft')).toBe(5);
    expect(
      pendingSim(room)
        .slice(seen)
        .map((e) => e.data),
    ).toEqual([
      { seat: 's0', delta: -5, reason: 'theft' },
      { seat: 's1', delta: 5, reason: 'theft' },
    ]);
    expect(movePurse(room, 's0', 's1', 1, 'theft')).toBe(0);
    expect(movePurse(room, 's1', 's1', 1, 'theft')).toBe(0);
    expect(movePurse(room, 's1', 'nobody', 1, 'theft')).toBe(0);
  });

  it('keeps the bank, the ground and other accounts in the total', () => {
    const room = fakeRoom(2);
    movePurse(room, TOWN, 's0', 20, 'stake');
    expect(movePurse(room, 's0', bankAccount('s0'), 8, 'bank')).toBe(8);
    expect(movePurse(room, 's0', '@coins:n1', 4, 'drop')).toBe(4);
    expect(movePurse(room, '@coins:n1', 's1', 4, 'pickup')).toBe(4);
    const priv = room.state.players.get('s0')!.priv;
    expect([priv.purse, priv.bank, balanceOf(room, '@coins:n1')]).toEqual([8, 8, 0]);
    expect(scripConserved(room)).toBeNull();
  });

  it('catches a purse written outside movePurse', () => {
    const room = fakeRoom(2);
    movePurse(room, TOWN, 's0', 6, 'stake');
    room.state.players.get('s1')!.priv.purse = 3;
    expect(scripConserved(room)?.detail).toMatch(/s1 holds 3\/0/);
  });
});
