import { abilities } from '@wdi/content';
import { ClueKind, NotebookEntry, NotebookStatus, TICK_RATE, TILE_PX, moveAabb } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { FOOT_HALF_PX } from './constants';
import { type PlayerSim, simOf } from './RoomSim';
import { navGrid, sceneKey } from './World';

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
 * Pushes a seat `tiles` tiles along the unit vector (ux, uy), swept against the scene's solids with the foot box as a
 * step is (`Movement.ts`), so a figure against a wall stops at it. The ring resets: the next strike's range slack reads
 * the new spot, as after a placement.
 */
function knockBack(room: PartyRoom, p: PlayerSim, ux: number, uy: number, tiles: number): void {
  if (tiles <= 0) return;
  const grid = navGrid(sceneKey(p.sceneIdx), simOf(room).profile);
  const r = moveAabb(grid, p.x, p.y, ux * tiles * TILE_PX, uy * tiles * TILE_PX, FOOT_HALF_PX, FOOT_HALF_PX);
  p.x = r.x;
  p.y = r.y;
  p.resetRing();
}

/**
 * A Bandaged target took the Knife (GDD 3.2): its screen blacks out for `blackoutS` (`Visibility.ts` holds it no
 * avatars, as for an aiming Gamekeeper) and its Notebook gets the attacker's height as Claimed; a living witness within
 * `witnessRadiusTiles` of the striker gets height and scarf as Claimed. The strike has already dropped the striker's
 * disguise (GDD 3.17), so the figure they saw is the true one and no entry says more than the drawn figure did.
 * `Kill.ts` parts the pair after this (`knockBackPair`), so the witnesses are read at the strike's spot.
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

/**
 * A voided Knife strike parts the pair (GDD 3.2; round 10, x10, A393): the target is knocked back
 * `bandage.params.knockbackTiles` along the strike's line, from the attacker through the target, and the attacker the
 * same the other way. Every protection that voids the strike does it (a Bandage, a Watch, a Remedy; `Kill.ts`), so the
 * striker cannot tell from the push which one held; the Charm is not a void (it leaves Wounded) and does not. Two seats
 * on one spot part along the attacker's facing (`yaw` as `Movement.ts` writes it).
 */
export function knockBackPair(room: PartyRoom, attackerId: string, targetId: string): void {
  const sim = simOf(room);
  const attacker = sim.players.get(attackerId);
  const target = sim.players.get(targetId);
  if (!attacker || !target) return;
  const yaw = room.state.players.get(attackerId)?.presence.yaw ?? 0;
  const dx = target.x - attacker.x;
  const dy = target.y - attacker.y;
  const len = Math.hypot(dx, dy);
  const [ux, uy] = len > 0 ? [dx / len, dy / len] : [Math.sin(yaw), -Math.cos(yaw)];
  const tiles = abilities.abilities.bandage?.params?.knockbackTiles ?? 0;
  knockBack(room, target, ux, uy, tiles);
  knockBack(room, attacker, -ux, -uy, tiles);
}
