import { describe, expect, it } from 'vitest';
import { STORY_ID, StoryDigest, chaptersReady, loadStoryFile, storyDef, storyReady } from './fixture';

// The fixture's own checks. S1's content and S2's engine are merged, so the story suites run unconditionally; this
// test fails if either goes missing, so a suite can never be skipped without anyone seeing.

describe('the story test fixture', () => {
  it('has the story content and the engine, so no story suite is skipped', () => {
    expect(storyReady()).toBe(true);
    expect(storyDef(), `story.json has no ${STORY_ID}`).not.toBeNull();
    expect(chaptersReady(), 'the beat runner and the seat handover are in sim/story/').toBe(true);
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
