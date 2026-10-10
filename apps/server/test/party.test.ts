import { ColyseusTestServer, boot } from '@colyseus/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  BUILD_VERSION,
  C2S,
  JOIN_ERROR_CODE,
  JOIN_ERROR_MESSAGE,
  MAX_PLAYERS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  TICK_RATE,
  type GameStateType,
  type PlayerState,
} from '@wdi/shared';
import type { PartyRoom } from '../src/rooms/PartyRoom';
import { createServer } from '../src/server';

const PORT = 2568; // @colyseus/testing default
const opts = (name: string, build = BUILD_VERSION) => ({ name, build, deviceId: `dev-${name}` });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The error a failed join surfaces on the client. */
async function joinError(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (e) {
    const err = e as { code?: number; message?: string };
    return { code: err.code, message: err.message };
  }
  throw new Error('join unexpectedly succeeded');
}

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  colyseus = await boot(createServer({ ipBurst: 100_000, ipPerMin: 100_000_000, globalPerMin: 100_000_000 }));
});
afterAll(async () => colyseus.shutdown());
beforeEach(async () => colyseus.cleanup());

describe('room codes and private matchmaking', () => {
  it('uses a 5-character code from the unambiguous alphabet as the roomId and joins by it', async () => {
    const leader = await colyseus.sdk.create('party', opts('Ada'));
    expect(leader.roomId).toHaveLength(ROOM_CODE_LENGTH);
    for (const ch of leader.roomId) expect(ROOM_CODE_ALPHABET).toContain(ch);
    const guest = await colyseus.sdk.joinById(leader.roomId, opts('Bob'));
    expect(guest.roomId).toBe(leader.roomId);
  });

  it('draws distinct codes for concurrent creates', async () => {
    const rooms = await Promise.all(
      Array.from({ length: 12 }, (_, i) => colyseus.sdk.create('party', opts(`P${i}x`))),
    );
    expect(new Set(rooms.map((r) => r.roomId)).size).toBe(12);
  });

  it('keeps the party out of public matchmaking', async () => {
    const leader = await colyseus.sdk.create('party', opts('Ada'));
    const err = await joinError(() => colyseus.sdk.join('party', opts('Bob')));
    expect(err.message).toBe(JOIN_ERROR_MESSAGE);
    expect(leader.roomId).toBeTruthy();
  });
});

describe('role secrecy on the wire', () => {
  it('10 bots join and each sees only its own priv and presence', async () => {
    const leader = await colyseus.sdk.create('party', opts('Bot0'));
    const bots = [leader];
    for (let i = 1; i < MAX_PLAYERS; i++)
      bots.push(await colyseus.sdk.joinById(leader.roomId, opts(`Bot${i}`)));
    await sleep(300);

    const names = bots.map((_, i) => `Bot${i}`);
    for (const bot of bots) {
      const state = bot.state as unknown as GameStateType;
      const players = state.players;
      expect(players.size).toBe(MAX_PLAYERS);
      let own = 0;
      players.forEach((p: PlayerState, id: string) => {
        expect(names).toContain(p.name);
        if (id === bot.sessionId) {
          own++;
          expect(p.priv).toBeDefined();
          expect(p.presence).toBeDefined();
        } else {
          expect(p.priv).toBeUndefined();
          expect(p.presence).toBeUndefined();
        }
      });
      expect(own).toBe(1);
      expect([...state.scenes.keys()]).toEqual(['overworld']);
    }
  });
});

describe('generic join error', () => {
  it('refuses the 11th join, a version mismatch, an unknown code and a bad name with the same error', async () => {
    const leader = await colyseus.sdk.create('party', opts('Bot0'));
    for (let i = 1; i < MAX_PLAYERS; i++) await colyseus.sdk.joinById(leader.roomId, opts(`Bot${i}`));

    const eleventh = await joinError(() => colyseus.sdk.joinById(leader.roomId, opts('Late')));
    const otherRoom = await colyseus.sdk.create('party', opts('Solo'));
    const wrongBuild = await joinError(() =>
      colyseus.sdk.joinById(otherRoom.roomId, opts('Eve', 'not-this-build')),
    );
    const unknown = await joinError(() => colyseus.sdk.joinById('ZZZZZ', opts('Eve')));
    const badName = await joinError(() => colyseus.sdk.joinById(otherRoom.roomId, opts('x')));
    const createWrongBuild = await joinError(() =>
      colyseus.sdk.create('party', opts('Eve', 'not-this-build')),
    );

    const expected = { code: JOIN_ERROR_CODE, message: JOIN_ERROR_MESSAGE };
    expect(eleventh).toEqual(expected);
    expect(wrongBuild).toEqual(expected);
    expect(unknown).toEqual(expected);
    expect(badName).toEqual(expected);
    expect(createWrongBuild).toEqual(expected);
  });
});

describe('fixed step and command queue', () => {
  it('advances the tick at 20 Hz', async () => {
    const leader = await colyseus.sdk.create('party', opts('Ada'));
    const room = colyseus.getRoomById(leader.roomId) as unknown as PartyRoom;
    const t0 = room.state.tick;
    await sleep(1000);
    const ticks = room.state.tick - t0;
    expect(ticks).toBeGreaterThanOrEqual(TICK_RATE - 3);
    expect(ticks).toBeLessThanOrEqual(TICK_RATE + 3);
  });

  it('applies a message only inside a step, never in the message callback', async () => {
    const leader = await colyseus.sdk.create('party', opts('Ada'));
    const room = colyseus.getRoomById(leader.roomId) as unknown as PartyRoom;
    const player = room.state.players.get(leader.sessionId);
    // Hold the step still, deliver the message, and check nothing changed until a step runs.
    const queue = room.lobbyCommands;
    const drain = queue.drain.bind(queue);
    let held = true;
    queue.drain = () => (held ? [] : drain());
    leader.send(C2S.lobbyReady, { ready: true });
    await sleep(200);
    expect(player?.ready).toBe(false);
    held = false;
    await sleep(200);
    expect(player?.ready).toBe(true);
  });
});

describe('debug handlers', () => {
  it('are absent unless WDI_DEBUG=1', async () => {
    const leader = await colyseus.sdk.create('party', opts('Ada'));
    let got: unknown;
    leader.onMessage('debug.roles', (m) => (got = m));
    leader.send('debug.roles', {});
    await sleep(200);
    expect(got).toBeUndefined();

    process.env.WDI_DEBUG = '1';
    try {
      const debug = await colyseus.sdk.create('party', opts('Dee'));
      debug.onMessage('debug.roles', (m) => (got = m));
      debug.send('debug.roles', {});
      await sleep(200);
      expect(got).toBeDefined();
    } finally {
      delete process.env.WDI_DEBUG;
    }
  });
});

describe('/health', () => {
  it('reports ok, build, rooms, tickP95 and patchBytes and honours the CORS allowlist', async () => {
    await colyseus.sdk.create('party', opts('Ada'));
    await sleep(300);
    const res = await fetch(`http://localhost:${PORT}/health`, {
      headers: { Origin: 'https://groot99-droid.github.io' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('https://groot99-droid.github.io');
    const body = (await res.json()) as { rooms: number; tickP95: unknown; patchBytes: unknown };
    expect(body).toMatchObject({ ok: true, build: BUILD_VERSION });
    expect(body.rooms).toBeGreaterThanOrEqual(1);
    expect(typeof body.tickP95).toBe('number');
    expect(typeof body.patchBytes).toBe('number');

    const evil = await fetch(`http://localhost:${PORT}/health`, {
      headers: { Origin: 'https://evil.example' },
    });
    expect(evil.headers.get('access-control-allow-origin')).toBeNull();
  });
});
