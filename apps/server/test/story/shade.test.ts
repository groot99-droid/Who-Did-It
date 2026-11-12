import { type ArcStory, balance, roles, scenes, storyArc } from '@wdi/content';
import type { ColyseusTestServer } from '@colyseus/testing';
import { Phase, TILE_PX } from '@wdi/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bootAutoServer } from '../autoHelpers';
import { simOf } from '../../src/sim/RoomSim';
import { handleRiteHold, mediumHandle } from '../../src/sim/rite/rite';
import { isWorldPhase, sceneIndex, tileCentre } from '../../src/sim/World';
import { type StoryRoom, chaptersStarted, humanSeat, killHuman, play, startStoryRoom } from './fixture';

// Story R8 (docs/story/arc.md 3.4, E16 and E17; A608): a section may play the match's martyr as its shade. Its death
// before the return is no failure; the rite's stages reach the bus (`rite.*`), so a section can end on them; once the
// rite has brought the player back, a death fails the chapter as in any section (Q-A9).

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  colyseus = await bootAutoServer();
});
afterAll(async () => colyseus.shutdown());
const holdS = balance.rite.holdS;
beforeEach(() => void (balance.rite.holdS = 0.5));
afterEach(() => void (balance.rite.holdS = holdS));

const REAL = storyArc.stories.hollowmere_winter!;
const ID = 'shade_probe';

/**
 * One chapter at night: a short section (the first takes the fixed deal), the Vicar's section (shade or not) ending on
 * the given rite stage, then a short one.
 */
function probe(shade: boolean, endOn: string): ArcStory {
  const chapter = REAL.chapters[0]!;
  const [a] = chapter.sections;
  const { endCard: _drop, ...rest } = a!;
  const base = {
    ...rest,
    goals: [{ id: 'g1', text: 'Wait', trigger: { tick: 10 } }],
    beats: [
      {
        id: 'b1',
        trigger: { tick: 0 },
        action: { card: 'beat' as const, line: 'Wait.' },
        oncePerChapter: true as const,
      },
    ],
  };
  return {
    ...REAL,
    id: ID,
    chapters: [
      {
        ...chapter,
        id: 'sh_ch',
        startPhase: { cycle: 1, part: 'night' },
        cast: undefined,
        sections: [
          { ...base, id: 'sh_warm', end: { tick: 60 } },
          {
            ...base,
            id: 'sh_a',
            roleId: 'vicar',
            ...(shade && { shade: true as const }),
            end: { any: [{ event: endOn, seat: 'player' }, { tick: 20000 }] },
          },
          { ...base, id: 'sh_b', end: { tick: 60 } },
        ],
      },
    ],
  };
}

const ends = (sr: StoryRoom) =>
  sr.events
    .filter((e) => e.kind === 'story.chapterEnd' && e.data?.chapterId !== 'sh_warm')
    .map((e) => e.data ?? {});
const riteStages = (sr: StoryRoom) =>
  sr.events.filter((e) => e.kind.startsWith('rite.')).map((e) => [e.kind, e.seat]);

/** Starts the probe, waits for its first section, and strikes the player down in the Vicar's look with the Knife. */
async function martyred(shade: boolean, endOn: string): Promise<StoryRoom> {
  storyArc.stories[ID] = probe(shade, endOn);
  const sr = await startStoryRoom(colyseus, { storyId: ID, invariantsEvery: 20 });
  play(sr, {
    maxTicks: 2000,
    until: (r) => chaptersStarted(r).includes('sh_a') && r.answered >= r.cards.length,
  });
  play(sr, { maxTicks: 2000, until: (r) => isWorldPhase(r.room.state.phase) });
  sr.room.state.phase = Phase.night; // a night, as after 3.2's Knife
  sr.room.state.phaseEndsTick = sr.room.state.tick + 20 * 3600;
  play(sr, { maxTicks: 5, until: () => false });
  expect(sr.room.state.players.get(humanSeat(sr))!.look).toBe(roles.roles.vicar!.look);
  killHuman(sr, 'knife');
  return sr;
}

/** The next day: the shade's wait ends (a return if its rite is done, else a ghost). */
function dawn(sr: StoryRoom): void {
  sr.room.state.phase = Phase.day;
  sr.room.state.phaseEndsTick = sr.room.state.tick + 20 * 3600;
}

describe("the martyr's section (story R8, arc E16 and E17)", () => {
  afterEach(() => void delete storyArc.stories[ID]);

  it('without the flag a Knife death fails the section as before', async () => {
    const sr = await martyred(false, 'rite.lapsed');
    play(sr, { maxTicks: 200, until: (r) => ends(r).length >= 1 });
    expect(ends(sr)[0]).toMatchObject({ chapterId: 'sh_a', failed: true });
  });

  it('a waiting shade has not failed; the wait lapsing with no rite ends the section, not failed', async () => {
    const sr = await martyred(true, 'rite.lapsed');
    play(sr, { maxTicks: 200, until: () => false });
    expect(ends(sr)).toEqual([]);
    expect(riteStages(sr)).toEqual([['rite.open', humanSeat(sr)]]);
    dawn(sr);
    play(sr, { maxTicks: 200, until: (r) => ends(r).length >= 1 });
    expect(riteStages(sr)).toEqual([
      ['rite.open', humanSeat(sr)],
      ['rite.lapsed', humanSeat(sr)],
    ]);
    expect(ends(sr)[0]).toMatchObject({ chapterId: 'sh_a', failed: false });
  });

  it('the rite runs to its return on the bus; a death after the return fails the section', async () => {
    const sr = await martyred(true, 'rite.never');
    const me = humanSeat(sr);
    play(sr, { maxTicks: 40, until: () => false });
    const { scene, spawn } = balance.rite.site;
    const sp = scenes[scene as 'forest_deep'].spawns.find((s) => s.id === spawn)!;
    const p = simOf(sr.room).players.get(me)!;
    p.sceneIdx = sceneIndex(scene);
    sr.room.state.players.get(me)!.priv.sceneId = p.sceneIdx;
    p.x = tileCentre(sp.x, TILE_PX);
    p.y = tileCentre(sp.y, TILE_PX);
    handleRiteHold(sr.room, me, mediumHandle(sr.room)!);
    play(sr, { maxTicks: 40, until: () => false });
    dawn(sr);
    play(sr, { maxTicks: 40, until: (r) => riteStages(r).length >= 4 });
    expect(riteStages(sr)).toEqual([
      ['rite.open', me],
      ['rite.begun', me],
      ['rite.done', me],
      ['rite.returned', me],
    ]);
    expect(ends(sr)).toEqual([]);
    killHuman(sr, 'knife');
    play(sr, { maxTicks: 200, until: (r) => ends(r).length >= 1 });
    expect(ends(sr)[0]).toMatchObject({ chapterId: 'sh_a', failed: true });
  });
});
