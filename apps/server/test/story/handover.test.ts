import { expect, it } from 'vitest';
import { isNpcSeat } from '../../src/sim/Npc';
import { runInvariants } from '../../src/sim/auto/invariants';
import {
  chaptersStarted,
  humanRole,
  humanSeat,
  humanSeatCount,
  play,
  startStoryRoom,
  storyDef,
} from './fixture';
import { STORY_MAX_TICKS, describeStory, storyServer } from './suite';

// README 1 and 2: at a chapter break the player's seat moves to a new role, the old seat goes back to the NPC
// brain, the private view resets and only `handOn` crosses. The two invariants S2 adds (exactly one human seat;
// beats in trigger order, once each) run with the registry at every break.

describeStory('the seat handover (README 2)', () => {
  const server = storyServer();

  it('at every break: the chapter’s card, one human seat, the old card on an NPC, a fresh private view', async () => {
    const sr = await startStoryRoom(server.colyseus());
    const def = storyDef()!;
    try {
      for (let n = 1; n <= def.chapters.length; n++) {
        const ch = def.chapters[n - 1]!;
        const before = n > 1 ? def.chapters[n - 2]! : null;
        const { finished } = play(sr, {
          maxTicks: STORY_MAX_TICKS,
          until: (r) => chaptersStarted(r).length >= n,
        });
        expect(finished, `chapter ${ch.id} never started`).toBe(true);

        expect(humanRole(sr)).toBe(ch.roleId);
        expect(humanSeatCount(sr)).toBe(1);
        expect(runInvariants(sr.room), `invariants at the start of ${ch.id}`).toEqual([]);

        const me = humanSeat(sr);
        const priv = sr.room.state.players.get(me)!.priv;
        // A fresh deal writes no notebook line, and nothing of the last chapter's private view rides along
        // unless the previous chapter names a `handOn`.
        if (before !== null && (before as { handOn?: unknown[] }).handOn === undefined) {
          expect(priv.notebook.length, `notebook at ${ch.id}`).toBe(0);
        }
        // The old role's card now sits on a seat the NPC brain runs.
        if (before !== null && before.roleId !== ch.roleId) {
          const holders = [...sr.room.state.players.entries()].filter(
            ([, p]) => p.priv.role.roleId === before.roleId,
          );
          expect(holders.length, `no seat holds ${before.roleId} after the break`).toBeGreaterThan(0);
          for (const [id] of holders)
            expect(isNpcSeat(sr.room, id), `${id} holds ${before.roleId}`).toBe(true);
        }
      }
    } finally {
      await sr.room.disconnect();
    }
  });
});
