import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { balance, deckFor } from '@wdi/content';
import {
  C2S,
  ErrorCode,
  MAX_PLAYERS,
  NpcLevel,
  Phase,
  S2C,
  TICK_RATE,
  type RoleRevealPayload,
} from '@wdi/shared';
import { flowOf } from '../src/sim/Flow';
import { resetToLobby } from '../src/sim/Win';
import { until } from './flowHelpers';
import { flatten } from './killHelpers';
import { simOf } from '../src/sim/RoomSim';
import { npcMemory } from '../src/sim/npc/memory';
import {
  advance,
  bootNpcServer,
  type Human,
  errors,
  join,
  lobbyOf,
  npcSeats,
  send,
  standardParty,
  start,
  stateOf,
  toWorld,
} from './npcHelpers';
import { sleep } from './simHelpers';

/** The refusals travel the wire behind the state a test sees: wait for the count, then assert the exact codes. */
async function errorsAre(h: Human, codes: number[]): Promise<void> {
  await until(() => errors(h).length >= codes.length);
  expect(errors(h)).toEqual(codes);
}

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
    const reveals = () => party.humans[0]?.log.filter((m) => m.type === S2C.roleReveal) ?? [];
    // The card travels the wire behind the state `start` waits on.
    await until(() => reveals().length >= 1);
    const cards = reveals();
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
    // Never Ready the moment it appears (GDD 3.12); D3 pins the delay.
    expect(npc?.ready).toBe(false);
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
    await errorsAre(leader, [ErrorCode.cannot]);

    for (let i = 0; i < MAX_PLAYERS - 1; i++) await send(leader, C2S.lobbyRemoveNpc, {}, 60);
    await sleep(100);
    expect(party.room.state.players.size).toBe(1);
    expect(party.room.state.settings.npcSeats).toBe(0);
    await send(leader, C2S.lobbyRemoveNpc);
    await errorsAre(leader, [ErrorCode.cannot, ErrorCode.cannot]);
  });

  it('removes the most recently added seat', async () => {
    const party = await lobbyOf(colyseus, 1);
    const leader = party.humans[0]!;
    await send(leader, C2S.lobbyAddNpc, {}, 60);
    await send(leader, C2S.lobbyAddNpc, {}, 60);
    // A command is consumed on the room's next steps, which a loaded machine can delay past the send's wait.
    await until(() => npcSeats(party.room).length >= 2);
    const [first, second] = npcSeats(party.room);
    await send(leader, C2S.lobbyRemoveNpc);
    await until(() => !party.room.state.players.has(second?.id ?? ''));
    expect(party.room.state.players.has(first?.id ?? '')).toBe(true);
    expect(party.room.state.players.has(second?.id ?? '')).toBe(false);
  });

  it('refuses a non-leader with 422 and outside the lobby with 425', async () => {
    const party = await lobbyOf(colyseus, 2);
    const guest = party.humans[1]!;
    await send(guest, C2S.lobbyAddNpc);
    await send(guest, C2S.lobbyRemoveNpc);
    await errorsAre(guest, [ErrorCode.cannot, ErrorCode.cannot]);
    expect(party.room.state.settings.npcSeats).toBe(0);
    await start(party);
    const leader = party.humans[0]!;
    await send(leader, C2S.lobbyAddNpc);
    await send(leader, C2S.lobbyRemoveNpc);
    await errorsAre(leader, [ErrorCode.wrongPhase, ErrorCode.wrongPhase]);
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
    await errorsAre(leader, [ErrorCode.cannot]);
    await errorsAre(guest, [ErrorCode.cannot]);
    expect(party.room.state.settings.mode).toBe(0);
  });

  it('defaults the difficulty and accepts a change only with enough NPC seats', async () => {
    const party = await lobbyOf(colyseus, 1);
    const leader = party.humans[0]!;
    expect(party.room.state.settings.npcDifficulty).toBe(
      NpcLevel[balance.npc.defaultDifficulty as keyof typeof NpcLevel],
    );
    await send(leader, C2S.lobbySettings, { npcDifficulty: NpcLevel.hard });
    await errorsAre(leader, [ErrorCode.cannot]);
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
    // D4: the seats stay seated and connected; Ready is false on the reset tick (D2 pins the delay).
    for (const p of npcSeats(party.room)) expect([p.connected, p.ready]).toEqual([true, false]);
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
    // Each NPC stands 3-8 s after its placement (GDD 3.12), then its routine walks it.
    advance(party, 45 * TICK_RATE);
    const moved = npcs.filter((p, i) => Math.hypot(p.x - from[i]!.x, p.y - from[i]!.y) > 4);
    expect(moved.length).toBeGreaterThanOrEqual(2);
  });

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

  it('D1: readies NPCs on the role card 2-9 s after it opens, each on its own draw, and the card still ends', async () => {
    const party = await standardParty(colyseus, 'S1', true);
    const seats = npcSeats(party.room);
    // Ready on the card is private (5F, `flow.cardReady`): the public tick stays clear all card long.
    const cardReady = flowOf(party.room).cardReady;
    expect(seats.every((p) => !p.ready && !cardReady.has(p.id))).toBe(true);
    const open = party.room.state.phaseEndsTick - balance.phases.roleRevealS * TICK_RATE;
    const readyAt = new Map<string, number>();
    advance(party, balance.phases.roleRevealS * TICK_RATE - 5, (tick) => {
      for (const p of seats) {
        expect(p.ready).toBe(false);
        if (cardReady.has(p.id) && !readyAt.has(p.id)) readyAt.set(p.id, tick);
      }
    });
    expect(readyAt.size).toBe(seats.length);
    const d = balance.npc.ready.delayS;
    for (const tick of readyAt.values()) {
      expect(tick - open).toBeGreaterThanOrEqual(d.min * TICK_RATE - 1);
      expect(tick - open).toBeLessThanOrEqual(d.max * TICK_RATE + 1);
    }
    const ticks = [...readyAt.values()];
    expect(Math.max(...ticks) - Math.min(...ticks)).toBeGreaterThanOrEqual(20);
    // The AFK human never readies: the card ends at its timer.
    expect(party.room.state.phase).toBe(Phase.roleReveal);
    advance(party, 10);
    expect(party.room.state.phase).toBe(Phase.grace);
  });

  it('D2: after the return to the lobby the NPC seats turn Ready 2-9 s later, each on its own draw', async () => {
    const party = await standardParty(colyseus, 'S1');
    const human = party.humans[0]!;
    resetToLobby(party.room);
    expect(party.room.state.phase).toBe(Phase.lobby);
    const seats = npcSeats(party.room);
    expect(seats.every((p) => !p.ready)).toBe(true);
    await sleep(150);
    // A client's first patch after the reset shows them all not ready.
    stateOf(human).players.forEach((p, id) => {
      if (id !== human.id) expect(p.ready, id).toBe(false);
    });
    const resetTick = party.room.state.tick;
    const readyAt = new Map<string, number>();
    advance(party, 10 * TICK_RATE, (tick) => {
      for (const p of seats) if (p.ready && !readyAt.has(p.id)) readyAt.set(p.id, tick);
    });
    expect(readyAt.size).toBe(seats.length);
    const d = balance.npc.ready.delayS;
    for (const tick of readyAt.values()) {
      expect(tick - resetTick).toBeGreaterThanOrEqual(d.min * TICK_RATE - 1);
      expect(tick - resetTick).toBeLessThanOrEqual(d.max * TICK_RATE + 1 + 12);
    }
    const ticks = [...readyAt.values()];
    expect(Math.max(...ticks) - Math.min(...ticks)).toBeGreaterThanOrEqual(20);
    expect(party.room.state.players.get(human.id)!.ready).toBe(false);
  });

  it('D3: an NPC added in the lobby arrives not Ready, turns Ready 2-9 s later, and a removed one leaves nothing pending', async () => {
    const party = await lobbyOf(colyseus, 1);
    const leader = party.humans[0]!;
    await send(leader, C2S.lobbyAddNpc, {}, 60);
    await send(leader, C2S.lobbyAddNpc, {}, 60);
    await until(() => npcSeats(party.room).length >= 2);
    const [first, second] = npcSeats(party.room);
    stateOf(leader).players.forEach((p, id) => {
      if (id !== leader.id) expect(p.ready, id).toBe(false);
    });
    const seated = party.room.state.tick;
    const mem = npcMemory(party.room);
    expect(mem.brain(first!.id).lobbyReadyAtTick).toBeGreaterThan(seated - 20);
    await send(leader, C2S.lobbyRemoveNpc, {}, 60);
    await until(() => !party.room.state.players.has(second!.id));
    expect(party.room.state.players.has(second!.id)).toBe(false);
    expect(mem.brains.has(second!.id)).toBe(false);
    const d = balance.npc.ready.delayS;
    let readyAt = -1;
    advance(party, 12 * TICK_RATE, (tick) => {
      if (readyAt < 0 && first!.ready) readyAt = tick;
    });
    expect(readyAt - seated).toBeGreaterThanOrEqual(d.min * TICK_RATE - 1 - 20);
    expect(readyAt - seated).toBeLessThanOrEqual(d.max * TICK_RATE + 1 + 20);
    expect(party.room.state.settings.npcSeats).toBe(1);
  });
});
