import { type ArcStory, storyArc } from '@wdi/content';
import type { ColyseusTestServer } from '@colyseus/testing';
import { Phase } from '@wdi/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { bootAutoServer } from '../autoHelpers';
import { markDead } from '../../src/sim/Death';
import { emitSim } from '../../src/sim/events/bus';
import { holderOf } from '../../src/sim/story/handover';
import { isWorldPhase } from '../../src/sim/World';
import { type StoryRoom, chaptersStarted, play, startStoryRoom } from './fixture';

// Story R8 (docs/story/arc.md 3.4 and E17, A608): a section that names `onlyIf: 'shade'` is skipped, ended at once
// and not failed, when no shade waits as it would start (3.2 ended on its tick, not the Knife). With a shade it runs.

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  colyseus = await bootAutoServer();
});
afterAll(async () => colyseus.shutdown());
afterEach(() => void delete storyArc.stories[ID]);

const REAL = storyArc.stories.hollowmere_winter!;
const ID = 'skip_probe';

/** One chapter: a warm section, the shade's section (`last` puts it last in the chapter), maybe one more. */
function probe(last: boolean): ArcStory {
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
  const sections = [
    { ...base, id: 'sk_warm', end: { event: 'probe.next', seat: 'player' } },
    {
      ...base,
      id: 'sk_shade',
      roleId: 'vicar',
      shade: true as const,
      onlyIf: 'shade' as const,
      end: { tick: 20000 },
    },
    ...(last ? [] : [{ ...base, id: 'sk_after', end: { tick: 60 } }]),
  ];
  return {
    ...REAL,
    id: ID,
    chapters: [
      {
        ...chapter,
        id: 'sk_ch',
        cast: [a!.roleId, 'vicar', 'killer', 'doctor', 'watchman', 'lamplighter', 'detective', 'townsfolk'],
        sections,
      },
    ],
  };
}

async function warm(last: boolean): Promise<StoryRoom> {
  storyArc.stories[ID] = probe(last);
  const sr = await startStoryRoom(colyseus, { storyId: ID, invariantsEvery: 20 });
  play(sr, {
    maxTicks: 2000,
    until: (r) => isWorldPhase(r.room.state.phase) && r.answered >= r.cards.length,
  });
  sr.room.state.phase = Phase.night;
  sr.room.state.phaseEndsTick = sr.room.state.tick + 20 * 3600;
  play(sr, { maxTicks: 5, until: () => false });
  return sr;
}
const next = (sr: StoryRoom) =>
  emitSim(sr.room, { tick: sr.room.state.tick, kind: 'probe.next', seat: sr.humanId });
const ended = (sr: StoryRoom, id: string) =>
  sr.events.find((e) => e.kind === 'story.chapterEnd' && e.data?.chapterId === id)?.data;

describe("the shade's section is skipped with no shade (story R8, arc E17)", () => {
  it('no shade: skipped, not failed, no handover, and the next section runs', async () => {
    const sr = await warm(false);
    const card = sr.room.state.players.get(sr.humanId)!.priv.role.roleId;
    next(sr);
    play(sr, { maxTicks: 400, until: (r) => chaptersStarted(r).includes('sk_after') });
    expect(chaptersStarted(sr)).not.toContain('sk_shade');
    expect(sr.events.filter((e) => e.kind === 'story.skip').map((e) => e.data?.chapterId)).toEqual([
      'sk_shade',
    ]);
    expect(ended(sr, 'sk_shade')).toMatchObject({ failed: false });
    expect(sr.room.state.players.get(sr.humanId)!.priv.role.roleId).not.toBe('vicar');
    expect(card).not.toBe('vicar');
    expect(sr.failures).toEqual([]);
  });

  it('a shade waiting: the section runs', async () => {
    const sr = await warm(false);
    markDead(sr.room, holderOf(sr.room, sr.humanId, 'vicar')!, 'knife');
    play(sr, { maxTicks: 5, until: () => false });
    next(sr);
    play(sr, { maxTicks: 400, until: (r) => chaptersStarted(r).includes('sk_shade') });
    expect(chaptersStarted(sr)).toContain('sk_shade');
    expect(sr.events.some((e) => e.kind === 'story.skip')).toBe(false);
    expect(sr.room.state.players.get(sr.humanId)!.priv.role.roleId).toBe('vicar');
  });

  it("skipped as its chapter's last section: the chapter's end card shows and the story ends", async () => {
    const sr = await warm(true);
    next(sr);
    play(sr, { maxTicks: 1000, until: (r) => r.events.some((e) => e.kind === 'story.end') });
    expect(ended(sr, 'sk_shade')).toMatchObject({ failed: false });
    const end = sr.cards.map((c) => c.card).find((c) => c.kind === 'end' && c.sectionId === 'sk_shade');
    expect(end?.lines).toEqual(REAL.chapters[0]!.end.lines);
  });
});
