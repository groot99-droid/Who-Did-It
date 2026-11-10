import { type ArcStory, scenes, storyArc } from '@wdi/content';
import { TILE_PX } from '@wdi/shared';
import type { ColyseusTestServer } from '@colyseus/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootAutoServer } from '../autoHelpers';
import { npcMemory } from '../../src/sim/npc/memory';
import { holderOf } from '../../src/sim/story/handover';
import { sceneIndex, tileCentre } from '../../src/sim/World';
import { chaptersStarted, play, startStoryRoom } from './fixture';

// Staging at a break (docs/story/arc.md E14, GDD 3.34): a break swaps cards where the bodies stand, so a section's
// `tick: 0` beat sends a card where the opening needs it. `args.spawn` names the spot in the scene.

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  colyseus = await bootAutoServer();
});
afterAll(async () => colyseus.shutdown());

const REAL = storyArc.stories.hollowmere_winter!;
const ID = 'staging_probe';
const SCENE = 'bakery' as const;

function probe(spawn: string | undefined): ArcStory {
  const chapter = REAL.chapters[0]!;
  const [a, b] = chapter.sections;
  const short = (s: NonNullable<typeof a>, beat: NonNullable<typeof a>['beats'][number]) => {
    const { endCard: _drop, ...rest } = s;
    return {
      ...rest,
      goals: [{ id: 'g1', text: 'Wait a moment', trigger: { tick: 10 } }],
      beats: [beat],
      end: { tick: 40 },
    };
  };
  const wait = {
    id: 'b1',
    trigger: { tick: 0 },
    action: { card: 'beat' as const, line: 'Wait.' },
    oncePerChapter: true as const,
  };
  const stage = {
    id: 'b2',
    trigger: { tick: 0 },
    action: {
      npcOrder: { npcId: 'killer', order: 'goTo', args: { scene: SCENE, ...(spawn && { spawn }) } },
    },
    oncePerChapter: true as const,
  };
  return {
    ...REAL,
    id: ID,
    chapters: [{ ...chapter, id: 'st_a', cast: undefined, sections: [short(a!, wait), short(b!, stage)] }],
  };
}

describe('staging at a break', () => {
  it('sends a card to a named spawn of a scene from the next section’s opening beat', async () => {
    const spawn = scenes[SCENE].spawns[scenes[SCENE].spawns.length - 1]!;
    storyArc.stories[ID] = probe(spawn.id);
    try {
      const sr = await startStoryRoom(colyseus, { storyId: ID, invariantsEvery: 50 });
      play(sr, { maxTicks: 600, until: (r) => chaptersStarted(r).length >= 1 });
      const killer = holderOf(sr.room, sr.humanId, 'killer');
      expect(killer).not.toBeNull();
      play(sr, { maxTicks: 4000, until: (r) => npcMemory(r.room).brain(killer!).act?.kind === 'travel' });
      const act = npcMemory(sr.room).brain(killer!).act;
      expect(act?.kind).toBe('travel');
      if (act?.kind === 'travel') {
        expect(act.goal?.scene).toBe(sceneIndex(SCENE));
        expect(act.goal?.x).toBe(tileCentre(spawn.x, TILE_PX));
        expect(act.goal?.y).toBe(tileCentre(spawn.y, TILE_PX));
      }
      expect(sr.failures).toEqual([]);
    } finally {
      delete storyArc.stories[ID];
    }
  });
});
