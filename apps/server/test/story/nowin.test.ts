import { type ArcStory, storyArc } from '@wdi/content';
import { Phase } from '@wdi/shared';
import type { ColyseusTestServer } from '@colyseus/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootAutoServer } from '../autoHelpers';
import { endMatch } from '../../src/sim/Win';
import { chaptersEnded, chaptersStarted, play, startStoryRoom } from './fixture';

// No early win (docs/story/arc.md E3, GDD 3.34): a match win before the story's last section ends the running section
// as done and the story moves on; only the last section's win ends the match.

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  colyseus = await bootAutoServer();
});
afterAll(async () => colyseus.shutdown());

const REAL = storyArc.stories.hollowmere_winter!;
const ID = 'nowin_probe';

function probe(): ArcStory {
  const chapter = REAL.chapters[0]!;
  const [a, b] = chapter.sections;
  const slow = (s: NonNullable<typeof a>) => {
    const { endCard: _drop, ...rest } = s;
    return {
      ...rest,
      goals: [{ id: 'g1', text: 'Wait', trigger: { tick: 10 } }],
      beats: [
        {
          id: 'b1',
          trigger: { tick: 0 },
          action: { card: 'beat' as const, line: 'Wait.' },
          oncePerChapter: true as const,
        },
      ],
      end: { tick: 100000 }, // only a win (or the harness) ends it
    };
  };
  return {
    ...REAL,
    id: ID,
    chapters: [{ ...chapter, id: 'nowin_a', cast: undefined, sections: [slow(a!), slow(b!)] }],
  };
}

describe('no early win', () => {
  it('holds a win before the last section, and lets the last section end the match', async () => {
    storyArc.stories[ID] = probe();
    try {
      const sr = await startStoryRoom(colyseus, { storyId: ID, invariantsEvery: 50 });
      play(sr, { maxTicks: 600, until: (r) => chaptersStarted(r).length >= 1 && r.answered >= 1 });
      endMatch(sr.room, 'village');
      expect(sr.room.state.phase).not.toBe(Phase.gameOver);
      play(sr, { maxTicks: 1200, until: (r) => chaptersStarted(r).length >= 2 });
      expect(chaptersEnded(sr)).toHaveLength(1);
      expect(sr.events.some((e) => e.kind === 'story.win')).toBe(true);
      const ended = sr.events.find((e) => e.kind === 'story.chapterEnd');
      expect(ended?.data).toMatchObject({ failed: false, replay: false });
      expect(sr.room.state.phase).not.toBe(Phase.gameOver);

      // The last section: the win is the match's.
      play(sr, { maxTicks: 600, until: (r) => r.answered >= r.cards.length });
      endMatch(sr.room, 'cabal');
      expect(sr.room.state.phase).toBe(Phase.gameOver);
      expect(sr.failures).toEqual([]);
    } finally {
      delete storyArc.stories[ID];
    }
  });
});
