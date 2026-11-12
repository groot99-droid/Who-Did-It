import { expect, it } from 'vitest';
import { fixSeeds } from '../seedHelpers';
import { chaptersEnded, chaptersReady, playDigest, startStoryRoom, storyDef } from './fixture';
import { PLAY_TICKS, describeStory, storyServer } from './suite';

// DoD 2 (README): the same seed words give the same story tick for tick.

describeStory('the story replays (README DoD 2)', () => {
  const server = storyServer();
  const run = async (words?: [number, number, number, number]) => {
    const sr = await startStoryRoom(server.colyseus(), {
      invariantsEvery: 100,
      ...(words && { afterEnable: (room) => fixSeeds(room, { deal: words, npcPlay: words }) }),
    });
    try {
      const { result, digest } = playDigest(sr, { maxTicks: PLAY_TICKS, invariantsEvery: 100 });
      return { result, digest, ended: chaptersEnded(sr), failures: sr.failures, cards: sr.cards.length };
    } finally {
      await sr.room.disconnect();
    }
  };

  it('two runs of the same seed words are the same story, tick for tick', async () => {
    const a = await run();
    const b = await run();
    expect(a.cards, 'the opening title card').toBeGreaterThan(0);
    // The whole story once chapters run; until then the opening, which the same digest covers.
    if (chaptersReady()) expect(a.result.finished).toBe(true);
    expect(a.failures).toEqual([]);
    if (chaptersReady()) expect(a.ended).toEqual(storyDef()!.chapters.map((c) => c.id));
    expect(b.ended).toEqual(a.ended);
    expect(b.result.ticks).toBe(a.result.ticks);
    expect(b.digest).toBe(a.digest);
  });

  it('other seed words are another story (the digest does hash the play)', async () => {
    const a = await run();
    const c = await run([7, 11, 13, 17]);
    expect(c.digest).not.toBe(a.digest);
  });
});
