import { readFileSync } from 'node:fs';
import { type ColyseusTestServer, boot } from '@colyseus/testing';
import {
  BUILD_VERSION,
  JOIN_ERROR_CODE,
  JOIN_ERROR_MESSAGE,
  STUDIO_C2S,
  STUDIO_S2C,
  type StudioS2CPayloads,
} from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudioRoom } from '../src/rooms/StudioRoom';
import { createServer } from '../src/server';
import { adminConfig, signAdminToken } from '../src/services/adminAuth';
import { until } from './flowHelpers';
import { lobbyOf } from './npcHelpers';
import { sleep } from './simHelpers';

vi.setConfig({ testTimeout: 40_000 });

// The same made-up admin variables as adminRoom.test.ts; no real secret or token is anywhere in a test.
const ENV: Record<string, string> = {
  WDI_ADMIN: '1',
  WDI_ADMIN_GITHUB_CLIENT_ID: 'client-id',
  WDI_ADMIN_GITHUB_CLIENT_SECRET: 'client-secret',
  WDI_ADMIN_GITHUB_LOGINS: 'Owner-Login',
  WDI_ADMIN_SECRET: 'k'.repeat(44),
  WDI_ADMIN_CLIENT_URL: 'https://example.test/Who-Did-It/',
};
const limits = { ipBurst: 1e5, ipPerMin: 1e8, globalPerMin: 1e8 };
const nowS = () => Math.floor(Date.now() / 1000);
const tokenFor = (sub = 'owner-login', exp = nowS() + 600) => {
  const cfg = adminConfig(ENV);
  if (!cfg) throw new Error('test config');
  return signAdminToken(cfg, { sub, id: 1, exp });
};
const GENERIC = { code: JOIN_ERROR_CODE, message: JOIN_ERROR_MESSAGE };

async function joinError(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (e) {
    const err = e as { code?: number; message?: string };
    return { code: err.code, message: err.message };
  }
  throw new Error('join unexpectedly succeeded');
}

type Snapshot = StudioS2CPayloads['studio.snapshot'];

describe('with the admin variables set', () => {
  let colyseus: ColyseusTestServer;
  beforeAll(async () => {
    Object.assign(process.env, ENV);
    colyseus = await boot(createServer(limits));
  });
  afterAll(async () => {
    await colyseus.shutdown();
    for (const key of Object.keys(ENV)) delete process.env[key];
  });
  beforeEach(async () => colyseus.cleanup());

  /** A Studio client that keeps the latest snapshot, every log line and every refusal. */
  async function open() {
    const client = await colyseus.sdk.create('studio', { build: BUILD_VERSION, token: tokenFor() });
    const got = {
      last: null as Snapshot | null,
      snapshots: 0,
      lines: [] as string[],
      errors: [] as string[],
    };
    client.onMessage(STUDIO_S2C.snapshot, (m: Snapshot) => {
      got.snapshots++;
      got.last = m;
    });
    client.onMessage(STUDIO_S2C.log, (m: { lines: string[] }) => got.lines.push(...m.lines));
    client.onMessage('error', (m: { code: number; msg: string }) => got.errors.push(`${m.code} ${m.msg}`));
    return { client, got, room: colyseus.getRoomById(client.roomId) as unknown as StudioRoom };
  }

  it('refuses every bad token and the wrong build with the one generic error', async () => {
    const bad: Array<[string, unknown, string?]> = [
      ['no token', undefined],
      ['garbage', 'not.a.token'],
      ['an expired token', tokenFor('owner-login', nowS() - 1)],
      ['a login off the allowlist', tokenFor('stranger')],
      ['the wrong build', tokenFor(), 'other-build'],
    ];
    for (const [name, token, build] of bad) {
      const err = await joinError(() =>
        colyseus.sdk.create('studio', { build: build ?? BUILD_VERSION, token } as never),
      );
      expect(err, name).toEqual(GENERIC);
    }
    expect(await joinError(() => colyseus.sdk.create('studio', undefined as never))).toEqual(GENERIC);
  });

  it('admits one client, refuses a second, and is disposed when it leaves', async () => {
    const { client } = await open();
    const id = client.roomId;
    expect(
      await joinError(() => colyseus.sdk.joinById(id, { build: BUILD_VERSION, token: tokenFor() })),
    ).toEqual(GENERIC);
    await client.leave();
    expect(await until(() => colyseus.getRoomById(id) === undefined, 3000)).toBe(true);
  });

  it('sends a snapshot every tick and applies commands inside the step', async () => {
    const { client, got, room } = await open();
    await sleep(500);
    expect(got.snapshots).toBeGreaterThan(5);
    expect(got.last?.sceneId).toBe(room.sim.sceneId);
    client.send(STUDIO_C2S.move, { seq: 5, dx: 1, dy: 0 });
    expect(await until(() => room.sim.lastSeq === 5, 3000)).toBe(true);
    // S1b: a teleport and noclip over the wire, applied in the step and echoed in the snapshot and the log.
    client.send(STUDIO_C2S.teleport, { sceneId: 'bakery', spawnId: 'door' });
    client.send(STUDIO_C2S.noclip, { on: true });
    expect(await until(() => got.last?.noclip === true, 3000)).toBe(true);
    expect(got.last).toMatchObject({ sceneId: 'bakery', tx: 8, ty: 9 });
    expect(got.lines.some((l) => l.includes('teleport bakery door'))).toBe(true);
    // S1c: a stand-in, an item and the time of day.
    client.send(STUDIO_C2S.spawn, { kind: 'mob', ref: 'wolf' });
    client.send(STUDIO_C2S.give, { itemId: 'knife' });
    client.send(STUDIO_C2S.time, { phase: 'night', t: 0 });
    expect(await until(() => got.last?.items.length === 1, 3000)).toBe(true);
    expect(got.last).toMatchObject({ time: { phase: 'night' } });
    expect(got.last?.spawns.map((s) => s.ref)).toEqual(['wolf']);
    // S4: the row is live, with its feet, facing and state.
    expect(got.last?.spawns[0]).toMatchObject({
      kind: 'mob',
      px: expect.any(Number),
      state: expect.any(String),
    });
    expect(got.errors).toEqual([]);
    await client.leave();
  });

  it('takes a draft from POST /studio/draft into this room, and drops it over the socket (S5)', async () => {
    const { client, got, room } = await open();
    const scene = JSON.parse(
      readFileSync(new URL('../../../packages/content/data/scenes/bakery.json', import.meta.url), 'utf8'),
    );
    const post = (roomId: string) =>
      colyseus.http
        .post('/studio/draft', {
          headers: { authorization: `Bearer ${tokenFor()}`, 'content-type': 'application/json' },
          body: JSON.stringify({ roomId, scene }),
        })
        .then(
          (r: { statusCode: number }) => r.statusCode,
          (e: { statusCode?: number }) => e.statusCode,
        );
    expect(await post(client.roomId)).toBe(202);
    expect(await until(() => got.last?.draft === true, 3000)).toBe(true);
    expect(got.last).toMatchObject({ sceneId: 'bakery', tx: 8, ty: 9 });
    expect(room.sim.draft?.scene.id).toBe('bakery');
    // The same 404 for an unknown id, a party room and a Studio room with no owner: room ids can't be probed.
    expect(await post('no-such-room')).toBe(404);
    const party = await lobbyOf(colyseus, 1);
    expect(await post(party.room.roomId)).toBe(404);
    const empty = await colyseus.createRoom('studio', {});
    expect(await post(empty.roomId)).toBe(404);
    expect((empty as unknown as StudioRoom).sim.commands).toEqual([]);
    client.send(STUDIO_C2S.draft, { scene: null });
    expect(await until(() => got.last?.draft === false, 3000)).toBe(true);
    expect(got.lines.some((l) => l.endsWith('draft bakery dropped'))).toBe(true);
    expect(got.errors).toEqual([]);
    await client.leave();
  });

  it('pauses, single-steps exactly and resumes', async () => {
    const { client, got, room } = await open();
    client.send(STUDIO_C2S.clock, { paused: true });
    expect(await until(() => got.last?.paused === true, 3000)).toBe(true);
    const frozen = room.sim.tick;
    await sleep(300);
    expect(room.sim.tick).toBe(frozen);
    client.send(STUDIO_C2S.clock, { step: 3 });
    expect(await until(() => room.sim.tick === frozen + 3, 3000)).toBe(true);
    await sleep(200);
    expect(room.sim.tick).toBe(frozen + 3);
    client.send(STUDIO_C2S.clock, { paused: false, scale: 10 });
    expect(await until(() => room.sim.tick > frozen + 50, 3000)).toBe(true);
    await client.leave();
  });

  it('refuses a bad command with a 422 and ignores an admin or party command', async () => {
    const { client, got, room } = await open();
    client.send(STUDIO_C2S.give, null);
    client.send(STUDIO_C2S.give, { itemId: 'lightsaber' });
    client.send(STUDIO_C2S.teleport, { sceneId: 'atlantis', spawnId: 'door' });
    client.send(STUDIO_C2S.portal, { portalId: 'nowhere' });
    client.send('admin.clock', { scale: 10 });
    client.send('lobby.start', {});
    expect(await until(() => got.errors.length === 4, 3000)).toBe(true);
    await sleep(200);
    expect(got.errors).toEqual([
      '422 bad payload',
      '422 no such item',
      '422 no such scene',
      '422 no such door',
    ]);
    expect(got.last?.items).toEqual([]);
    expect(room.sim.clock.scale).toBe(1);
    await client.leave();
  });

  it('is a separate room from a party room, which never sees a studio message', async () => {
    const party = await lobbyOf(colyseus, 1);
    const { client } = await open();
    expect(client.roomId).not.toBe(party.room.roomId);
    const human = party.humans[0]!;
    human.room.send(STUDIO_C2S.noclip, { on: true });
    await sleep(300);
    expect(human.log.filter((m) => m.type.startsWith('studio.'))).toEqual([]);
    await client.leave();
  });
});
