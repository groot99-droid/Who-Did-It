import { storyArc } from '@wdi/content';
import { describe, expect, it } from 'vitest';
import { DeviceSaveStore, type StorySave, parseStorySave } from '../../src/accounts/saves';
import { replayFrom, resumeIndex } from '../../src/sim/story/Story';
import { unitsOf } from '../../src/sim/story/units';
import { chaptersStarted, humanRole, play, startStoryRoom } from './fixture';
import { STORY_MAX_TICKS, describeChapters, storyServer } from './suite';

// Saves (docs/accounts/plan.md 5, GDD 3.34): the server writes a save at each arc chapter's break and hands it to the
// store; the device store sends it to the player's own client and re-validates what the client sends back. A resume
// starts the chapter the save names, from its break.

const STORY = 'hollowmere_winter';
const arc = storyArc.stories[STORY]!;
const units = unitsOf(arc);
const good = (over: Partial<StorySave> = {}): StorySave => ({
  v: 1,
  storyId: STORY,
  nextChapterId: arc.chapters[1]!.id,
  finished: [arc.chapters[0]!.id],
  handOn: [],
  replayUsed: [],
  summaries: [{ chapterId: arc.chapters[0]!.id, counters: { tasksDone: 2 } }],
  rev: 1,
  savedAt: 1000,
  ...over,
});

describe('parseStorySave', () => {
  it('accepts a well-formed save and clamps counters', () => {
    const save = parseStorySave({ ...good(), summaries: [{ chapterId: 'a', counters: { n: 9e9, m: -4 } }] });
    expect(save?.summaries[0]?.counters).toEqual({ n: 1e6, m: 0 });
    expect(parseStorySave(good())).toEqual(good());
  });
  it.each([
    ['not an object', 7],
    ['wrong version', { ...good(), v: 2 }],
    ['bad story id', { ...good(), storyId: '../x' }],
    ['next not a string', { ...good(), nextChapterId: 5 }],
    ['too many finished', { ...good(), finished: Array.from({ length: 65 }, (_, i) => `c${i}`) }],
    ['finished not ids', { ...good(), finished: [1] }],
    ['summary without a chapter', { ...good(), summaries: [{ counters: {} }] }],
    ['counter not a number', { ...good(), summaries: [{ chapterId: 'a', counters: { n: 'x' } }] }],
    ['negative rev', { ...good(), rev: -1 }],
    ['fractional rev', { ...good(), rev: 1.5 }],
    ['savedAt not finite', { ...good(), savedAt: Number.NaN }],
  ])('refuses %s', (_name, raw) => {
    expect(parseStorySave(raw)).toBeNull();
  });
});

describe('the device store', () => {
  const store = new DeviceSaveStore();
  it('sends a put to the client and reads back only a valid save of the same story', () => {
    const sent: [string, unknown][] = [];
    const ctx = { seat: 's', send: (t: string, p: unknown) => sent.push([t, p]), resume: good() };
    expect(store.put(ctx, good())).toBe('ok');
    expect(sent).toEqual([['story.saved', { save: good() }]]);
    expect(store.get(ctx, STORY)).toEqual(good());
    expect(store.get(ctx, 'other_story')).toBeNull();
    expect(store.get({ ...ctx, resume: { v: 9 } }, STORY)).toBeNull();
  });
});

describe('resumeIndex', () => {
  it('finds the first section of the next chapter when the finished list fits', () => {
    expect(resumeIndex(units, good())).toBe(units.findIndex((u) => u.chapter === arc.chapters[1]));
  });
  it('refuses a save that does not fit the story', () => {
    expect(resumeIndex(units, good({ finished: [] }))).toBe(-1);
    expect(resumeIndex(units, good({ finished: ['act9'] }))).toBe(-1);
    expect(resumeIndex(units, good({ nextChapterId: 'nowhere' }))).toBe(-1);
    expect(resumeIndex(units, good({ nextChapterId: arc.chapters[0]!.id, finished: [] }))).toBe(-1); // start over
    expect(resumeIndex(units, good({ nextChapterId: null }))).toBe(-1); // finished story
  });
});

describe('replayFrom', () => {
  const two = good({
    nextChapterId: arc.chapters[2]!.id,
    finished: [arc.chapters[0]!.id, arc.chapters[1]!.id],
    summaries: [{ chapterId: arc.chapters[0]!.id }, { chapterId: arc.chapters[1]!.id }],
  });
  it('narrows a save to the chapters before a finished chapter, which then resumes there', () => {
    const back = replayFrom(two, arc.chapters[1]!.id);
    expect(back.finished).toEqual([arc.chapters[0]!.id]);
    expect(resumeIndex(units, back)).toBe(units.findIndex((u) => u.chapter === arc.chapters[1]));
    expect(resumeIndex(units, replayFrom(two, arc.chapters[0]!.id))).toBe(-1); // chapter one: from the start
  });
  it('leaves a save alone for a chapter it has not finished', () => {
    expect(replayFrom(two, arc.chapters[2]!.id)).toBe(two);
    expect(replayFrom(two, 'nowhere')).toBe(two);
  });
});

describeChapters('saves in a story room', () => {
  const server = storyServer();

  it('writes one save per arc chapter, in order, ending in a finished story', async () => {
    const sr = await startStoryRoom(server.colyseus());
    try {
      const { finished } = play(sr, { maxTicks: STORY_MAX_TICKS });
      expect(finished).toBe(true);
      const saves = sr.sent
        .filter((m) => m.type === 'story.saved')
        .map((m) => (m.payload as { save: StorySave }).save);
      expect(saves.map((x) => x.rev)).toEqual(arc.chapters.map((_, i) => i + 1));
      expect(saves.map((x) => x.finished.at(-1))).toEqual(arc.chapters.map((c) => c.id));
      expect(saves.map((x) => x.nextChapterId)).toEqual([...arc.chapters.slice(1).map((c) => c.id), null]);
      for (const [i, save] of saves.entries()) {
        expect(parseStorySave(save)).toEqual(save);
        expect(save.summaries.map((m) => m.chapterId)).toEqual(arc.chapters.slice(0, i + 1).map((c) => c.id));
        expect(Object.keys(save.summaries[i]!.counters ?? {})).toEqual(arc.chapters[i]!.end.summaryKeys);
      }
    } finally {
      await sr.room.disconnect();
    }
  });

  it('resumes at the chapter a save names, with the spent replays of earlier sections kept', async () => {
    const sr = await startStoryRoom(server.colyseus(), {
      resume: good({ replayUsed: [units[0]!.id, units.at(-1)!.id] }),
    });
    try {
      const at = resumeIndex(units, good());
      play(sr, { maxTicks: 600, until: (r) => chaptersStarted(r).length >= 1 });
      expect(chaptersStarted(sr)).toEqual([units[at]!.id]);
      expect(humanRole(sr)).toBe(units[at]!.roleId);
      const first = sr.cards[0]!.card;
      expect(first.kind).toBe('title');
      expect(first.chapterId).toBe(arc.chapters[1]!.id);
      const { finished } = play(sr, { maxTicks: STORY_MAX_TICKS });
      expect(finished).toBe(true);
      const saves = sr.sent
        .filter((m) => m.type === 'story.saved')
        .map((m) => (m.payload as { save: StorySave }).save);
      expect(saves.map((x) => x.rev)).toEqual(arc.chapters.slice(1).map((_, i) => i + 2)); // continues the revision
      expect(saves.at(-1)!.finished).toEqual(arc.chapters.map((c) => c.id));
      expect(saves.at(-1)!.replayUsed).toEqual([units[0]!.id]); // a later section's spent replay is not carried in
    } finally {
      await sr.room.disconnect();
    }
  });
});
