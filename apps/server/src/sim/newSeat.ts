import { Inventory, Player, type PlayerState, Presence, Private, Role, Traits } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';

/**
 * The seat constructor shared by `PartyRoom.onJoin`, the NPC seats and the fresh seat ids of a world match: a
 * connected, empty lobby seat. It lives apart from `handlers/lobby.ts` (which re-exports it) so `sim/seatIds.ts` needs
 * no import of the lobby handler: that import closed a cycle through `Flow` and `Deck` (round 10, W1a).
 */
export function newSeat(room: PartyRoom, id: string, name: string): PlayerState {
  const player = new Player();
  player.id = id;
  player.name = name;
  player.connected = true;
  player.traits = new Traits();
  player.presence = new Presence();
  player.priv = new Private();
  player.priv.role = new Role();
  player.priv.inventory = new Inventory();
  room.state.players.set(id, player);
  return player;
}
