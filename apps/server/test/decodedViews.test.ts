import type { ColyseusTestServer } from '@colyseus/testing';
import { TICK_RATE } from '@wdi/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PartyRoom } from '../src/rooms/PartyRoom';
import { applyClock, enableAuto, queueAutoStart } from '../src/sim/auto/Auto';
import { registeredInvariants } from '../src/sim/auto/invariants';
import { attachShadowViews, shadowViewsOf } from '../src/sim/auto/shadowViews';
import { isWorldPhase } from '../src/sim/World';
import { bootAutoServer, runAutoMatch } from './autoHelpers';
import { advance } from './npcHelpers';

/**
 * Round 10, x14 (A453, GDD 3.19 "Decoded views"): each seat of an auto match run with `--views` holds a shadow view
 * whose frames a `Decoder` reads; the invariant compares what the seat decoded with what the server shows it.
 */
let colyseus: ColyseusTestServer;
beforeAll(async () => {
  colyseus = await bootAutoServer();
});
afterAll(async () => {
  await colyseus.shutdown();
});

const seats = 5;

/** A party of NPC seats with shadows attached, stepped into the world until a seat has decoded an avatar. */
async function worldWithShadows() {
  const room = (await colyseus.createRoom('party', {})) as unknown as PartyRoom;
  enableAuto(room, { map: 'hollowmere', seats, difficulty: 'normal' });
  const shadows = attachShadowViews(room);
  applyClock(room, { paused: true });
  queueAutoStart(room);
  const party = { humans: [], room };
  const decodedAvatars = () =>
    shadows.shadows.flatMap(({ decoder }) =>
      [...decoder.state.scenes.values()].flatMap((scene) => [...scene.avatars.keys()]),
    );
  for (let i = 0; i < 400 * TICK_RATE; i++) {
    advance(party, 1); // every step patches (x7, A373), and the patch feeds the shadows
    if (shadows.encodedTick !== room.state.tick) room.broadcastPatch();
    if (isWorldPhase(room.state.phase) && decodedAvatars().length > 0) break;
  }
  return { room, shadows, decodedAvatars };
}

describe('the decoded views of an auto match', () => {
  it('decodes a view per seat that agrees with the server, and reports a planted disagreement', async () => {
    const { room, shadows, decodedAvatars } = await worldWithShadows();
    try {
      expect(shadows.shadows).toHaveLength(seats);
      expect(isWorldPhase(room.state.phase)).toBe(true);
      expect(decodedAvatars().length).toBeGreaterThan(0);
      expect(shadowViewsOf(room)).toBe(shadows);
      expect(registeredInvariants()).toContain('decodedViews'); // registered by the attach, not on import
      expect(shadows.check()).toBeNull();
      expect(shadows.checks).toBeGreaterThan(0);

      // The server moved and the seat did not hear: direction 1 (the decoded state against the server).
      const shadow = shadows.shadows.find(({ decoder }) =>
        [...decoder.state.scenes.values()].some((scene) => scene.avatars.size > 0),
      )!;
      const [sceneId, scene] = [...shadow.decoder.state.scenes].find(([, s]) => s.avatars.size > 0)!;
      const [handle, avatar] = [...scene.avatars][0]!;
      const x = avatar.x;
      avatar.x = x + 1;
      expect(shadows.check()?.detail).toMatch(
        new RegExp(`seat ${shadow.sessionId} decoded avatar ${handle} at `),
      );
      avatar.x = x;
      expect(shadows.check()).toBeNull();

      // The view shows an avatar the seat never decoded: direction 2 (the server against the decoded state).
      scene.avatars.delete(handle);
      expect(shadows.check()?.detail).toBe(
        `seat ${shadow.sessionId} shows avatar ${handle} in ${sceneId}, which it has not decoded`,
      );

      // A stale tick is a failure of its own, read before the avatars: the shadows must hold the frame of this very
      // tick. Since x7 (A373) every step patches, so a step cannot leave a shadow behind; only a dropped frame could.
      shadow.decoder.state.tick = room.state.tick - 1;
      expect(shadows.check()?.detail).toMatch(/decoded tick/);
    } finally {
      shadows.dispose();
      expect(shadowViewsOf(room)).toBeUndefined();
      await room.disconnect();
    }
  });

  it('sends the first frame from a whole buffer: no overflow warning from the encoder', async () => {
    // `encodeAll` returns the frame as a subarray of the buffer it filled. A harness that kept that subarray as its
    // buffer overflowed it on every shadow's first frame: the encoder grows and retries, so the frames were right and
    // the run clean, with a warning per seat.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { room, shadows } = await worldWithShadows();
      shadows.dispose();
      await room.disconnect();
      expect(warn.mock.calls.filter((call) => String(call[0]).includes('buffer overflow'))).toEqual([]);
    } finally {
      warn.mockRestore();
    }
  });

  it('runs clean through the harness with `views` and compares avatars every check', async () => {
    const r = await runAutoMatch(colyseus, {
      map: 'hollowmere',
      seats,
      difficulty: 'normal',
      maxTicks: 300 * TICK_RATE,
      views: true,
    });
    expect(r.failures).toEqual([]);
    expect(r.decodedChecks).toBeGreaterThan(0);
    expect(r.ticks).toBeGreaterThan(0);
  }, 60_000);

  it('compares nothing with `views` off', async () => {
    const r = await runAutoMatch(colyseus, {
      map: 'hollowmere',
      seats,
      difficulty: 'normal',
      maxTicks: 20 * TICK_RATE,
    });
    expect(r.decodedChecks).toBe(0);
    expect(r.failures).toEqual([]);
  });
});
