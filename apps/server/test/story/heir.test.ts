import { type ArcStory, storyArc } from '@wdi/content';
import type { ColyseusTestServer } from '@colyseus/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootAutoServer } from '../autoHelpers';
import { markDead } from '../../src/sim/Death';
import { chaptersStarted, humanRole, play, startStoryRoom } from './fixture';

// The heir section (docs/story/arc.md E6, GDD 3.34): a section with `startWhen` waits after the previous one ends,
// the player keeping the card they hold, until the trigger holds. `runInherit` emits `inherit` for it.

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  colyseus = await bootAutoServer();
});
afterAll(async () => colyseus.shutdown());

const REAL = storyArc.stories.hollowmere_winter!;
const ID = 'heir_probe';
const FALLBACK = 3000;

function probe(): ArcStory {
  const chapter = REAL.chapters[0]!;
  const [a, b] = chapter.sections;
  const short = (s: NonNullable<typeof a>, extra: object, end: number) => {
    const { endCard: _drop, ...rest } = s;
    return {
      ...rest,
      ...extra,
      goals: [{ id: 'g1', text: 'Wait', trigger: { tick: 10 } }],
      beats: [
        {
          id: 'b1',
          trigger: { tick: 0 },
          action: { card: 'beat' as const, line: 'Wait.' },
          oncePerChapter: true as const,
        },
      ],
      end: { tick: end },
    };
  };
  return {
    ...REAL,
    id: ID,
    chapters: [
      {
        ...chapter,
        id: 'heir_a',
        cast: undefined,
        sections: [
          short(a!, {}, 40),
          {
            ...short(
              b!,
              { roleId: 'heir', startWhen: { any: [{ event: 'inherit' }, { tick: FALLBACK }] } },
              100000,
            ),
            id: 'heir_b',
          },
        ],
      },
    ],
  };
}

const killerSeat = (sr: Awaited<ReturnType<typeof startStoryRoom>>): string =>
  [...sr.room.state.players].find(([, p]) => p.priv.role.roleId === 'killer')![0];

describe('the heir section', () => {
  it('starts when a seat inherits the Knife, not before', async () => {
    storyArc.stories[ID] = probe();
    try {
      const sr = await startStoryRoom(colyseus, { storyId: ID, invariantsEvery: 50 });
      play(sr, { maxTicks: 600, until: (r) => chaptersStarted(r).length >= 1 && r.answered >= 1 });
      play(sr, { maxTicks: 400, until: (r) => r.events.some((e) => e.kind === 'story.chapterEnd') });
      play(sr, { maxTicks: 200 }); // the wait: nothing starts
      expect(chaptersStarted(sr)).toHaveLength(1);
      markDead(sr.room, killerSeat(sr), 'knife');
      play(sr, { maxTicks: 600, until: (r) => chaptersStarted(r).length >= 2, invariantsEvery: 50 });
      expect(chaptersStarted(sr)).toHaveLength(2);
      expect(sr.events.some((e) => e.kind === 'inherit')).toBe(true);
      expect(humanRole(sr)).toBe('heir');
      expect(sr.failures).toEqual([]);
    } finally {
      delete storyArc.stories[ID];
    }
  });

  it('starts on the fallback tick when nobody inherits', async () => {
    storyArc.stories[ID] = probe();
    try {
      const sr = await startStoryRoom(colyseus, { storyId: ID, invariantsEvery: 50 });
      play(sr, { maxTicks: 4000, until: (r) => chaptersStarted(r).length >= 2, invariantsEvery: 50 });
      const ends = sr.events.filter((e) => e.kind === 'story.chapterEnd');
      const starts = sr.events.filter((e) => e.kind === 'story.chapterStart');
      expect(starts).toHaveLength(2);
      expect(starts[1]!.tick - ends[0]!.tick).toBeGreaterThanOrEqual(FALLBACK);
      expect(sr.events.some((e) => e.kind === 'inherit')).toBe(false);
    } finally {
      delete storyArc.stories[ID];
    }
  });
});
