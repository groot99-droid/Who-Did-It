import { STORY_STREAMS } from '@wdi/content';
import { describe, expect, it } from 'vitest';
import { AUTO_STREAMS } from '../autoHelpers';
import { loadStoryFile } from './fixture';

// DECISIONS A401: `STORY_STREAMS` (@wdi/content) repeats `AUTO_STREAMS` (sim/auto/Auto.ts), because content cannot
// import the server. This test is the one thing that keeps the two lists equal when a stream is added.

describe('the story seed-word streams', () => {
  it('STORY_STREAMS is exactly AUTO_STREAMS', () => {
    expect([...STORY_STREAMS].sort()).toEqual([...AUTO_STREAMS].sort());
  });

  it('every story in story.json fixes a seed word pair for every stream', () => {
    const stories = loadStoryFile();
    expect(stories).not.toBeNull();
    for (const [id, story] of Object.entries(stories ?? {})) {
      expect(Object.keys(story.seedWords).sort(), id).toEqual([...AUTO_STREAMS].sort());
    }
  });
});
