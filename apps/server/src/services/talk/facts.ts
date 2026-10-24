import type { PlayerState } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';

/**
 * What an NPC seat may talk about (GDD 3.25 "Talk"): only what every seat at the table can see. Names, the public
 * `alive` flag, the meeting's reason, caller, body and roll-call; never a card, a cover, a private view or which
 * seats are NPCs. When 8R's hive lands, its public read replaces the body of this function and nothing else.
 */
export interface PublicFacts {
  round: number;
  /** `body`, `bell`, `missing` or `final` (`MeetingReason`). */
  reason: string;
  /** The caller's name, '' when the caller is the speaker or unknown. */
  caller: string;
  /** The name of the seat whose body called the meeting, '' without one. */
  body: string;
  /** Names of the seats the roll-call found missing. */
  missing: string[];
  /** Names of the other living seats, in roster order. */
  others: string[];
}

const nameOf = (room: PartyRoom, id: string): string => room.state.players.get(id)?.name ?? '';

export function publicFacts(room: PartyRoom, selfId: string): PublicFacts {
  const m = room.state.meeting;
  const others: string[] = [];
  room.state.players.forEach((p: PlayerState, id: string) => {
    if (id !== selfId && p.alive) others.push(p.name);
  });
  return {
    round: room.state.round,
    reason: m.reason,
    caller: m.callerId === selfId ? '' : nameOf(room, m.callerId),
    body: m.bodyOf === '' ? '' : nameOf(room, m.bodyOf),
    missing: [...m.missing].map((id) => nameOf(room, id)).filter((n) => n !== ''),
    others,
  };
}
