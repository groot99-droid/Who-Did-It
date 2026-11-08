import { type ArcStory, storyArc } from '@wdi/content';
import type { ColyseusTestServer } from '@colyseus/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootAutoServer } from '../autoHelpers';
import { vendettaOf } from '../../src/sim/vendettas/state';
import { chaptersStarted, humanSeat, play, startStoryRoom } from './fixture';

// The NPC Killer's vendetta (docs/story/arc.md E4, GDD 3.34): the Killer the player meets already holds the section's
// vendetta, and the player who takes the card at the next break takes the vendetta with it.

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  colyseus = await bootAutoServer();
});
afterAll(async () => colyseus.shutdown());

const REAL = storyArc.stories.hollowmere_winter!;
const ID = 'npcvendetta_probe';

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
      end: { tick: 40 },
    };
  };
  return {
    ...REAL,
    id: ID,
    chapters: [
      {
        ...chapter,
        id: 'nv_a',
        cast: undefined,
        sections: [
          short(a!, { npcVendetta: 'bandit' }),
          short(b!, { roleId: 'killer', vendetta: undefined }),
        ],
      },
    ],
  };
}

const killerSeat = (sr: Awaited<ReturnType<typeof startStoryRoom>>): string | undefined =>
  [...sr.room.state.players].find(([, p]) => p.priv.role.roleId === 'killer')?.[0];

describe('the NPC Killer vendetta', () => {
  it('holds the section vendetta, and hands it to the player with the card', async () => {
    storyArc.stories[ID] = probe();
    try {
      const sr = await startStoryRoom(colyseus, { storyId: ID, invariantsEvery: 20 });
      play(sr, { maxTicks: 600, until: (r) => chaptersStarted(r).length >= 1 });
      const npc = killerSeat(sr)!;
      expect(npc).not.toBe(humanSeat(sr));
      expect(vendettaOf(sr.room, npc)?.id).toBe('bandit');

      play(sr, { maxTicks: 2000, until: (r) => chaptersStarted(r).length >= 2, invariantsEvery: 20 });
      expect(killerSeat(sr)).toBe(humanSeat(sr));
      expect(vendettaOf(sr.room, humanSeat(sr))?.id).toBe('bandit');
      expect(sr.failures).toEqual([]);
    } finally {
      delete storyArc.stories[ID];
    }
  });
});
