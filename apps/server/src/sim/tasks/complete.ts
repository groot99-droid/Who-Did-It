import { balance, scenes, tasks } from '@wdi/content';
import { LedgerLine, TILE_PX, type PlayerState } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { emitSim } from '../events/bus';
import { take } from '../Inventory';
import { recomputeTaskBar } from '../Minigames';
import type { PlayerSim } from '../RoomSim';
import { sceneKey, tileCentre } from '../World';

// Round 7 (7M, GDD 3.5): what a station's mini-game and the co-op hold share, so `sim/Coop.ts` and `sim/Minigames.ts`
// need not import each other.

/** Whether `p` stands in `node`'s scene within `tiles` (the station reach of GDD 3.5 by default) of its prop. */
export function atNode(
  p: PlayerSim,
  node: { scene: string; prop: string },
  tiles: number = balance.doors.reachTiles,
): boolean {
  const here = sceneKey(p.sceneIdx);
  const prop = node.scene === here ? scenes[here]?.props.find((q) => q.id === node.prop) : undefined;
  return (
    prop !== undefined &&
    Math.hypot(p.x - tileCentre(prop.x, TILE_PX), p.y - tileCentre(prop.y, TILE_PX)) <= tiles * TILE_PX
  );
}

/**
 * Marks `taskId` done on this seat's list: a real task gives its deliverable back and moves the bar, a fake one does
 * neither; both write the alibi entry of GDD 3.5 (the time and the scene) and fire `taskDone` on the sim bus (A133 (9),
 * for the log and round 8's wages; `data.fake` never reaches a client).
 */
export function completeTask(
  room: PartyRoom,
  sessionId: string,
  player: PlayerState,
  p: PlayerSim,
  taskId: string,
): void {
  const entry = player.priv.tasks.find((t) => t.id === taskId);
  const task = tasks.tasks[taskId];
  if (!entry || !task) return;
  if (!entry.fake && task.tool !== undefined) take(player, task.tool, task.toolQty ?? 1);
  entry.done = true;
  const line = new LedgerLine();
  line.sceneId = p.sceneIdx;
  line.tick = room.state.tick;
  player.priv.ledger.push(line);
  emitSim(room, {
    tick: room.state.tick,
    kind: 'taskDone',
    seat: sessionId,
    sceneId: sceneKey(p.sceneIdx),
    data: { taskId, fake: entry.fake },
  });
  if (!entry.fake) recomputeTaskBar(room);
}
