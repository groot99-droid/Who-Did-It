import { ColyseusTestServer, boot } from '@colyseus/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  BUILD_VERSION,
  C2S,
  JOIN_ERROR_CODE,
  JOIN_ERROR_MESSAGE,
  ROOM_CODE_ALPHABET,
  type CreateOptions,
  type GameStateType,
  type PartyListing,
} from '@wdi/shared';
import { balance } from '@wdi/content';
import { runSwarm } from '../../../tools/bots/swarm';
import { createServer } from '../src/server';
import { installMatchmakeGuard } from '../src/services/matchmakeGuard';

// Round 7 (docs/round7/parties.md 3; GDD 3.21): the create options, the profile and the party list.
const code = (seed: string) =>
  Array.from(
    { length: balance.party.profileCodeLength },
    (_, i) => ROOM_CODE_ALPHABET[(seed.charCodeAt(i % seed.length) + i) % ROOM_CODE_ALPHABET.length],
  ).join('');
const opts = (name: string, extra: Partial<CreateOptions> = {}): CreateOptions => ({
  name,
  build: BUILD_VERSION,
  deviceId: `dev-${name}`,
  visibility: 'open',
  ...extra,
});

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

describe('the profile and the create options in onAuth', () => {
  const generic = { code: JOIN_ERROR_CODE, message: JOIN_ERROR_MESSAGE };

  it('puts a valid profile code on the public roster', async () => {
    const profile = code('ada');
    const leader = await colyseus.sdk.create('party', opts('Ada', { profile }));
    const guest = await colyseus.sdk.joinById(leader.roomId, opts('Bob'));
    const state = guest.state as unknown as GameStateType;
    await new Promise((r) => setTimeout(r, 200));
    const rows = [...state.players.values()].map((p) => [p.name, p.profile]);
    expect(rows).toContainEqual(['Ada', profile]);
    expect(rows).toContainEqual(['Bob', '']);
  });

  it.each([
    ['too short', code('x').slice(0, -1)],
    ['too long', `${code('x')}2`],
    ['outside the alphabet', `${code('x').slice(0, -1)}0`],
    ['lower case', 'abcdefgh'.slice(0, balance.party.profileCodeLength)],
    ['not a string', 12345678],
  ])('a profile that is %s is the generic join error', async (_why, profile) => {
    const err = await joinError(() =>
      colyseus.sdk.create('party', opts('Ada', { profile: profile as string })),
    );
    expect(err).toEqual(generic);
  });

  it('an unknown visibility is the generic join error', async () => {
    const err = await joinError(() =>
      colyseus.sdk.create('party', opts('Ada', { visibility: 'secret' as 'open' })),
    );
    expect(err).toEqual(generic);
  });

  it('an invited list over the cap, with a bad entry, or not a list is the generic join error', async () => {
    const tooMany = Array.from({ length: balance.party.invitedMax + 1 }, (_, i) => code(`f${i}`));
    for (const invited of [tooMany, [code('ok'), 'short'], 'nope' as unknown as string[]]) {
      const err = await joinError(() =>
        colyseus.sdk.create('party', opts('Ada', { visibility: 'private', invited })),
      );
      expect(err).toEqual(generic);
    }
    const full = Array.from({ length: balance.party.invitedMax }, (_, i) => code(`f${i}`));
    const ok = await colyseus.sdk.create('party', opts('Ada', { visibility: 'private', invited: full }));
    expect(ok.roomId).toBeTruthy();
  });
});

// --- The listing (`GET /parties`, GDD 3.21) -----------------------------------------------------

const PORT = 2568; // @colyseus/testing default
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const LISTING_KEYS = ['code', 'leader', 'map', 'max', 'mode', 'players', 'visibility'];

async function fetchParties(profile?: string): Promise<PartyListing[]> {
  const url = `http://localhost:${PORT}/parties${profile === undefined ? '' : `?profile=${profile}`}`;
  const res = await fetch(url);
  expect(res.status).toBe(200);
  return ((await res.json()) as { parties: PartyListing[] }).parties;
}

/** The step publishes the metadata; poll until `check` holds or fail with the last list. */
async function until(check: (rows: PartyListing[]) => boolean, profile?: string): Promise<PartyListing[]> {
  let rows: PartyListing[] = [];
  for (let i = 0; i < 40; i++) {
    rows = await fetchParties(profile);
    if (check(rows)) return rows;
    await sleep(50);
  }
  throw new Error(`listing never matched: ${JSON.stringify(rows)}`);
}

describe('the party list', () => {
  it('lists an open party with its leader, seats, mode and map, and nothing else', async () => {
    const leader = await colyseus.sdk.create('party', opts('Ada'));
    const rows = await until((r) => r.some((p) => p.code === leader.roomId));
    const row = rows.find((p) => p.code === leader.roomId) as PartyListing;
    expect(row).toEqual({
      code: leader.roomId,
      leader: 'Ada',
      players: 1,
      max: 10,
      mode: 0,
      map: 'hollowmere',
      visibility: 'open',
    });
    expect(Object.keys(row).sort()).toEqual(LISTING_KEYS);
  });

  it('follows a join, a leader change of map, and a leave', async () => {
    const leader = await colyseus.sdk.create('party', opts('Ada'));
    const guest = await colyseus.sdk.joinById(leader.roomId, opts('Bob'));
    await until((r) => r.find((p) => p.code === leader.roomId)?.players === 2);
    leader.send(C2S.lobbySettings, { map: 'blackpine' });
    await until((r) => r.find((p) => p.code === leader.roomId)?.map === 'blackpine');
    await leader.leave(true);
    const rows = await until((r) => r.find((p) => p.code === leader.roomId)?.leader === 'Bob');
    expect(rows.find((p) => p.code === leader.roomId)?.players).toBe(1);
    await guest.leave(true);
  });

  it('hides a private party from a guest, a stranger and a bad profile, and shows it to an invited profile', async () => {
    const friend = code('friend');
    const stranger = code('stranger');
    const open = await colyseus.sdk.create('party', opts('Open'));
    const priv = await colyseus.sdk.create(
      'party',
      opts('Priv', { visibility: 'private', invited: [friend] }),
    );
    await until((r) => r.some((p) => p.code === open.roomId));

    const none = await fetchParties();
    expect(none.map((p) => p.code)).toEqual([open.roomId]);
    expect((await fetchParties(stranger)).map((p) => p.code)).toEqual([open.roomId]);
    const seen = await fetchParties(friend);
    expect(seen.map((p) => p.code).sort()).toEqual([open.roomId, priv.roomId].sort());
    expect(seen.find((p) => p.code === priv.roomId)?.visibility).toBe('private');
    expect(await fetchParties('bad')).toEqual([]);
    expect(await fetchParties('abcdefgh')).toEqual([]);
  });

  it('ignores the invited list of an open party and lists newest first', async () => {
    const a = await colyseus.sdk.create('party', opts('Aaa'));
    await sleep(15);
    const b = await colyseus.sdk.create('party', opts('Bbb', { invited: [code('x')] }));
    const rows = await until((r) => r.length === 2);
    expect(rows.map((p) => p.code)).toEqual([b.roomId, a.roomId]);
  });

  it('removes a party at Start', async () => {
    const leader = await colyseus.sdk.create('party', opts('Ada'));
    await until((r) => r.some((p) => p.code === leader.roomId));
    leader.send(C2S.lobbyStart, {});
    await until((r) => !r.some((p) => p.code === leader.roomId));
  });

  it('never carries a seat id, a device id, a role or the invited list', async () => {
    const friend = code('friend');
    const leader = await colyseus.sdk.create(
      'party',
      opts('Priv', { visibility: 'private', invited: [friend] }),
    );
    await until((r) => r.some((p) => p.code === leader.roomId), friend);
    const res = await fetch(`http://localhost:${PORT}/parties?profile=${friend}`);
    const body = (await res.json()) as { parties: Record<string, unknown>[] };
    expect(Object.keys(body)).toEqual(['parties']);
    for (const row of body.parties) expect(Object.keys(row).sort()).toEqual(LISTING_KEYS);
    const text = JSON.stringify(body);
    expect(text).not.toContain(leader.sessionId);
    expect(text).not.toContain('dev-Priv');
    expect(text).not.toContain(friend);
    expect(text).not.toMatch(/role|invited|deviceId/);
  });

  it('keeps the swarm out of the list: it creates a private party', async () => {
    const swarm = await runSwarm({ code: '', create: true, count: 2, url: `http://localhost:${PORT}` });
    try {
      expect(swarm.code).toHaveLength(5);
      await sleep(300);
      expect(await fetchParties()).toEqual([]);
    } finally {
      await swarm.stop();
    }
  });

  it('answers 429 once the per-IP bucket of the matchmake guard is empty', async () => {
    const uninstall = installMatchmakeGuard({ ipBurst: 3, ipPerMin: 1, globalPerMin: 1_000_000 });
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 5; i++) statuses.push((await fetch(`http://localhost:${PORT}/parties`)).status);
      expect(statuses).toEqual([200, 200, 200, 429, 429]);
    } finally {
      uninstall();
    }
  });
});
