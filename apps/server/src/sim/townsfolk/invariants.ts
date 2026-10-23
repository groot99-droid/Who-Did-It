import { type InvariantFailure } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { registerInvariant } from '../auto/invariants';
import { avatarMemory, avatarOf } from '../Avatars';
import { StatusBit } from '../constants';
import { simOf } from '../RoomSim';
import { figuresOf } from './figures';

/**
 * `figureNotSeat` (round 8, docs/round8/townsfolk.md 4, GDD 3.24): no ambient figure in any seat list, vote, death
 * or meeting, and no figure avatar that could pass for a seat's (a handle in `seatOf`, a ghost bit, a true seat, a
 * card's look). Registered with the round-6 registry; `tools/auto/checks` lists it for the runner.
 */
registerInvariant('figureNotSeat', (room: PartyRoom): InvariantFailure | null => {
  const tick = room.state.tick;
  const fail = (detail: string): InvariantFailure => ({ name: '', tick, detail });
  const sim = simOf(room);
  const handles = avatarMemory(room);
  const meeting = room.state.meeting;
  for (const [id, f] of figuresOf(room)) {
    if (room.state.players.has(id) || sim.players.has(id)) return fail(`figure ${id} holds a seat`);
    if (f.handle !== null) {
      if (handles.seatOf.has(f.handle) || handles.handleOf.has(id))
        return fail(`figure ${id}'s handle is a seat's`);
      const avatar = avatarOf(room, f.handle);
      if (avatar) {
        if (avatar.seat !== '') return fail(`figure ${id}'s avatar names a seat`);
        if ((avatar.statusBits & StatusBit.ghost) !== 0)
          return fail(`figure ${id}'s avatar wears the ghost bit`);
        if (!avatar.lookOf.startsWith('villager'))
          return fail(`figure ${id} wears the look ${avatar.lookOf}`);
      }
    }
    if (sim.deaths.some((d) => d.playerId === id || d.killerId === id))
      return fail(`figure ${id} in the deaths`);
    if (sim.meetingRequests.some((r) => r.callerId === id || r.bodyOf === id))
      return fail(`figure ${id} in a meeting request`);
    if (meeting.callerId === id || meeting.bodyOf === id) return fail(`figure ${id} in the meeting`);
    for (const [seat, player] of room.state.players) {
      if (player.priv?.myVote === id) return fail(`seat ${seat} votes for figure ${id}`);
    }
  }
  return null;
});
