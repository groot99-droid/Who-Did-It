import { type ArcStory, storyArc } from '@wdi/content';
import type { ColyseusTestServer } from '@colyseus/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootAutoServer } from '../autoHelpers';
import { chaptersStarted, humanRole, humanSeatCount, play, startStoryRoom } from './fixture';
import { STORY_MAX_TICKS } from './suite';

// The cast (docs/story/arc.md E2, GDD 3.34): a chapter names the cards at the table. After the player's own card has
// moved, every card of the cast has a seat: an NPC seat whose card the cast does not name takes it as a newcomer.

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  colyseus = await bootAutoServer();
});
afterAll(async () => colyseus.shutdown());

const REAL = storyArc.stories.hollowmere_winter!;
const ID = 'cast_probe';
const CAST_A = ['baker', 'watchman', 'thief', 'butler', 'killer', 'vicar', 'doctor', 'herbalist'];
const CAST_B = ['watchman', 'baker', 'ranger', 'drifter', 'killer', 'fisher', 'doctor', 'herbalist'];

function probe(): ArcStory {
  const [baker, watchman] = REAL.chapters[0]!.sections;
  const chapter = REAL.chapters[0]!;
  const short = (s: NonNullable<typeof baker>) => {
    const { endCard: _drop, ...rest } = s;
    return {
      ...rest,
      goals: [{ id: 'g1', text: 'Wait a moment', trigger: { tick: 10 } }],
      beats: [
        {
          id: 'b1',
          trigger: { tick: 0 },
          action: { card: 'beat' as const, line: 'Wait.' },
          oncePerChapter: true as const,
        },
      ],
      end: { tick: 40 },
    };
  };
  return {
    ...REAL,
    id: ID,
    chapters: [
      { ...chapter, id: 'cast_a', cast: CAST_A, sections: [short(baker!)] },
      { ...chapter, id: 'cast_b', cast: CAST_B, sections: [short(watchman!)] },
    ],
  };
}

const table = (sr: Awaited<ReturnType<typeof startStoryRoom>>): string[] =>
  [...sr.room.state.players.values()].map((p) => p.priv.role.roleId).sort();

describe('the cast', () => {
  it('seats every card of the chapter at the table, at the start and at each break', async () => {
    storyArc.stories[ID] = probe();
    try {
      const sr = await startStoryRoom(colyseus, { storyId: ID, invariantsEvery: 20 });
      play(sr, { maxTicks: 600, until: (r) => chaptersStarted(r).length >= 1 });
      expect(table(sr)).toEqual([...CAST_A].sort());
      expect(humanRole(sr)).toBe('baker');

      play(sr, {
        maxTicks: STORY_MAX_TICKS,
        until: (r) => chaptersStarted(r).length >= 2,
        invariantsEvery: 20,
      });
      expect(table(sr)).toEqual([...CAST_B].sort()); // the Thief, Butler and Vicar leave; Ranger, Drifter and Fisher arrive
      expect(humanRole(sr)).toBe('watchman');
      expect(humanSeatCount(sr)).toBe(1);

      // A cover newcomer walks as a card of the cast that is not a cover card, in public and in its own view.
      const drifter = [...sr.room.state.players.values()].find((p) => p.priv.role.roleId === 'drifter')!;
      expect(drifter.priv.coverLook).not.toBe('');
      expect(drifter.look).toBe(drifter.priv.coverLook);
      expect(
        CAST_B.some((c) => c !== 'drifter' && c !== 'killer' && c !== 'accomplice' && c !== 'thief'),
      ).toBe(true);
      expect(sr.failures).toEqual([]);
    } finally {
      delete storyArc.stories[ID];
    }
  });

  it('leaves the table as dealt when a chapter names no cast', async () => {
    const sr = await startStoryRoom(colyseus, { invariantsEvery: 50 });
    play(sr, { maxTicks: 600, until: (r) => chaptersStarted(r).length >= 1 });
    expect(table(sr)).toHaveLength(8);
    expect(sr.failures).toEqual([]);
  });
});
