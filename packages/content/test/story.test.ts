import { describe, expect, it } from 'vitest';
import { content, STORY_STREAMS, StoryFile, validateContent, type Content } from '../src/index.js';

// Story mode (docs/story/README.md 1): the schema and the cross-file checks of story.json.

const storyId = 'hollowmere_winter';

function broken(edit: (c: Content) => void): string[] {
  const copy = structuredClone(content);
  edit(copy);
  return validateContent(copy).filter((e) => e.startsWith('story.json'));
}

const chapter = (c: Content, n = 0) => c.story.stories[storyId]!.chapters[n]!;

describe('story.json', () => {
  it('ships valid, three chapters in play order, each a different card', () => {
    expect(broken(() => undefined)).toEqual([]);
    const story = content.story.stories[storyId]!;
    expect(story.chapters.map((c) => c.id)).toEqual(['ch1_baker', 'ch2_watchman', 'ch3_bandit']);
    expect(story.chapters.map((c) => c.roleId)).toEqual(['baker', 'watchman', 'thief']);
    expect(story.mapId).toBe('hollowmere');
  });

  it('fixes a seed for every stream, and only those', () => {
    const words = content.story.stories[storyId]!.seedWords;
    expect(Object.keys(words).sort()).toEqual([...STORY_STREAMS].sort());
    expect(new Set(Object.values(words).map((w) => w.join(','))).size).toBe(STORY_STREAMS.length);
  });

  it('rejects a seed missing a stream', () => {
    const errs = broken((c) => delete c.story.stories[storyId]!.seedWords.hitman);
    expect(errs).toEqual([expect.stringContaining('lacks stream hitman')]);
  });

  it('rejects a repeated beat id, an unknown role, cutscene and goal', () => {
    expect(broken((c) => chapter(c).beats.push({ ...chapter(c).beats[0]! }))).toEqual([
      expect.stringContaining('repeated beat id'),
    ]);
    expect(broken((c) => (chapter(c).roleId = 'bandit'))).toEqual([
      expect.stringContaining('unknown role bandit'),
    ]);
    expect(broken((c) => (chapter(c).beats[0]!.action = { cutscene: 'noSuchScene' }))).toEqual([
      expect.stringContaining('unknown cutscene noSuchScene'),
    ]);
    expect(broken((c) => (chapter(c).beats[1]!.action = { card: 'beat', line: 'x', goal: 'gNone' }))).toEqual(
      [expect.stringContaining('unknown goal gNone')],
    );
  });

  it('rejects an unknown scene, spawn and clue kind in a spawn action', () => {
    const spawnAt = (kind: string, at: string) => (c: Content) =>
      (chapter(c).beats[0]!.action = { spawn: { kind, at } });
    expect(broken(spawnAt('scratch', 'nowhere'))).toEqual([expect.stringContaining('unknown scene nowhere')]);
    expect(broken(spawnAt('scratch', 'bakery:nope'))).toEqual([expect.stringContaining('no spawn nope')]);
    expect(broken(spawnAt('unicorn', 'bakery'))).toEqual([expect.stringContaining('no clue or item')]);
  });

  it('rejects a goal nothing can complete', () => {
    const errs = broken((c) => chapter(c).goals.push({ id: 'gOrphan', text: 'Never' }));
    expect(errs).toEqual([expect.stringContaining('goal gOrphan has no trigger')]);
  });

  it('rejects an empty all/any and a chapter that goes back in time', () => {
    const copy = structuredClone(content.story);
    copy.stories[storyId]!.chapters[0]!.beats[0]!.trigger = { all: [] };
    expect(StoryFile.safeParse(copy).success).toBe(false);
    const errs = broken((c) => {
      chapter(c, 0).startPhase.cycle = 3;
    });
    expect(errs).toEqual([expect.stringContaining('ch2_watchman: starts at cycle 1, before ch1_baker')]);
  });

  it('keeps a card to a screen of words', () => {
    for (const ch of content.story.stories[storyId]!.chapters) {
      for (const text of [ch.title, ch.setup, ...ch.end.lines, ch.end.failedLine])
        expect(text.length).toBeLessThanOrEqual(280);
    }
  });
});
