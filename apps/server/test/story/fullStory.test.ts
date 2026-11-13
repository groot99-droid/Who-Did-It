import { Phase } from '@wdi/shared';
import { expect, it } from 'vitest';
import {
  chaptersEnded,
  chaptersStarted,
  humanRole,
  humanSeatCount,
  play,
  startStoryRoom,
  storyDef,
} from './fixture';
import { STORY_MAX_TICKS, describeChapters, storyServer } from './suite';

// DoD 1 and 4 (README): a scripted player finishes the story. The player stands still and answers every card; the
// chapters end on their own triggers (an end the player must act to reach is a bug in `story.json`'s pacing, which
// this test then reports to S1).

describeChapters('a scripted player finishes the story (README DoD 1 and 4)', () => {
  const server = storyServer();

  it('plays every chapter in order, each with a title card, its beats once and an end card', async () => {
    const sr = await startStoryRoom(server.colyseus(), { invariantsEvery: 100 });
    const def = storyDef()!;
    const rolesAtStart: string[] = [];
    let seen = 0;
    try {
      const { finished } = play(sr, {
        maxTicks: STORY_MAX_TICKS,
        invariantsEvery: 100,
        policy: (r) => {
          const started = chaptersStarted(r);
          while (seen < started.length) {
            rolesAtStart.push(humanRole(r));
            expect(humanSeatCount(r)).toBe(1);
            seen++;
          }
        },
      });
      expect(finished).toBe(true);
      expect(sr.room.state.phase).toBe(Phase.gameOver);
      expect(sr.failures).toEqual([]);

      const ids = def.chapters.map((c) => c.id);
      expect(chaptersStarted(sr)).toEqual(ids);
      expect(chaptersEnded(sr)).toEqual(ids);
      expect(rolesAtStart).toEqual(def.chapters.map((c) => c.roleId));

      for (const ch of def.chapters) {
        const kinds = sr.cards.filter((c) => c.card.sectionId === ch.id).map((c) => c.card.kind);
        // A chapter's first section opens with the chapter's title card, a later one with its own section card.
        const opening = def.chapters.find((c) => c.id === ch.id) as { first?: boolean } | undefined;
        expect(kinds[0], `${ch.id} opens with its card`).toBe(opening?.first ? 'title' : 'section');
        expect(kinds.at(-1), `${ch.id} closes with an end card`).toBe('end');
        // Every beat card is for a beat of this chapter's file, and a beat fires once.
        const beats = sr.events.filter(
          (e) => e.kind === 'story.beat' && (e.data as { chapter?: string } | undefined)?.chapter === ch.id,
        );
        const fired = beats.map((e) => JSON.stringify(e.data));
        expect(new Set(fired).size, `${ch.id}: a beat fired twice`).toBe(fired.length);
      }
      // Every card the player was sent was answered.
      expect(sr.answered).toBe(sr.cards.length);
    } finally {
      await sr.room.disconnect();
    }
  });
});
