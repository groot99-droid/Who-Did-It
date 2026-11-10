import { Phase } from '@wdi/shared';
import { expect, it } from 'vitest';
import {
  chaptersEnded,
  chaptersStarted,
  humanDead,
  humanRole,
  humanSeatCount,
  killHuman,
  play,
  startStoryRoom,
  storyDef,
} from './fixture';
import { STORY_MAX_TICKS, describeChapters, storyServer } from './suite';

// README 2: a player death inside a chapter ends the chapter as failed, shows the end card, and the next chapter
// still starts, so a story is always finishable. A story with no chapter left to switch to ends.

describeChapters('a player who dies still gets the story (README DoD 4)', () => {
  const server = storyServer();

  it('dies in chapter 1: the section replays once, a second death moves on to chapter 2', async () => {
    const sr = await startStoryRoom(server.colyseus(), { invariantsEvery: 100 });
    const def = storyDef()!;
    const first = def.chapters[0]!;
    try {
      // Let the first chapter start and its title card be answered, then kill the seat.
      play(sr, { maxTicks: 600, until: (r) => chaptersStarted(r).length >= 1 && r.answered >= 1 });
      expect(chaptersStarted(sr)).toEqual([first.id]);
      killHuman(sr);
      expect(humanDead(sr)).toBe(true);

      // First failure (A515): the end card says so, then the same section starts again with a living seat.
      play(sr, {
        maxTicks: STORY_MAX_TICKS,
        until: (r) => chaptersStarted(r).length >= 2,
        invariantsEvery: 100,
      });
      expect(chaptersStarted(sr), 'the section replays').toEqual([first.id, first.id]);
      const failed = sr.events.find((e) => e.kind === 'story.chapterEnd');
      expect(failed?.data).toMatchObject({ failed: true, replay: true });
      const starts = sr.events.filter((e) => e.kind === 'story.chapterStart');
      expect(starts.map((e) => e.data?.replay)).toEqual([false, true]);
      const cards = sr.cards.filter((c) => c.card.sectionId === first.id).map((c) => c.card);
      expect(cards.filter((c) => c.kind === 'end')).toHaveLength(1);
      expect(humanRole(sr)).toBe(first.roleId);
      expect(humanDead(sr)).toBe(false);
      expect(humanSeatCount(sr)).toBe(1);

      // The replay is spent: a second failure ends the section and the story moves on.
      play(sr, { maxTicks: 600, until: (r) => r.answered >= r.cards.length });
      killHuman(sr);
      const { finished } = play(sr, {
        maxTicks: STORY_MAX_TICKS,
        until: (r) => chaptersStarted(r).length >= 3,
        invariantsEvery: 100,
      });
      expect(finished, 'chapter 2 never started after the second death').toBe(true);
      expect(chaptersEnded(sr)).toEqual([first.id, first.id]);
      expect(sr.events.filter((e) => e.kind === 'story.chapterEnd').map((e) => e.data?.replay)).toEqual([
        true,
        false,
      ]);
      expect(humanRole(sr)).toBe(def.chapters[1]!.roleId);
      expect(humanDead(sr)).toBe(false);
      expect(sr.failures).toEqual([]);
    } finally {
      await sr.room.disconnect();
    }
  });

  it('dies in the last chapter twice and the story ends', async () => {
    const sr = await startStoryRoom(server.colyseus());
    const def = storyDef()!;
    try {
      play(sr, { maxTicks: STORY_MAX_TICKS, until: (r) => chaptersStarted(r).length >= def.chapters.length });
      killHuman(sr);
      // The first death replays the last section; the second ends the story.
      play(sr, { maxTicks: STORY_MAX_TICKS, until: (r) => chaptersStarted(r).length > def.chapters.length });
      play(sr, { maxTicks: 600, until: (r) => r.answered >= r.cards.length });
      killHuman(sr);
      const { finished } = play(sr, { maxTicks: STORY_MAX_TICKS });
      expect(finished).toBe(true);
      expect(sr.room.state.phase).toBe(Phase.gameOver);
    } finally {
      await sr.room.disconnect();
    }
  });
});
