import { type ArcStory, storyArc } from '@wdi/content';
import { S2C } from '@wdi/shared';
import type { ColyseusTestServer } from '@colyseus/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootAutoServer } from '../autoHelpers';
import { play, startStoryRoom } from './fixture';

// Cutscenes and the bell (docs/story/arc.md E12, GDD 3.34): a `cutscene` action plays for the table, and a `meeting`
// action rings a meeting, whose reveal is where the memorial plays.

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  colyseus = await bootAutoServer();
});
afterAll(async () => colyseus.shutdown());

const REAL = storyArc.stories.hollowmere_winter!;
const ID = 'cutscene_probe';

function probe(): ArcStory {
  const chapter = REAL.chapters[0]!;
  const { endCard: _drop, ...rest } = chapter.sections[0]!;
  return {
    ...REAL,
    id: ID,
    chapters: [
      {
        ...chapter,
        id: 'cs_a',
        cast: undefined,
        sections: [
          {
            ...rest,
            goals: [{ id: 'g1', text: 'Wait', trigger: { tick: 100000 } }],
            beats: [
              {
                id: 'b1',
                trigger: { tick: 5 },
                action: { seq: [{ cutscene: 'deathKnife' }, { meeting: true }] },
                oncePerChapter: true as const,
              },
            ],
            end: { tick: 100000 },
          },
        ],
      },
    ],
  };
}

describe('cutscene and meeting actions', () => {
  it('plays the cutscene to the table and opens a meeting', async () => {
    storyArc.stories[ID] = probe();
    try {
      const sr = await startStoryRoom(colyseus, { storyId: ID, invariantsEvery: 50 });
      const sent: { type: string; payload: unknown }[] = [];
      const original = sr.room.broadcast.bind(sr.room) as (type: unknown, payload?: unknown) => void;
      (sr.room as unknown as { broadcast: typeof original }).broadcast = (type, payload) => {
        sent.push({ type: String(type), payload });
        original(type, payload);
      };
      play(sr, { maxTicks: 600, until: (r) => r.events.some((e) => e.kind === 'meeting') });
      expect(sent.filter((m) => m.type === S2C.cutscene)).toContainEqual({
        type: S2C.cutscene,
        payload: { id: 'deathKnife', scope: 'all' },
      });
      expect(sr.events.some((e) => e.kind === 'meeting' && e.data?.reason === 'bell')).toBe(true);
      expect(sr.failures).toEqual([]);
    } finally {
      delete storyArc.stories[ID];
    }
  });
});
