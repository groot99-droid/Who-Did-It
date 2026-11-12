import type { ColyseusTestServer } from '@colyseus/testing';
import { TICK_RATE } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, vi } from 'vitest';
import { bootAutoServer } from '../autoHelpers';
import { chaptersReady, storyReady } from './fixture';

/**
 * The shared setup of the story suites: a test server, a cleanup between tests, a long timeout (a story is tens of
 * thousands of synchronous ticks), and a `describe` that skips with a visible reason until S1's content and S2's
 * engine are both in (`fixture.test.ts` fails instead when `WDI_STORY_REQUIRED=1`).
 */
export const STORY_MAX_TICKS = 60 * 60 * TICK_RATE;

/** Needs the content and the engine's opening (title card, pause): runs now. */
export const describeStory = storyReady() ? describe : describe.skip;
/** Needs whole chapters (beat runner, chapter end, seat handover): skips until S2's PRs for them merge. */
export const describeChapters = storyReady() && chaptersReady() ? describe : describe.skip;
/**
 * How long a run plays: the whole story once chapters run, else the opening only (three simulated minutes), which
 * is all the engine plays today and still proves the replay and the private messages.
 */
export const PLAY_TICKS = chaptersReady() ? STORY_MAX_TICKS : 3 * 60 * TICK_RATE;

export function storyServer(): { colyseus: () => ColyseusTestServer } {
  let colyseus: ColyseusTestServer;
  vi.setConfig({ testTimeout: 600_000, hookTimeout: 60_000 });
  beforeAll(async () => {
    process.env.WDI_DEBUG = '1';
    colyseus = await bootAutoServer();
  });
  afterAll(async () => {
    delete process.env.WDI_DEBUG;
    await colyseus.shutdown();
  });
  beforeEach(async () => colyseus.cleanup());
  return { colyseus: () => colyseus };
}
