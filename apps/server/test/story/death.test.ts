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
import { STORY_MAX_TICKS, describeStory, storyServer } from './suite';

// README 2: a player death inside a chapter ends the chapter as failed, shows the end card, and the next chapter
// still starts, so a story is always finishable. A story with no chapter left to switch to ends.

describeStory('a player who dies still gets the story (README DoD 4)', () => {
  const server = storyServer();

  it('dies in chapter 1 and reaches chapter 2 with a living seat and its card', async () => {
    const sr = await startStoryRoom(server.colyseus(), { invariantsEvery: 100 });
    const def = storyDef()!;
    try {
      // Let the first chapter start and its title card be answered, then kill the seat.
      play(sr, { maxTicks: 600, until: (r) => chaptersStarted(r).length >= 1 && r.answered >= 1 });
      expect(chaptersStarted(sr)).toEqual([def.chapters[0]!.id]);
      killHuman(sr);
      expect(humanDead(sr)).toBe(true);

      const { finished } = play(sr, {
        maxTicks: STORY_MAX_TICKS,
        until: (r) => chaptersStarted(r).length >= 2,
        invariantsEvery: 100,
      });
      expect(finished, 'chapter 2 never started after the player died').toBe(true);
      expect(chaptersEnded(sr)[0]).toBe(def.chapters[0]!.id);
      const ch1 = sr.cards.filter((c) => c.card.chapterId === def.chapters[0]!.id).map((c) => c.card.kind);
      expect(ch1.at(-1)).toBe('end');
      expect(humanRole(sr)).toBe(def.chapters[1]!.roleId);
      expect(humanDead(sr)).toBe(false);
      expect(humanSeatCount(sr)).toBe(1);
      expect(sr.failures).toEqual([]);
    } finally {
      await sr.room.disconnect();
    }
  });

  it('dies in the last chapter and the story ends', async () => {
    const sr = await startStoryRoom(server.colyseus());
    const def = storyDef()!;
    try {
      play(sr, { maxTicks: STORY_MAX_TICKS, until: (r) => chaptersStarted(r).length >= def.chapters.length });
      killHuman(sr);
      const { finished } = play(sr, { maxTicks: STORY_MAX_TICKS });
      expect(finished).toBe(true);
      expect(sr.room.state.phase).toBe(Phase.gameOver);
    } finally {
      await sr.room.disconnect();
    }
  });
});
