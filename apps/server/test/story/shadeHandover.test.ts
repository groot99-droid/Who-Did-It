import { type ArcStory, type SceneId, balance, roles, scenes, storyArc } from '@wdi/content';
import type { ColyseusTestServer } from '@colyseus/testing';
import { Phase, TILE_PX } from '@wdi/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bootAutoServer } from '../autoHelpers';
import { spawnBody } from '../../src/sim/Bodies';
import { markDead } from '../../src/sim/Death';
import { emitSim } from '../../src/sim/events/bus';
import { simOf } from '../../src/sim/RoomSim';
import { handleRiteHold, mediumHandle } from '../../src/sim/rite/rite';
import { isShade, martyrSeatOf } from '../../src/sim/rite/shade';
import { holderOf } from '../../src/sim/story/handover';
import { isWorldPhase, sceneIndex, sceneKey, tileCentre } from '../../src/sim/World';
import { type StoryRoom, chaptersStarted, play, startStoryRoom } from './fixture';

// Story R8 (docs/story/arc.md 3.4 and E15, A608; R8-Q5): the shade handover. The player plays a card, an NPC in the
// Vicar's look falls to the Knife and walks as the match's shade; the next section (`shade: true`) gives the player
// that body as its shade, not the Vicar card in the player's own living body.

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  colyseus = await bootAutoServer();
});
afterAll(async () => colyseus.shutdown());
const holdS = balance.rite.holdS;
beforeEach(() => void (balance.rite.holdS = 0.5));
afterEach(() => {
  balance.rite.holdS = holdS;
  delete storyArc.stories[ID];
});

const REAL = storyArc.stories.hollowmere_winter!;
const ID = 'shade_handover_probe';

function probe(): ArcStory {
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
        id: 'sx_ch',
        cast: [a!.roleId, 'vicar', 'killer', 'doctor', 'watchman', 'lamplighter', 'detective', 'townsfolk'],
        sections: [
          { ...base, id: 'sx_warm', end: { event: 'probe.next', seat: 'player' } },
          {
            ...base,
            id: 'sx_shade',
            roleId: 'vicar',
            shade: true,
            end: { any: [{ event: 'rite.returned', seat: 'player' }, { tick: 20000 }] },
          },
          { ...base, id: 'sx_after', end: { tick: 60 } },
        ],
      },
    ],
  };
}

const where = (sr: StoryRoom, seat: string) => {
  const p = simOf(sr.room).players.get(seat)!;
  return { sceneIdx: p.sceneIdx, x: p.x, y: p.y, dead: p.dead };
};

describe('the shade handover (story R8, arc E15)', () => {
  it('the player takes the martyr’s body as its shade; the body it left goes on alive as an NPC', async () => {
    storyArc.stories[ID] = probe();
    const sr = await startStoryRoom(colyseus, { storyId: ID, invariantsEvery: 20 });
    const me = sr.humanId;
    play(sr, {
      maxTicks: 2000,
      until: (r) => isWorldPhase(r.room.state.phase) && r.answered >= r.cards.length,
    });
    sr.room.state.phase = Phase.night;
    sr.room.state.phaseEndsTick = sr.room.state.tick + 20 * 3600;
    const vicar = holderOf(sr.room, me, 'vicar')!;
    expect(vicar).toBeTruthy();
    expect(sr.room.state.players.get(vicar)!.look).toBe(roles.roles.vicar!.look);
    const myCard = sr.room.state.players.get(me)!.priv.role.roleId;
    play(sr, { maxTicks: 5, until: () => false });
    const v = simOf(sr.room).players.get(vicar)!;
    markDead(sr.room, vicar, 'knife');
    spawnBody(
      sr.room,
      sceneKey(v.sceneIdx) as SceneId,
      vicar,
      Math.floor(v.x / TILE_PX),
      Math.floor(v.y / TILE_PX),
    );
    play(sr, { maxTicks: 5, until: () => false });
    expect(martyrSeatOf(sr.room)).toBe(vicar);
    const fell = where(sr, vicar);
    const stood = where(sr, me);

    // The warm section ends; the shade's section starts.
    emitSim(sr.room, { tick: sr.room.state.tick, kind: 'probe.next', seat: me });
    play(sr, { maxTicks: 400, until: (r) => chaptersStarted(r).includes('sx_shade') });
    play(sr, { maxTicks: 5, until: () => false });

    expect(sr.room.state.players.get(me)!.priv.role.roleId).toBe('vicar');
    expect(sr.room.state.players.get(vicar)!.priv.role.roleId).toBe(myCard);
    expect(isShade(sr.room, me)).toBe(true);
    expect(martyrSeatOf(sr.room)).toBe(me);
    expect(where(sr, me)).toMatchObject({ ...fell, dead: true });
    expect(where(sr, vicar)).toMatchObject({ sceneIdx: stood.sceneIdx, dead: false });
    // Public `alive` flips only at a meeting (A30), from the sim: no meeting has run since the Knife, so both still read
    // alive, and the next meeting flips the player's seat, which is the dead one now.
    expect(sr.room.state.players.get(vicar)!.alive).toBe(true);
    const bodies = [...sr.room.state.scenes.values()].flatMap((s) => [...s.bodies.keys()]);
    expect(bodies).toContain(`body_${me}`);
    expect(bodies).not.toContain(`body_${vicar}`);
    expect(sr.events.some((e) => e.kind === 'story.chapterEnd' && e.data?.chapterId === 'sx_shade')).toBe(
      false,
    );

    // The rite and the return are the player's now.
    const { scene, spawn } = balance.rite.site;
    const sp = scenes[scene as 'forest_deep'].spawns.find((s) => s.id === spawn)!;
    const p = simOf(sr.room).players.get(me)!;
    p.sceneIdx = sceneIndex(scene);
    sr.room.state.players.get(me)!.priv.sceneId = p.sceneIdx;
    p.x = tileCentre(sp.x, TILE_PX);
    p.y = tileCentre(sp.y, TILE_PX);
    handleRiteHold(sr.room, me, mediumHandle(sr.room)!);
    play(sr, { maxTicks: 40, until: () => false });
    sr.room.state.phase = Phase.day;
    sr.room.state.phaseEndsTick = sr.room.state.tick + 20 * 3600;
    play(sr, { maxTicks: 200, until: (r) => chaptersStarted(r).includes('sx_after') });
    expect(sr.events.filter((e) => e.kind === 'rite.returned').map((e) => e.seat)).toEqual([me]);
    expect(where(sr, me).dead).toBe(false);
    const end = sr.events.find((e) => e.kind === 'story.chapterEnd' && e.data?.chapterId === 'sx_shade');
    expect(end?.data).toMatchObject({ failed: false });
    expect(sr.failures).toEqual([]);
  });
});
