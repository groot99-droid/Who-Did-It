import type { ColyseusTestServer } from '@colyseus/testing';
import { TICK_RATE } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, vi } from 'vitest';
import { bootAutoServer } from '../autoHelpers';
import { storyReady } from './fixture';

/**
 * The shared setup of the story suites: a test server, a cleanup between tests, a long timeout (a story is tens of
 * thousands of synchronous ticks), and a `describe` that skips with a visible reason until S1's content and S2's
 * engine are both in (`fixture.test.ts` fails instead when `WDI_STORY_REQUIRED=1`).
 */
export const STORY_MAX_TICKS = 60 * 60 * TICK_RATE;

export const describeStory = storyReady() ? describe : describe.skip;

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
