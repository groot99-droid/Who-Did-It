import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { balance, deckFor } from '@wdi/content';
import { C2S, ErrorCode, MAX_PLAYERS, NpcLevel, Phase, S2C, type RoleRevealPayload } from '@wdi/shared';
import { flowOf } from '../src/sim/Flow';
import { resetToLobby } from '../src/sim/Win';
import { flatten } from './killHelpers';
import { simOf } from '../src/sim/RoomSim';
import { until } from './flowHelpers';
import { bootNpcServer, errors, join, lobbyOf, npcSeats, send, start, stateOf, toWorld } from './npcHelpers';
import { sleep } from './simHelpers';

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => {
  ({ colyseus, release } = await bootNpcServer());
});
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

describe('NPC fill at Start (GDD 3.12)', () => {
  it('1 human + 3 NPCs starts and deals the 4-player deck', async () => {
    const party = await lobbyOf(colyseus, 1);
    expect(party.room.state.players.size).toBe(1);
    await start(party);
    expect(party.room.state.players.size).toBe(balance.players.min);
    expect(party.room.state.settings.npcSeats).toBe(balance.players.min - 1);
    expect(npcSeats(party.room)).toHaveLength(3);
    const dealt = [...party.room.state.players.values()].map((p) => p.priv.role.roleId).sort();
    expect([...dealt, ...flowOf(party.room).undealt].sort()).toEqual([...deckFor(4).cards].sort());
    const cards = party.humans[0]?.log.filter((m) => m.type === S2C.roleReveal) ?? [];
    expect(cards).toHaveLength(1);
    expect((cards[0]?.payload as RoleRevealPayload).teammates.length).toBeLessThanOrEqual(0);
  });

  it('leaves a party of 5 humans without NPC seats', async () => {
    const party = await lobbyOf(colyseus, 5);
    await start(party);
    expect(party.room.state.players.size).toBe(5);
    expect(party.room.state.settings.npcSeats).toBe(0);
  });

  it('gives NPC seats a connected, human-shaped row and names from the pool', async () => {
    const party = await lobbyOf(colyseus, 1);
    await send(party.humans[0]!, C2S.lobbyAddNpc);
    const [npc] = npcSeats(party.room);
    expect(npc?.connected).toBe(true);
    expect(npc?.ready).toBe(true);
    expect(npc?.name.length).toBeGreaterThanOrEqual(2);
    expect(npc?.id).not.toBe(party.room.state.leaderId);
    expect(party.room.state.leaderId).toBe(party.humans[0]?.id);
  });
});

describe('lobby.addNpc and lobby.removeNpc', () => {
  it('adds up to players.max, removes down to none, then refuses with 422', async () => {
    const party = await lobbyOf(colyseus, 1);
    const leader = party.humans[0]!;
    for (let i = 0; i < MAX_PLAYERS - 1; i++) await send(leader, C2S.lobbyAddNpc, {}, 60);
    await sleep(100);
    expect(party.room.state.players.size).toBe(MAX_PLAYERS);
    expect(party.room.state.settings.npcSeats).toBe(MAX_PLAYERS - 1);
    expect(new Set([...party.room.state.players.values()].map((p) => p.name.toLowerCase())).size).toBe(
      MAX_PLAYERS,
    );
    expect(errors(leader)).toEqual([]);
    await send(leader, C2S.lobbyAddNpc);
    expect(errors(leader)).toEqual([ErrorCode.cannot]);

    for (let i = 0; i < MAX_PLAYERS - 1; i++) await send(leader, C2S.lobbyRemoveNpc, {}, 60);
    await sleep(100);
    expect(party.room.state.players.size).toBe(1);
    expect(party.room.state.settings.npcSeats).toBe(0);
    await send(leader, C2S.lobbyRemoveNpc);
    expect(errors(leader)).toEqual([ErrorCode.cannot, ErrorCode.cannot]);
  });

  it('removes the most recently added seat', async () => {
    const party = await lobbyOf(colyseus, 1);
    const leader = party.humans[0]!;
    await send(leader, C2S.lobbyAddNpc, {}, 60);
    await send(leader, C2S.lobbyAddNpc, {}, 60);
    const [first, second] = npcSeats(party.room);
    await send(leader, C2S.lobbyRemoveNpc);
    expect(party.room.state.players.has(first?.id ?? '')).toBe(true);
    expect(party.room.state.players.has(second?.id ?? '')).toBe(false);
  });

  it('refuses a non-leader with 422 and outside the lobby with 425', async () => {
    const party = await lobbyOf(colyseus, 2);
    const guest = party.humans[1]!;
    await send(guest, C2S.lobbyAddNpc);
    await send(guest, C2S.lobbyRemoveNpc);
    expect(errors(guest)).toEqual([ErrorCode.cannot, ErrorCode.cannot]);
    expect(party.room.state.settings.npcSeats).toBe(0);
    await start(party);
    const leader = party.humans[0]!;
    await send(leader, C2S.lobbyAddNpc);
    await send(leader, C2S.lobbyRemoveNpc);
    expect(errors(leader)).toEqual([ErrorCode.wrongPhase, ErrorCode.wrongPhase]);
  });

  it('lets a human joining a full party take an NPC seat', async () => {
    const party = await lobbyOf(colyseus, 1);
    const leader = party.humans[0]!;
    for (let i = 0; i < MAX_PLAYERS - 1; i++) await send(leader, C2S.lobbyAddNpc, {}, 60);
    await sleep(100);
    const newest = npcSeats(party.room).at(-1)?.id;
    const guest = await join(colyseus, party, 'Guest');
    await sleep(150);
    expect(party.room.state.players.size).toBe(MAX_PLAYERS);
    expect(party.room.state.settings.npcSeats).toBe(MAX_PLAYERS - 2);
    expect(party.room.state.players.has(guest.id)).toBe(true);
    expect(party.room.state.players.has(newest ?? '')).toBe(false);
    expect(party.room.state.leaderId).toBe(leader.id);
  });
});

describe('lobby.settings', () => {
  it('writes the mode for the leader and refuses a bad value', async () => {
    const party = await lobbyOf(colyseus, 2);
    const [leader, guest] = [party.humans[0]!, party.humans[1]!];
    await send(leader, C2S.lobbySettings, { mode: 1 });
    expect(party.room.state.settings.mode).toBe(1);
    await send(leader, C2S.lobbySettings, { mode: 0 });
    expect(party.room.state.settings.mode).toBe(0);
    await send(leader, C2S.lobbySettings, { mode: 2 });
    await send(guest, C2S.lobbySettings, { mode: 1 });
    expect(errors(leader)).toEqual([ErrorCode.cannot]);
    expect(errors(guest)).toEqual([ErrorCode.cannot]);
    expect(party.room.state.settings.mode).toBe(0);
  });

  it('defaults the difficulty and accepts a change only with enough NPC seats', async () => {
    const party = await lobbyOf(colyseus, 1);
    const leader = party.humans[0]!;
    expect(party.room.state.settings.npcDifficulty).toBe(
      NpcLevel[balance.npc.defaultDifficulty as keyof typeof NpcLevel],
    );
    await send(leader, C2S.lobbySettings, { npcDifficulty: NpcLevel.hard });
    expect(errors(leader)).toEqual([ErrorCode.cannot]);
    for (let i = 0; i < balance.npc.difficultyMinNpcs; i++) await send(leader, C2S.lobbyAddNpc, {}, 60);
    await send(leader, C2S.lobbySettings, { npcDifficulty: NpcLevel.hard });
    expect(party.room.state.settings.npcDifficulty).toBe(NpcLevel.hard);
    await send(leader, C2S.lobbySettings, { npcDifficulty: 7, mode: 1 });
    expect(party.room.state.settings.npcDifficulty).toBe(NpcLevel.hard);
    expect(party.room.state.settings.mode).toBe(0);
  });
});

describe('NPC seats through the match', () => {
  it('survives resetToLobby: seats, count, ready and the settings stay', async () => {
    const party = await lobbyOf(colyseus, 1);
    await send(party.humans[0]!, C2S.lobbySettings, { mode: 0 });
    await start(party);
    party.room.state.settings.npcDifficulty = NpcLevel.hard;
    const ids = npcSeats(party.room).map((p) => p.id);
    resetToLobby(party.room);
    expect(party.room.state.phase).toBe(Phase.lobby);
    expect(party.room.state.settings.npcSeats).toBe(3);
    expect(party.room.state.settings.npcDifficulty).toBe(NpcLevel.hard);
    expect(npcSeats(party.room).map((p) => p.id)).toEqual(ids);
    for (const p of npcSeats(party.room)) expect([p.connected, p.ready]).toEqual([true, true]);
    expect(party.room.state.leaderId).toBe(party.humans[0]?.id);
  });

  it('moves its NPCs in the next match after a reset', async () => {
    const party = await lobbyOf(colyseus, 1);
    await start(party);
    resetToLobby(party.room);
    await start(party);
    await toWorld(party);
    const sim = simOf(party.room);
    const npcs = npcSeats(party.room).map((p) => sim.players.get(p.id)!);
    const from = npcs.map((p) => ({ x: p.x, y: p.y }));
    await sleep(2500);
    const moved = npcs.filter((p, i) => Math.hypot(p.x - from[i]!.x, p.y - from[i]!.y) > 4);
    expect(moved.length).toBeGreaterThanOrEqual(2);
  }, 30_000);

  it('hands the lead to a human, never to an NPC seat, when the leader leaves', async () => {
    const party = await lobbyOf(colyseus, 2);
    await send(party.humans[0]!, C2S.lobbyAddNpc, {}, 60);
    await party.humans[0]!.room.leave();
    await sleep(250);
    expect(party.room.state.leaderId).toBe(party.humans[1]?.id);
  });
});

describe('the wire never marks an NPC seat', () => {
  const others = (party: Awaited<ReturnType<typeof lobbyOf>>, viewer = 1) => {
    const me = party.humans[viewer]!;
    const out: Record<string, unknown>[] = [];
    stateOf(me).players.forEach((p, id) => {
      if (id !== me.id) out.push(flatten(JSON.parse(JSON.stringify(p.toJSON()))));
    });
    return out;
  };
  const shapes = (rows: Record<string, unknown>[]) =>
    rows
      .map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v])))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

  it('shows the same key sets and field types for a 1+3 room and a 4-human room', async () => {
    const mixed = await lobbyOf(colyseus, 2);
    await send(mixed.humans[0]!, C2S.lobbyAddNpc, {}, 60);
    await send(mixed.humans[0]!, C2S.lobbyAddNpc, {}, 60);
    const all = await lobbyOf(colyseus, 4);
    await sleep(150);
    // Lobby: key sets and types of every other seat match.
    expect(shapes(others(mixed))).toEqual(shapes(others(all)));

    await start(mixed);
    await start(all);
    await sleep(150);
    // Role card, before any human readies: no seat reads ready in either room.
    for (const party of [mixed, all]) {
      expect(others(party).every((r) => r.ready === false)).toBe(true);
      expect(others(party).every((r) => r.connected === true)).toBe(true);
    }
    expect(shapes(others(mixed))).toEqual(shapes(others(all)));
    const keysOf = (rows: Record<string, unknown>[]) => rows.map((r) => Object.keys(r).sort().join(','));
    expect(keysOf(others(mixed)).sort()).toEqual(keysOf(others(all)).sort());
  });

  it('carries no isNpc, no npc_ and no pool marker in the encoded state', async () => {
    const party = await lobbyOf(colyseus, 1);
    await start(party);
    const text = JSON.stringify(stateOf(party.humans[0]!).toJSON());
    expect(text).not.toMatch(/isNpc|npc_|"npc"/i);
    const log = JSON.stringify(party.humans[0]!.log);
    expect(log).not.toMatch(/isNpc|npc_/i);
    expect(JSON.stringify(party.room.state.toJSON())).not.toMatch(/isNpc|npc_/i);
  });

  it('readies NPCs on the role card at a human pace, and the card still ends', async () => {
    const party = await lobbyOf(colyseus, 1);
    await start(party);
    const seats = npcSeats(party.room);
    expect(seats.every((p) => !p.ready)).toBe(true);
    const began = party.room.state.tick;
    const readyAt = new Map<string, number>();
    await until(() => {
      for (const p of seats) if (p.ready && !readyAt.has(p.id)) readyAt.set(p.id, party.room.state.tick);
      return readyAt.size === seats.length;
    }, 20_000);
    expect(readyAt.size).toBe(seats.length);
    for (const tick of readyAt.values()) {
      expect(tick - began).toBeGreaterThanOrEqual(balance.npc.ready.delayS.min * 20 - 3);
      expect(tick - began).toBeLessThanOrEqual(balance.npc.ready.delayS.max * 20 + 3);
    }
    party.humans[0]?.room.send(C2S.lobbyReady, { ready: true });
    await until(() => party.room.state.phase === Phase.grace);
    expect(party.room.state.phase).toBe(Phase.grace);
  }, 40_000);
});
