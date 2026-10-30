import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import type { Client } from 'colyseus';
import { C2S, Phase, type PlayerState } from '@wdi/shared';
import { isNpcSeat } from '../src/sim/Npc';
import { simOf } from '../src/sim/RoomSim';
import { clientOf, seatOf } from '../src/sim/seatIds';
import { resetToLobby } from '../src/sim/Win';
import { type Party, advance, bootNpcServer, lobbyOf, pauseClock, stateOf } from './npcHelpers';
import { sleep } from './simHelpers';

/** Round 10, W1a (seams.md 3 row 25, scope.md 2.1): the hidden seats, step 1: fresh seat ids at Start. */

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());
vi.setConfig({ testTimeout: 60_000 });

/** `humans` bots, the NPC fill, Start pressed and the role card on screen. */
async function started(humans: number): Promise<{ party: Party; sessions: string[] }> {
  const party = await lobbyOf(colyseus, humans);
  pauseClock(party.room);
  const sessions = party.humans.map((h) => h.id);
  for (const h of party.humans) h.log.length = 0;
  party.room.lobbyCommands.push({ sessionId: sessions[0] } as Client, C2S.lobbyStart, {});
  advance(party, 1);
  party.room.broadcastPatch();
  await sleep(200);
  return { party, sessions };
}

const seatsOf = (party: Party): string[] => [...party.room.state.players.keys()];

describe('fresh seat ids at Start (row 25)', () => {
  it('re-keys every seat of a world match, human and NPC, in fresh-id order', async () => {
    const { party, sessions } = await started(3);
    const room = party.room;
    expect(room.state.phase).toBe(Phase.roleReveal);
    const ids = seatsOf(party);
    expect(ids.length).toBeGreaterThanOrEqual(4);
    for (const s of sessions) expect(ids).not.toContain(s);
    expect(ids).toEqual([...ids].sort());
    // Each client's session maps to one seat, no two alike, and back again; NPC seats have no client.
    const mine = party.humans.map((h) => seatOf(room, { sessionId: h.id }));
    expect(new Set(mine).size).toBe(3);
    for (const [i, seat] of mine.entries()) {
      expect(ids).toContain(seat);
      expect(isNpcSeat(room, seat)).toBe(false);
      expect(clientOf(room, seat)?.sessionId).toBe(sessions[i]);
    }
    for (const id of ids.filter((id) => isNpcSeat(room, id))) expect(clientOf(room, id)).toBeUndefined();
    // Every seat is dealt under its new id, and the sim keeps one PlayerSim per seat.
    for (const id of ids) expect(room.state.players.get(id)?.priv.role.roleId).not.toBe('');
    expect([...simOf(room).players.keys()].sort()).toEqual(ids);
    expect(mine).toContain(room.state.leaderId);
  });

  it('sends no session id to any client after Start, and each client finds its own seat in Private.seatId', async () => {
    const { party, sessions } = await started(4);
    const room = party.room;
    for (const h of party.humans) {
      const seat = seatOf(room, { sessionId: h.id });
      const state = stateOf(h);
      const own = [...state.players.values()].filter((p: PlayerState) => p.priv?.seatId);
      expect(own.map((p: PlayerState) => p.priv.seatId)).toEqual([seat]);
      expect(own[0]?.id).toBe(seat);
      expect([...state.players.keys()].some((id) => sessions.includes(id))).toBe(false);
      expect(sessions).not.toContain(state.leaderId);
      const sent = JSON.stringify(h.log);
      for (const s of sessions) expect(sent).not.toContain(s);
      expect(h.log.some((m) => m.type === 'roleReveal')).toBe(true);
    }
  });

  it('runs a client command on its fresh seat', async () => {
    const { party } = await started(3);
    const room = party.room;
    const h = party.humans[1]!;
    const seat = seatOf(room, { sessionId: h.id });
    h.room.send(C2S.roleReady, {});
    await sleep(150);
    advance(party, 1);
    room.broadcastPatch();
    await sleep(150);
    expect(stateOf(h).players.get(seat)?.ready).toBe(true);
  });

  it('records a leave during play on the fresh seat', async () => {
    const { party } = await started(3);
    const room = party.room;
    const h = party.humans[2]!;
    const seat = seatOf(room, { sessionId: h.id });
    await h.room.leave();
    await sleep(200);
    expect(room.state.players.get(seat)?.connected).toBe(false);
    expect(simOf(room).deaths.some((d) => d.playerId === seat && d.cause === 'vanished')).toBe(true);
  });

  it('keeps the session ids when fewer than three humans play', async () => {
    for (const n of [1, 2]) {
      const { party, sessions } = await started(n);
      const ids = seatsOf(party);
      for (const s of sessions) expect(ids).toContain(s);
      for (const h of party.humans) expect(stateOf(h).players.get(h.id)?.priv.seatId).toBe('');
      await colyseus.cleanup();
    }
  });

  it('puts the human seats back under their session ids on the return to the lobby', async () => {
    const { party, sessions } = await started(3);
    const room = party.room;
    const leader = room.state.leaderId;
    resetToLobby(room);
    room.broadcastPatch();
    await sleep(200);
    const ids = seatsOf(party);
    for (const s of sessions) expect(ids).toContain(s);
    expect(room.state.leaderId).toBe(seatOf(room, { sessionId: sessions[0]! }));
    expect(leader).not.toBe(room.state.leaderId);
    for (const id of ids) expect(room.state.players.get(id)?.priv.seatId).toBe('');
    for (const h of party.humans) {
      expect(seatOf(room, { sessionId: h.id })).toBe(h.id);
      expect(stateOf(h).players.get(h.id)?.name).toBe(room.state.players.get(h.id)?.name);
    }
  });
});
