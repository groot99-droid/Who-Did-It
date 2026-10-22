import { type ColyseusTestServer, boot } from '@colyseus/testing';
import {
  BUILD_VERSION,
  C2S,
  JOIN_ERROR_CODE,
  JOIN_ERROR_MESSAGE,
  type GameStateType,
  Phase,
  type SceneStateType,
  type AdminS2CPayloads,
} from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminRoom } from '../src/rooms/AdminRoom';
import type { PartyRoom } from '../src/rooms/PartyRoom';
import { createServer } from '../src/server';
import { adminConfig, signAdminToken } from '../src/services/adminAuth';
import { simOf } from '../src/sim/RoomSim';
import { emitSim } from '../src/sim/events/bus';
import { autoOf } from '../src/sim/auto/Auto';
import { clockOf } from '../src/sim/auto/clock';
import { until } from './flowHelpers';
import { registerInvariant } from '../src/sim/auto/invariants';
import { advance, lobbyOf, pauseClock, start, toWorld } from './npcHelpers';
import { sleep } from './simHelpers';

vi.setConfig({ testTimeout: 40_000 });

const ENV: Record<string, string> = {
  WDI_ADMIN: '1',
  WDI_ADMIN_GITHUB_CLIENT_ID: 'client-id',
  WDI_ADMIN_GITHUB_CLIENT_SECRET: 'client-secret',
  WDI_ADMIN_GITHUB_LOGINS: 'Owner-Login',
  WDI_ADMIN_SECRET: 'k'.repeat(44),
  WDI_ADMIN_CLIENT_URL: 'https://example.test/Who-Did-It/',
};
const setEnv = () => Object.assign(process.env, ENV);
const clearEnv = () => {
  for (const key of Object.keys(ENV)) delete process.env[key];
};

const limits = { ipBurst: 1e5, ipPerMin: 1e8, globalPerMin: 1e8 };
const nowS = () => Math.floor(Date.now() / 1000);
const tokenFor = (sub = 'owner-login', exp = nowS() + 600) => {
  const cfg = adminConfig(ENV);
  if (!cfg) throw new Error('test config');
  return signAdminToken(cfg, { sub, id: 1, exp });
};
const joinOpts = (token: string, build = BUILD_VERSION) => ({ build, token });

/** The error a failed create or join surfaces on the client. */
async function joinError(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (e) {
    const err = e as { code?: number; message?: string };
    return { code: err.code, message: err.message };
  }
  throw new Error('join unexpectedly succeeded');
}
const GENERIC = { code: JOIN_ERROR_CODE, message: JOIN_ERROR_MESSAGE };

describe('with the variables set', () => {
  let colyseus: ColyseusTestServer;
  beforeAll(async () => {
    setEnv();
    colyseus = await boot(createServer(limits));
  });
  afterAll(async () => {
    await colyseus.shutdown();
    clearEnv();
  });
  beforeEach(async () => colyseus.cleanup());

  const create = (token = tokenFor()) => colyseus.sdk.create('admin', joinOpts(token));
  const roomOf = (id: string) => colyseus.getRoomById(id) as unknown as AdminRoom;

  it('refuses every bad token with the one generic error', async () => {
    const good = tokenFor();
    const [payload, sig] = good.split('.') as [string, string];
    const forged = Buffer.from(JSON.stringify({ sub: 'owner-login', id: 2, exp: nowS() + 600 })).toString(
      'base64url',
    );
    const bad: Array<[string, unknown, string?]> = [
      ['no token', undefined],
      ['an empty token', ''],
      ['a number', 42],
      ['garbage', 'not.a.token'],
      ['a tampered signature', `${payload}.${sig.slice(0, -2)}AA`],
      ['a forged payload', `${forged}.${sig}`],
      ['an expired token', tokenFor('owner-login', nowS() - 1)],
      ['a login off the allowlist', tokenFor('stranger')],
      ['the wrong build', good, 'other-build'],
    ];
    for (const [name, token, build] of bad) {
      const err = await joinError(() =>
        colyseus.sdk.create('admin', { build: build ?? BUILD_VERSION, token } as never),
      ).catch(() => ({ joined: name }));
      expect(err, name).toEqual(GENERIC);
    }
    expect(await joinError(() => colyseus.sdk.create('admin', undefined as never))).toEqual(GENERIC);
  });

  it('refuses a good token on a join by id after a bad one on create, and a party join with an admin token', async () => {
    const admin = await create();
    expect(await joinError(() => colyseus.sdk.joinById(admin.roomId, joinOpts('x')))).toEqual(GENERIC);
    // The party room's own gate wants a name and a device id; an admin token is not a seat.
    expect(await joinError(() => colyseus.sdk.create('party', joinOpts(tokenFor())))).toEqual(GENERIC);
  });

  it('joins a good token without a seat, in an auto room with the NPC seats dealt', async () => {
    const admin = await create();
    await sleep(150);
    const room = roomOf(admin.roomId);
    expect(room.state.players.has(admin.sessionId)).toBe(false);
    expect(simOf(room).players.has(admin.sessionId)).toBe(false);
    expect(autoOf(room)).not.toBeNull();
    expect(room.state.leaderId).toBe('');
    expect(room.state.players.size).toBeGreaterThanOrEqual(4);
    const state = admin.state as unknown as GameStateType;
    expect(state.players.size).toBe(room.state.players.size);
    await admin.leave();
  });

  it('refuses a second client while the admin is in', async () => {
    const admin = await create();
    expect(await joinError(() => colyseus.sdk.joinById(admin.roomId, joinOpts(tokenFor())))).toEqual(GENERIC);
    await admin.leave();
  });

  it('disposes the room when the admin leaves', async () => {
    const admin = await create();
    const id = admin.roomId;
    await admin.leave();
    expect(await until(() => colyseus.getRoomById(id) === undefined, 3000)).toBe(true);
  });

  it('sees every seat with its role and the true seat behind every avatar', async () => {
    const admin = await create();
    const room = roomOf(admin.roomId);
    pauseClock(room);
    autoOf(room)?.commands.push({ kind: 'start' });
    for (let i = 0; i < 4000 && room.state.phase !== Phase.grace; i++) advance({ humans: [], room }, 1);
    expect(room.state.phase).toBe(Phase.grace);
    advance({ humans: [], room }, 8);
    await sleep(500);

    const state = admin.state as unknown as GameStateType;
    expect(state.players.size).toBe(room.state.players.size);
    for (const [id, seat] of room.state.players) {
      const seen = state.players.get(id);
      expect(seen?.priv?.role?.roleId, id).toBe(seat.priv.role.roleId);
      expect(seen?.presence, id).toBeDefined();
    }

    const seats = new Set<string>();
    let avatars = 0;
    state.scenes.forEach((scene: SceneStateType) =>
      scene.avatars?.forEach((a) => {
        avatars++;
        if (a.seat) seats.add(a.seat);
      }),
    );
    expect(avatars).toBeGreaterThan(0);
    expect(seats.size).toBe(avatars);
    for (const seat of seats) expect(room.state.players.has(seat)).toBe(true);
    await admin.leave();
  });

  it('does not change what a party client in the same server receives', async () => {
    const party = await lobbyOf(colyseus, 1);
    await start(party);
    await toWorld(party);
    const human = party.humans[0]!;
    // An admin message to a party room is dropped, and changes nothing.
    human.room.send('admin.clock', { scale: 10 });
    human.room.send('admin.start', {});
    human.room.send('admin.reset', {});
    human.room.send(C2S.lobbyReady, { ready: true });
    await sleep(600);

    expect(clockOf(party.room)).toMatchObject({ scale: 1, paused: false });
    expect(autoOf(party.room)).toBeNull();
    expect(human.log.filter((m) => m.type.startsWith('admin.'))).toEqual([]);

    const state = human.room.state as unknown as GameStateType;
    let alive = 0;
    state.scenes.forEach((scene: SceneStateType) =>
      scene.avatars?.forEach((avatar) => {
        alive++;
        expect(avatar.seat ?? '').toBe('');
      }),
    );
    expect(alive).toBeGreaterThan(0);
    for (const [id, p] of state.players) {
      if (id !== human.id) {
        expect(p.priv, id).toBeUndefined();
        expect(p.presence, id).toBeUndefined();
      }
    }
    await human.room.leave();
  });

  it('keeps an admin client apart from a party room of the same server', async () => {
    const party = await lobbyOf(colyseus, 1);
    const admin = await create();
    expect(admin.roomId).not.toBe(party.room.roomId);
    expect((party.room as PartyRoom).clients.length).toBe(1);
    await admin.leave();
  });

  describe('the admin wire', () => {
    type Snapshot = AdminS2CPayloads['admin.snapshot'];
    /** An admin client that keeps the latest snapshot, every invariant row and every error. */
    async function watch() {
      const client = await create();
      const got = {
        snapshots: 0,
        last: null as Snapshot | null,
        invariants: [] as unknown[],
        events: [] as { tick: number; kind: string; seat?: string }[][],
        errors: [] as number[],
      };
      client.onMessage('admin.snapshot', (m: Snapshot) => {
        got.snapshots++;
        got.last = m;
      });
      client.onMessage(
        'admin.event',
        (
          m:
            | { events?: { tick: number; kind: string; seat?: string }[] }
            | { tick: number; kind: string; seat?: string }[],
        ) => {
          got.events.push(Array.isArray(m) ? m : (m.events ?? []));
        },
      );
      client.onMessage('admin.invariant', (m: unknown) => got.invariants.push(m));
      client.onMessage('error', (m: { code: number }) => got.errors.push(m.code));
      return { client, got, room: roomOf(client.roomId) };
    }

    it('sends a snapshot every tick: phase, seats with roles and brains, the clock', async () => {
      const { client, got, room } = await watch();
      await sleep(1000);
      expect(got.snapshots).toBeGreaterThan(10);
      const snap = got.last as Snapshot;
      expect(snap.phase).toBe(Phase.lobby);
      expect(snap.scale).toBe(1);
      expect(snap.paused).toBe(false);
      expect(snap.seats.map((x) => x.id).sort()).toEqual([...room.state.players.keys()].sort());
      for (const seat of snap.seats) expect(seat.brain).toBeDefined();
      expect(snap.invariants).toEqual([]);
      await client.leave();
    });

    it('configures with admin.setup and starts with admin.start, all inside the step', async () => {
      const { client, got, room } = await watch();
      const seeds = { deal: [1, 2, 3, 4] };
      client.send('admin.setup', { map: 'blackpine', mode: 'main', seats: 5, difficulty: 'hard', seeds });
      await sleep(300);
      expect(room.state.players.size).toBe(5);
      expect(room.state.settings.map).toBe('blackpine');
      expect(autoOf(room)?.options.seeds?.deal).toEqual([1, 2, 3, 4]);

      client.send('admin.start', {});
      expect(await until(() => room.state.phase !== Phase.lobby, 3000)).toBe(true);
      await sleep(200);
      const snap = got.last as Snapshot;
      expect(snap.seats).toHaveLength(5);
      for (const seat of snap.seats) {
        expect(seat.roleId).toBe(room.state.players.get(seat.id)?.priv.role.roleId);
        expect(seat.roleId).not.toBe('');
      }
      await client.leave();
    });

    it('refuses a bad setup and a bad clock with a 422 and changes nothing', async () => {
      const { client, got, room } = await watch();
      const before = room.state.players.size;
      client.send('admin.setup', { map: 'nowhere', mode: 'main', seats: 5, difficulty: 'hard' });
      client.send('admin.setup', { map: 'hollowmere', mode: 'main', seats: 99, difficulty: 'hard' });
      client.send('admin.setup', {
        map: 'hollowmere',
        mode: 'main',
        seats: 5,
        difficulty: 'hard',
        seeds: { bogus: [1, 2, 3, 4] },
      });
      client.send('admin.setup', 'x');
      client.send('admin.clock', { scale: 3 });
      client.send('admin.clock', { paused: 'yes' });
      client.send('admin.clock', { step: 1e9 });
      client.send('admin.clock', null);
      await sleep(300);
      expect(got.errors).toEqual(Array(8).fill(422));
      expect(room.state.players.size).toBe(before);
      expect(clockOf(room)).toMatchObject({ scale: 1, paused: false, pendingSteps: 0 });
      expect(autoOf(room)?.commands).toEqual([]);
      await client.leave();
    });

    it('sets the speed, pauses, single-steps exactly, and still starts while paused', async () => {
      const { client, got, room } = await watch();
      client.send('admin.clock', { scale: 10 });
      await sleep(400);
      expect(clockOf(room).scale).toBe(10);
      expect((got.last as Snapshot).scale).toBe(10);
      expect((got.last as Snapshot).effectiveScale).toBeGreaterThan(1);

      client.send('admin.clock', { scale: 1, paused: true });
      await sleep(300);
      expect((got.last as Snapshot).paused).toBe(true);
      const frozen = room.state.tick;
      await sleep(300);
      expect(room.state.tick).toBe(frozen);
      expect((got.last as Snapshot).tick).toBe(frozen);

      client.send('admin.clock', { step: 3 });
      await sleep(300);
      expect(room.state.tick).toBe(frozen + 3);

      // A paused room runs no step, so Start would wait for ever unless `stepsThisTick` runs one step for the queued commands.
      client.send('admin.start', {});
      expect(await until(() => room.state.phase !== Phase.lobby, 3000)).toBe(true);
      expect(room.state.tick).toBe(frozen + 4);
      expect(clockOf(room).paused).toBe(true);

      client.send('admin.clock', { paused: false });
      expect(await until(() => !clockOf(room).paused, 3000)).toBe(true);
      expect(await until(() => room.state.tick > frozen + 10, 3000)).toBe(true);
      await client.leave();
    });

    it('resets to the lobby with the clock paused', async () => {
      const { client, room } = await watch();
      client.send('admin.start', {});
      expect(await until(() => room.state.phase !== Phase.lobby, 3000)).toBe(true);
      client.send('admin.reset', {});
      expect(await until(() => room.state.phase === Phase.lobby, 3000)).toBe(true);
      expect(clockOf(room).paused).toBe(true);
      expect(autoOf(room)?.started).toBe(false);
      await client.leave();
    });

    it('sends each new invariant failure once, keeps it on the snapshot, and clears it at Reset', async () => {
      const { client, got, room } = await watch();
      let broken = false;
      registerInvariant('test.admin', (r) =>
        broken && r === room ? { name: 'test.admin', tick: r.state.tick, detail: 'constructed' } : null,
      );
      client.send('admin.start', {});
      expect(await until(() => room.state.phase !== Phase.lobby, 3000)).toBe(true);
      await sleep(1200);
      expect(got.invariants).toEqual([]);
      broken = true;
      await sleep(2500);
      expect(got.invariants).toHaveLength(1);
      expect(got.invariants[0]).toMatchObject({ name: 'test.admin', detail: 'constructed' });
      expect((got.last as Snapshot).invariants).toHaveLength(1);

      broken = false;
      client.send('admin.reset', {});
      expect(await until(() => room.state.phase === Phase.lobby, 3000)).toBe(true);
      await sleep(300);
      expect((got.last as Snapshot).invariants).toEqual([]);
      await client.leave();
    });

    it("forwards the tick's bus events as admin.event, seats and scene ids only", async () => {
      const { client, got, room } = await watch();
      client.send('admin.start', {});
      expect(await until(() => room.state.phase !== Phase.lobby, 3000)).toBe(true);
      emitSim(room, { tick: room.state.tick, kind: 'test.ping', seat: 'seat-x', data: { n: 1 } });
      expect(await until(() => got.events.flat().some((e) => e.kind === 'test.ping'), 3000)).toBe(true);
      const ping = got.events.flat().find((e) => e.kind === 'test.ping');
      expect(ping).toMatchObject({ seat: 'seat-x', data: { n: 1 } });
      expect(got.events.flat().some((e) => e.kind === 'start')).toBe(true);
      await client.leave();
    });
  });
});
