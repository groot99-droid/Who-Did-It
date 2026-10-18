import { S2C, type DeathCause } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { rehandle } from './Avatars';
import { beginAim } from './NightPowers';
import { simOf } from './RoomSim';
import { sceneKey } from './World';

/**
 * Turns a player into a ghost (A30): `PlayerSim.dead` in room memory (the public `alive` stays true
 * until the next meeting), the death queued for the phase stage, the private `killed` message with every
 * seat's role, and the views marked dirty so the living stop receiving the ghost's presence this tick.
 * Round 5 (locked call sites): the victim's avatar is re-handled (5F) and a dying Gamekeeper's aim (5G) defers
 * `killed` until the aim closes.
 */
export function markDead(room: PartyRoom, victimId: string, cause: DeathCause, killerId?: string): void {
  const sim = simOf(room);
  const p = sim.players.get(victimId);
  if (!p || p.dead) return;
  p.dead = true;
  p.hold = null;
  sim.deaths.push(
    killerId === undefined
      ? { playerId: victimId, cause, tick: room.state.tick }
      : { playerId: victimId, cause, killerId, tick: room.state.tick },
  );
  sim.viewsDirty = true;
  rehandle(room, victimId, false);
  if (beginAim(room, victimId, cause)) return;
  const roles: Record<string, string> = {};
  for (const [id, player] of room.state.players) roles[id] = player.priv.role.roleId;
  room.clients.getById(victimId)?.send(S2C.killed, { sceneId: sceneKey(p.sceneIdx), cause, roles });
}
