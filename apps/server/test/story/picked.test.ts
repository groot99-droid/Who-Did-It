import { type ArcStory, type Trigger, storyArc } from '@wdi/content';
import type { ColyseusTestServer } from '@colyseus/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootAutoServer } from '../autoHelpers';
import { emitSim } from '../../src/sim/events/bus';
import { chaptersEnded, chaptersStarted, humanSeat, play, startStoryRoom } from './fixture';

// Read and pick events (docs/story/arc.md E9, GDD 3.34): `story.picked { lock }` for the player ends a section. The
// runner's inbox lets `story.picked` through (like `story.enter` and `story.pickup`) and still drops its own outputs.

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  colyseus = await bootAutoServer();
});
afterAll(async () => colyseus.shutdown());

const REAL = storyArc.stories.hollowmere_winter!;
const ID = 'picked_probe';

function probe(): ArcStory {
  const chapter = REAL.chapters[0]!;
  const [a] = chapter.sections;
  const { endCard: _drop, ...rest } = a!;
  const end: Trigger = {
    any: [{ event: 'story.picked', seat: 'player', data: { lock: 'mu.study_door' } }, { tick: 100000 }],
  };
  return {
    ...REAL,
    id: ID,
    chapters: [
      {
        ...chapter,
        id: 'pk_a',
        cast: undefined,
        sections: [
          {
            ...rest,
            goals: [{ id: 'g1', text: 'Open the door', trigger: end }],
            beats: [
              {
                id: 'b1',
                trigger: { tick: 0 },
                action: { card: 'beat' as const, line: 'Wait.' },
                oncePerChapter: true as const,
              },
            ],
            end,
          },
        ],
      },
    ],
  };
}

describe('story.picked', () => {
  it('ends a section on the player opening the named lock, and not on another seat or lock', async () => {
    storyArc.stories[ID] = probe();
    try {
      const sr = await startStoryRoom(colyseus, { storyId: ID, invariantsEvery: 50 });
      const me = humanSeat(sr);
      const other = [...sr.room.state.players.keys()].find((id) => id !== me)!;
      play(sr, { maxTicks: 600, until: (r) => chaptersStarted(r).length >= 1 && r.answered >= 1 });
      emitSim(sr.room, {
        tick: sr.room.state.tick,
        kind: 'story.picked',
        seat: other,
        data: { lock: 'mu.study_door' },
      });
      emitSim(sr.room, {
        tick: sr.room.state.tick,
        kind: 'story.picked',
        seat: me,
        data: { lock: 'other.door' },
      });
      play(sr, { maxTicks: 40 });
      expect(chaptersEnded(sr)).toHaveLength(0);
      emitSim(sr.room, {
        tick: sr.room.state.tick,
        kind: 'story.picked',
        seat: me,
        data: { lock: 'mu.study_door' },
      });
      play(sr, { maxTicks: 100, until: (r) => chaptersEnded(r).length >= 1 });
      expect(chaptersEnded(sr)).toHaveLength(1);
      expect(sr.failures).toEqual([]);
    } finally {
      delete storyArc.stories[ID];
    }
  });
});
