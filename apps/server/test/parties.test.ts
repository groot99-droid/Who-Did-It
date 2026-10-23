import { ColyseusTestServer, boot } from '@colyseus/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  BUILD_VERSION,
  JOIN_ERROR_CODE,
  JOIN_ERROR_MESSAGE,
  ROOM_CODE_ALPHABET,
  type CreateOptions,
  type GameStateType,
} from '@wdi/shared';
import { balance } from '@wdi/content';
import { createServer } from '../src/server';

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
