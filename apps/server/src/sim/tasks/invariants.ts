import type { InvariantFailure } from '@wdi/shared';
import { Phase } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { registerInvariant } from '../auto/invariants';
import { matchEvents } from '../auto/log';
import { taskBarValue } from '../Minigames';
import { npcMemory } from '../npc/memory';

/**
 * The task invariant (round 7, 7M; GDD 3.5, A133), registered beside round 6's seven checks and 7H's four, read by
 * `pnpm auto`, the soak and the admin room. `taskBar`: the public bar equals what the lists say (so a fake task never
 * moved it and a ghost's share is capped), an NPC seat holds no list, and every `taskDone` of the match log names a
 * seat whose list has that task done. Hosted by one side-effect import in `sim/Step.ts` (6Z's line), like 7H's
 * `vendettas/run`: every 7M module sits inside the registry's own import closure (`docs/round7/seams.md`), so a
 * registration reached from `sim/Minigames.ts` or `sim/Tasks.ts` would run before the registry exists.
 */

const fail = (room: PartyRoom, detail: string): InvariantFailure => ({
  name: '',
  tick: room.state.tick,
  detail,
});

registerInvariant('taskBar', (room) => {
  const npcs = npcMemory(room).ids;
  for (const [id, player] of room.state.players) {
    const held = player.priv?.tasks.length ?? 0;
    if (npcs.has(id) && held > 0) return fail(room, `NPC seat ${id} holds ${held} tasks`);
  }
  if (room.state.phase !== Phase.lobby) {
    const expected = taskBarValue(room) ?? 0;
    if (room.state.taskBar !== expected)
      return fail(room, `taskBar ${room.state.taskBar}, the lists say ${expected}`);
  }
  for (const e of matchEvents(room)) {
    if (e.kind !== 'taskDone') continue;
    const taskId = e.data?.taskId;
    const entry = room.state.players.get(e.seat ?? '')?.priv?.tasks.find((t) => t.id === taskId);
    if (!entry?.done)
      return fail(
        room,
        `taskDone at tick ${e.tick} for ${e.seat} and ${String(taskId)}, not done on its list`,
      );
  }
  return null;
});
