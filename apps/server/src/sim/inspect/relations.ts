import { relations, roles, type Relation } from '@wdi/content';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { mapIdOfRoom } from '../MapSites';
import { openContract } from '../vendettas/contract';
import { vendettaOf } from '../vendettas/state';

// The relations table (GDD 3.22 "Inspect"; docs/round8/body.md 7), Session 8B. Matching is server-side only and reads
// the true cards; what it changes is NPC suspicion (room memory) and a hunch to the inspected human, never anything
// a third client receives.

/** Whether one side of a row describes `seat`; `other` is the inspector when `seat` is the inspected. */
function sideHolds(room: PartyRoom, side: string, seat: string, look: string, other: string): boolean {
  if (side === 'mark') return openContract(room, other)?.target === seat;
  const at = side.indexOf(':');
  const kind = side.slice(0, at);
  const id = side.slice(at + 1);
  const role = room.state.players.get(seat)?.priv?.role.roleId ?? '';
  switch (kind) {
    case 'role':
      return role === id;
    case 'faction':
      return roles.roles[role]?.faction === id;
    case 'vendetta':
      return vendettaOf(room, seat)?.id === id;
    case 'look':
      return look === id;
    default:
      return false; // `figure:` (8E) has no seat
  }
}

export interface Seen {
  seat: string;
  /** The look it is drawn as now. */
  look: string;
}

/** Every live row of this map that holds for the pair, in file order. */
export function matchRelations(room: PartyRoom, by: Seen, target: Seen): Relation[] {
  const map = mapIdOfRoom(room);
  return relations.rows.filter(
    (row) =>
      !row.inert &&
      (row.map === undefined || row.map === map) &&
      sideHolds(room, row.inspector, by.seat, by.look, target.seat) &&
      sideHolds(room, row.inspected, target.seat, target.look, by.seat),
  );
}
