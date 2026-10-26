import { abilities } from '@wdi/content';
import { ClueKind, NotebookEntry, NotebookStatus, TICK_RATE, TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { simOf } from './RoomSim';

/** A Claimed clue entry about a figure the seat saw (the Notebook's `clueKind` and `value`, as a collected clue's). */
function claim(room: PartyRoom, seat: string, kind: number, value: number): void {
  const player = room.state.players.get(seat);
  const p = simOf(room).players.get(seat);
  if (!player?.priv || !p) return;
  const entry = new NotebookEntry();
  entry.id = `entry_${++p.entrySeq}`;
  entry.clueKind = kind;
  entry.value = value;
  entry.sceneId = p.sceneIdx;
  entry.tick = room.state.tick;
  entry.status = NotebookStatus.claimed;
  player.priv.notebook.push(entry);
}

/**
 * A Bandaged target took the Knife (GDD 3.2): its screen blacks out for `blackoutS` (`Visibility.ts` holds it no
 * avatars, as for an aiming Gamekeeper) and its Notebook gets the attacker's height as Claimed; a living witness within
 * `witnessRadiusTiles` of the striker gets height and scarf as Claimed. The strike has already dropped the striker's
 * disguise (GDD 3.17), so the figure they saw is the true one and no entry says more than the drawn figure did.
 */
export function onBandagedStrike(room: PartyRoom, attackerId: string, targetId: string): void {
  const sim = simOf(room);
  const params = abilities.abilities.bandage?.params;
  const attacker = sim.players.get(attackerId);
  const traits = room.state.players.get(attackerId)?.traits;
  const target = sim.players.get(targetId);
  if (!attacker || !target || !traits) return;
  target.blindUntilTick = room.state.tick + Math.round((params?.blackoutS ?? 0) * TICK_RATE);
  claim(room, targetId, ClueKind.footprints, traits.height);
  const reach = (params?.witnessRadiusTiles ?? 0) * TILE_PX;
  for (const [id, p] of sim.players) {
    if (id === attackerId || id === targetId || !p.placed || p.dead || p.sceneIdx !== attacker.sceneIdx)
      continue;
    if (Math.hypot(p.x - attacker.x, p.y - attacker.y) > reach) continue;
    claim(room, id, ClueKind.footprints, traits.height);
    claim(room, id, ClueKind.thread, traits.scarf);
  }
}
