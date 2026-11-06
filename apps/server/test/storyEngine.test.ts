import type { ColyseusTestServer } from '@colyseus/testing';
import { Phase } from '@wdi/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PartyRoom } from '../src/rooms/PartyRoom';
import { isNpcSeat } from '../src/sim/Npc';
import { simOf } from '../src/sim/RoomSim';
import { AUTO_STREAMS } from '../src/sim/auto/Auto';
import { clockOf } from '../src/sim/auto/clock';
import { runInvariants } from '../src/sim/auto/invariants';
import type { SeedWords } from '../src/sim/seeds';
import {
  enableStory,
  queueStoryContinue,
  queueStoryStart,
  registerStory,
  storyNpcIds,
  storyOf,
} from '../src/sim/story/Story';
import type { Story } from '../src/sim/story/types';
import { bootAutoServer } from './autoHelpers';
import { advance } from './npcHelpers';

const words = (n: number): SeedWords => [n, n * 7 + 1, n * 13 + 2, n * 31 + 3];

/** A three-chapter story with no beats, enough for the engine's seat and card tests. */
export const testStory: Story = {
  id: 'test_story',
  title: 'Test',
  blurb: 'Test',
  mapId: 'hollowmere',
  roster: { humanSeat: 0, npcCount: 7 },
  seedWords: Object.fromEntries(AUTO_STREAMS.map((s, i) => [s, words(i + 1)])),
  chapters: ['baker', 'watchman', 'thief'].map((roleId, i) => ({
    id: `ch${i + 1}_${roleId}`,
    title: roleId,
    setup: `setup ${roleId}`,
    roleId,
    startPhase: { cycle: 1, part: 'day' as const },
    goals: [],
    beats: [],
    end: { trigger: { tick: 1000 }, summaryKeys: [] },
  })),
};

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  colyseus = await bootAutoServer();
  registerStory(testStory);
});
afterAll(async () => colyseus.shutdown());

const create = async (): Promise<PartyRoom> =>
  (await colyseus.createRoom('party', {})) as unknown as PartyRoom;

describe('enableStory (GDD 3.34)', () => {
  it('seats one human and the story roster of NPCs under fixed ids, with fixed seeds', async () => {
    const room = await create();
    const state = enableStory(room, 'test_story', { humanId: 'human1' });
    expect(state.humanId).toBe('human1');
    expect(room.state.leaderId).toBe('human1');
    const ids = [...room.state.players.keys()];
    expect(ids).toEqual(['human1', ...storyNpcIds(testStory)]);
    expect(ids.filter((id) => !isNpcSeat(room, id))).toEqual(['human1']);
    expect(room.fixedSeeds?.deal).toEqual(testStory.seedWords.deal);
    expect(() => enableStory(room, 'nope')).toThrow();
    await room.disconnect();
  });

  it("deals chapter one's card to the human, raises the title card and pauses until story.continue", async () => {
    const room = await create();
    enableStory(room, 'test_story', { humanId: 'human1' });
    queueStoryStart(room);
    const party = { humans: [], room };
    advance(party, 3);
    expect(room.state.phase).toBe(Phase.roleReveal);
    expect(room.state.players.get('human1')?.priv?.role.roleId).toBe('baker');
    expect(storyOf(room)).toMatchObject({ chapterIdx: 0, cardUp: true });
    expect(clockOf(room).paused).toBe(true);
    queueStoryContinue(room, 'someone-else'); // only the human's continue counts
    advance(party, 1);
    expect(storyOf(room)?.cardUp).toBe(true);
    queueStoryContinue(room, 'human1');
    advance(party, 1);
    expect(storyOf(room)?.cardUp).toBe(false);
    expect(clockOf(room).paused).toBe(false);
    let n = 0;
    while (room.state.phase === Phase.roleReveal && n++ < 700) advance(party, 1); // the NPCs dismiss their cards
    expect(room.state.phase).not.toBe(Phase.roleReveal);
    expect(n).toBeLessThan(500); // well before the 30 s timer: the continue dismissed the human's card
    expect(runInvariants(room).filter((f) => f.name === 'storyOneHuman')).toEqual([]);
    expect(simOf(room).auto?.started).toBe(true);
    await room.disconnect();
  });

  it('replays: the same story deals the same cards to the same ids', async () => {
    const deal = async () => {
      const room = await create();
      enableStory(room, 'test_story', { humanId: 'human1' });
      queueStoryStart(room);
      advance({ humans: [], room }, 2);
      const out = [...room.state.players].map(([id, p]) => `${id}=${p.priv?.role.roleId}`);
      await room.disconnect();
      return out;
    };
    expect(await deal()).toEqual(await deal());
  });
});
