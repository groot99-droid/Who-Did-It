import { type ArcStory, type Trigger, storyArc } from '@wdi/content';
import { Phase } from '@wdi/shared';
import type { ColyseusTestServer } from '@colyseus/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootAutoServer } from '../autoHelpers';
import { setPhase } from '../../src/sim/Flow';
import { handleNightPower } from '../../src/sim/NightPowers';
import { chaptersEnded, chaptersStarted, humanSeat, play, startStoryRoom } from './fixture';

// Night-power events (docs/story/arc.md E8, GDD 3.34): a night power used by a seat emits `nightPower {ability}` with
// the user's seat, so a section can end on "the player heard a confession".

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  colyseus = await bootAutoServer();
});
afterAll(async () => colyseus.shutdown());

const REAL = storyArc.stories.hollowmere_winter!;
const ID = 'nightpower_probe';

function probe(): ArcStory {
  const chapter = REAL.chapters[0]!;
  const [a, b] = chapter.sections;
  const short = (s: NonNullable<typeof a>, extra: object, end: Trigger) => {
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
      end,
    };
  };
  return {
    ...REAL,
    id: ID,
    chapters: [
      {
        ...chapter,
        id: 'np_a',
        cast: undefined,
        sections: [
          short(a!, {}, { tick: 40 }),
          {
            ...short(
              b!,
              { roleId: 'vicar', startPhase: { cycle: 1, part: 'night' } },
              {
                any: [
                  { event: 'nightPower', seat: 'player', data: { ability: 'confession' } },
                  { tick: 100000 },
                ],
              },
            ),
            id: 'np_b',
          },
        ],
      },
    ],
  };
}

describe('night-power events', () => {
  it('ends a section on the player hearing a confession', async () => {
    storyArc.stories[ID] = probe();
    try {
      const sr = await startStoryRoom(colyseus, { storyId: ID, invariantsEvery: 50 });
      const me = humanSeat(sr);
      play(sr, {
        maxTicks: 3000,
        until: (r) => chaptersStarted(r).length >= 2 && r.answered >= r.cards.length,
      });
      setPhase(sr.room, Phase.night, 600);
      play(sr, { maxTicks: 5 }); // a night
      expect(sr.room.state.phase).toBe(Phase.night);
      expect(chaptersEnded(sr)).toHaveLength(1);
      const target = [...sr.room.state.players.keys()].find((id) => id !== me)!;
      handleNightPower(sr.room, me, { abilityId: 'confession', targetId: target });
      play(sr, { maxTicks: 200, until: (r) => chaptersEnded(r).length >= 2 });
      const heard = sr.events.find((e) => e.kind === 'nightPower');
      expect(heard).toMatchObject({ seat: me, data: { ability: 'confession', target } });
      expect(chaptersEnded(sr)).toHaveLength(2);
      expect(sr.failures).toEqual([]);
    } finally {
      delete storyArc.stories[ID];
    }
  });
});
