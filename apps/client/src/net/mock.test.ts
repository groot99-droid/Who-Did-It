import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import balanceJson from '@wdi/content/data/balance.json';
import { MockNetwork } from './mock';
import type { LobbySnapshot } from './NetworkService';

const { difficultyMinNpcs, defaultDifficulty } = balanceJson.npc;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function lobby(net: MockNetwork): Promise<LobbySnapshot> {
  await net.create('Hana');
  vi.advanceTimersByTime(5000);
  const snapshot = net.snapshot;
  if (snapshot === null) throw new Error('no lobby');
  return snapshot;
}

describe('MockNetwork lobby settings', () => {
  it('starts with the default level and no NPC seats', async () => {
    const snap = await lobby(new MockNetwork());
    expect(snap.settings).toEqual({
      npcDifficulty: defaultDifficulty,
      npcSeats: 0,
      map: 'hollowmere',
    });
  });

  it('addNpc and removeNpc change the roster and the count; remove drops the newest seat', async () => {
    const net = new MockNetwork();
    const before = (await lobby(net)).players.length;
    net.addNpc();
    net.addNpc();
    const added = net.snapshot?.players.slice(before).map((p) => p.id) ?? [];
    expect(net.snapshot?.settings.npcSeats).toBe(2);
    net.removeNpc();
    expect(net.snapshot?.settings.npcSeats).toBe(1);
    expect(net.snapshot?.players.map((p) => p.id)).toEqual(expect.arrayContaining([added[0]]));
    expect(net.snapshot?.players.map((p) => p.id)).not.toContain(added[1]);
    net.removeNpc();
    net.removeNpc();
    expect(net.snapshot?.players).toHaveLength(before);
    expect(net.snapshot?.settings.npcSeats).toBe(0);
  });

  it('refuses an NPC seat when the party is full', async () => {
    const net = new MockNetwork();
    await lobby(net);
    for (let i = 0; i < 12; i++) net.addNpc();
    expect(net.snapshot?.players).toHaveLength(balanceJson.players.max);
  });

  it('accepts a difficulty only with enough NPC seats', async () => {
    const net = new MockNetwork();
    await lobby(net);
    net.setNpcDifficulty('hard');
    expect(net.snapshot?.settings.npcDifficulty).toBe(defaultDifficulty);
    for (let i = 0; i < difficultyMinNpcs; i++) net.addNpc();
    net.setNpcDifficulty('hard');
    expect(net.snapshot?.settings.npcDifficulty).toBe('hard');
  });

  it('only the leader changes settings', async () => {
    const net = new MockNetwork();
    await net.join('K7M2P', 'Gus');
    vi.advanceTimersByTime(5000);
    net.addNpc();
    net.setMap('blackpine');
    expect(net.snapshot?.settings).toEqual({
      npcDifficulty: defaultDifficulty,
      npcSeats: 0,
      map: 'hollowmere',
    });
  });

  it('keeps the map the leader picks and announces it', async () => {
    const net = new MockNetwork();
    await lobby(net);
    const seen: string[] = [];
    net.bus.on('lobby', (s) => seen.push(s.settings.map));
    net.setMap('blackpine');
    expect(net.snapshot?.settings.map).toBe('blackpine');
    expect(seen).toEqual(['blackpine']);
  });
});

describe('MockNetwork Start', () => {
  it('deals the main-mode card', async () => {
    const main = new MockNetwork();
    await lobby(main);
    main.send('lobby.start', {});
    vi.advanceTimersByTime(1000);
    expect(main.roleCard?.roleId).toBe('killer');
  });
});
