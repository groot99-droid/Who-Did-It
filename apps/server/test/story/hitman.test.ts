import { type ArcStory, storyArc } from '@wdi/content';
import type { ColyseusTestServer } from '@colyseus/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootAutoServer } from '../autoHelpers';
import { isTurned } from '../../src/sim/vendettas/arrival';
import { openContract } from '../../src/sim/vendettas/contract';
import { vendettaOf } from '../../src/sim/vendettas/state';
import { chaptersStarted, humanSeat, play, startStoryRoom } from './fixture';

// A fixed Hitman (docs/story/arc.md E5, GDD 3.34): a section turns the player's seat at its start, and the contract's
// mark is the seat holding the section's `mark` card. The next section releases the seat.

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  colyseus = await bootAutoServer();
});
afterAll(async () => colyseus.shutdown());

const REAL = storyArc.stories.hollowmere_winter!;
const ID = 'hitman_probe';

function probe(): ArcStory {
  const chapter = REAL.chapters[0]!;
  const [a, b] = chapter.sections;
  const short = (s: NonNullable<typeof a>, extra: object) => {
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
      end: { tick: 60 },
    };
  };
  return {
    ...REAL,
    id: ID,
    chapters: [
      {
        ...chapter,
        id: 'hm_a',
        cast: undefined,
        sections: [
          short(a!, {}),
          {
            ...short(b!, { roleId: 'gamekeeper', vendetta: 'hitman', hitman: { mark: 'killer' } }),
            id: 'hm_b',
          },
          { ...short(a!, {}), id: 'hm_c' },
        ],
      },
    ],
  };
}

describe('a fixed Hitman', () => {
  it('turns the player with the Killer as the mark, and lets go at the next section', async () => {
    storyArc.stories[ID] = probe();
    try {
      const sr = await startStoryRoom(colyseus, { storyId: ID, invariantsEvery: 20 });
      const me = humanSeat(sr);
      play(sr, { maxTicks: 2000, until: (r) => chaptersStarted(r).length >= 2, invariantsEvery: 20 });
      const killer = [...sr.room.state.players].find(([, p]) => p.priv.role.roleId === 'killer')![0];
      expect(isTurned(sr.room, me)).toBe(true);
      expect(sr.room.state.players.get(me)!.priv.hitman).toBe(true);
      expect(vendettaOf(sr.room, me)?.id).toBe('hitman');
      expect(openContract(sr.room, me)?.target).toBe(killer);

      play(sr, { maxTicks: 2000, until: (r) => chaptersStarted(r).length >= 3, invariantsEvery: 20 });
      expect(isTurned(sr.room, me)).toBe(false);
      expect(sr.room.state.players.get(me)!.priv.hitman).toBe(false);
      expect(openContract(sr.room, me)).toBeNull();
      expect(sr.failures).toEqual([]);
    } finally {
      delete storyArc.stories[ID];
    }
  });
});
