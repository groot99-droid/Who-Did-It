import { type ArcStory, type Trigger, balance, storyArc } from '@wdi/content';
import { TICK_RATE } from '@wdi/shared';
import type { ColyseusTestServer } from '@colyseus/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootAutoServer } from '../autoHelpers';
import { simOf } from '../../src/sim/RoomSim';
import { chaptersEnded, humanSeat, play, startStoryRoom } from './fixture';

// Company (docs/story/arc.md E10, GDD 3.34): `story.company { with }` is heard once the player has shared a scene with
// the seat holding that card for `balance.story.companyS` seconds of world time.

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  colyseus = await bootAutoServer();
});
afterAll(async () => colyseus.shutdown());

const REAL = storyArc.stories.hollowmere_winter!;
const ID = 'company_probe';

function probe(): ArcStory {
  const chapter = REAL.chapters[0]!;
  const [a] = chapter.sections;
  const { endCard: _drop, ...rest } = a!;
  const end: Trigger = {
    any: [{ event: 'story.company', seat: 'player', data: { with: 'killer' } }, { tick: 100000 }],
  };
  return {
    ...REAL,
    id: ID,
    chapters: [
      {
        ...chapter,
        id: 'co_a',
        cast: undefined,
        sections: [
          {
            ...rest,
            goals: [{ id: 'g1', text: 'Keep the Killer company', trigger: end }],
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

const heardWith = (sr: Awaited<ReturnType<typeof startStoryRoom>>, card: string) =>
  sr.events.filter((e) => e.kind === 'story.company' && e.data?.with === card);

describe('company', () => {
  it('is heard after the shared seconds, and only while the two share a scene', async () => {
    storyArc.stories[ID] = probe();
    try {
      const sr = await startStoryRoom(colyseus, { storyId: ID, invariantsEvery: 100 });
      const me = humanSeat(sr);
      const killer = [...sr.room.state.players].find(([, p]) => p.priv.role.roleId === 'killer')![0];
      const need = balance.story.companyS * TICK_RATE;
      const together = (r: typeof sr): void => {
        const a = simOf(r.room).players.get(me)!;
        const b = simOf(r.room).players.get(killer)!;
        a.sceneIdx = b.sceneIdx;
      };
      // Apart for a long while: the scene index of the Killer differs from ours, so no company accrues.
      const a0 = simOf(sr.room).players.get(me)!;
      const b0 = simOf(sr.room).players.get(killer)!;
      play(sr, { maxTicks: 600, until: (r) => r.answered >= 1 });
      const apartStart = sr.room.state.tick;
      play(sr, {
        maxTicks: need + 100,
        policy: () => {
          a0.sceneIdx = b0.sceneIdx === 0 ? 1 : 0; // never the Killer's scene
        },
      });
      expect(heardWith(sr, 'killer')).toHaveLength(0);
      const together0 = sr.room.state.tick;
      play(sr, {
        maxTicks: need + 200,
        policy: () => together(sr),
        until: (r) => chaptersEnded(r).length >= 1,
      });
      const heard = heardWith(sr, 'killer')[0];
      expect(heard).toMatchObject({ seat: me, data: { with: 'killer' } });
      expect(heard!.tick - together0).toBeGreaterThanOrEqual(need - 5);
      expect(heard!.tick).toBeGreaterThan(apartStart + need);
      expect(heardWith(sr, 'killer')).toHaveLength(1);
    } finally {
      delete storyArc.stories[ID];
    }
  });
});
