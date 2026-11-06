import { describe, expect, it } from 'vitest';
import { STORY_ID, StoryDigest, enableStory, loadStoryFile, storyDef, storyReady } from './fixture';

// The fixture's own checks: they run before the engine and the content exist, and keep running after.
// `WDI_STORY_REQUIRED=1` (CI turns it on once S1 and S2 have merged) turns "not there yet" into a failure, so the
// story suites cannot be skipped by accident after the integration lands.

describe('the story test fixture', () => {
  it('knows whether the story content and engine are in', () => {
    expect(typeof storyReady()).toBe('boolean');
    if (process.env.WDI_STORY_REQUIRED === '1') {
      expect(enableStory, 'S2 has not merged enableStory').not.toBeNull();
      expect(storyDef(), `S1 has not merged story.json with ${STORY_ID}`).not.toBeNull();
    }
  });

  it('reads story.json by the README shape when it exists', () => {
    const stories = loadStoryFile();
    if (stories === null) return;
    const def = storyDef();
    if (def === null) return;
    expect(def.id).toBe(STORY_ID);
    expect(def.roster.humanSeat).toBe(0);
    expect(def.chapters.length).toBeGreaterThanOrEqual(3);
    const ids = def.chapters.flatMap((c) => c.beats.map((b) => `${c.id}/${b.id}`));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('a digest is a pure function of what it is fed', () => {
    const a = new StoryDigest();
    const b = new StoryDigest();
    // Neither has a room to hash: finishing both on an empty run must agree.
    const empty = { cards: [], events: [] } as never;
    expect(a.finish(empty)).toBe(b.finish(empty));
  });
});
