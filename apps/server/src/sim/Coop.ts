import { tasks } from '@wdi/content';
import { S2C, TICK_RATE, coopDone, coopProgress, coopTicks } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { type PlayerSim, simOf } from './RoomSim';
import { atNode, completeTask } from './tasks/complete';
import { isVerbPhase, reject } from './World';
import { refusal, type Refusal } from './refusal';
import { clientOf } from './seatIds';

/**
 * The co-op hold (round 7, 7M; GDD 3.5 "Shutter the windows", A133 (11)). A task of kind `coop` has no puzzle: its
 * `act.hold {action: 'task'}` is a press-and-hold like Collect, kept in `PlayerSim.hold` and re-validated every tick
 * from `runHolds`. The progress is shared: one count per task in room memory, moved once a tick by whichever holder
 * `runHolds` reaches first, by `coopTicks` (runs with `coopPlayers` hands, pauses with fewer). When everyone has let
 * go the next hold starts it again from nothing. At `holdS` the task completes for every holder whose own list has it
 * undone, through the same `completeTask` as the stations; a helper without it earns nothing, and nothing public says
 * who had it. Each holder hears `coopHold` (holders, progress) when either changes.
 */

type CoopTask = (typeof tasks.tasks)[string] & { kind: 'coop' };

interface Shared {
  ticks: number;
  /** The tick the shared step last ran, so only the first holder of a tick moves it. */
  lastTick: number;
  holders: number;
  progress: number;
}

const shared = new WeakMap<object, Map<string, Shared>>();

function sharedOf(room: PartyRoom, taskId: string): Shared {
  let m = shared.get(room.seeds);
  if (!m) shared.set(room.seeds, (m = new Map()));
  let s = m.get(taskId);
  if (!s) m.set(taskId, (s = { ticks: 0, lastTick: -1, holders: 0, progress: 0 }));
  return s;
}

const coopTask = (taskId: string): CoopTask | undefined => {
  const t = tasks.tasks[taskId];
  return t?.kind === 'coop' ? (t as CoopTask) : undefined;
};

/** Why `p` cannot hold `task` now, or null: the same check starts the hold and keeps it. */
function coopProblem(room: PartyRoom, p: PlayerSim, task: CoopTask): Refusal | null {
  if (!isVerbPhase(room.state.phase)) return refusal('PHASE_CLOSED');
  if (!p.placed) return refusal('NOT_IN_PLAY');
  if (room.state.tick < p.busyUntilTick) return refusal('BUSY');
  if (!task.targets.some((n) => atNode(p, n, task.coopRadiusTiles ?? 2)))
    return refusal('TOO_FAR', { of: 'task' });
  return null;
}

/** Whether `p` holds `task` and still may: standing still within range in a verb phase. */
const holding = (room: PartyRoom, p: PlayerSim, task: CoopTask): boolean =>
  p.hold?.action === 'task' &&
  p.hold.targetId === task.id &&
  p.vx === 0 &&
  p.vy === 0 &&
  coopProblem(room, p, task) === null;

function holdersOf(room: PartyRoom, task: CoopTask): string[] {
  const ids: string[] = [];
  for (const [id, q] of simOf(room).players) if (holding(room, q, task)) ids.push(id);
  return ids;
}

/** Call site: `handleTaskHold` in `sim/Minigames.ts`, for a task of kind `coop`. */
export function handleCoopHold(room: PartyRoom, sessionId: string, taskId: string): void {
  const p = simOf(room).players.get(sessionId);
  const task = coopTask(taskId);
  if (!p) return;
  if (!task) return reject(room, sessionId, 'BAD_REQUEST');
  const problem = coopProblem(room, p, task);
  if (problem) return reject(room, sessionId, problem);
  if (p.hold?.action === 'task' && p.hold.targetId === taskId) return;
  // The first hand on the shutters after everyone let go starts from nothing.
  if (holdersOf(room, task).length === 0) sharedOf(room, taskId).ticks = 0;
  p.hold = { action: 'task', targetId: taskId, startTick: room.state.tick };
}

/** Call site: `runHolds` in `sim/Hold.ts`, for every seat whose hold is a task. Moves the shared count once a tick. */
export function tickCoop(room: PartyRoom, sessionId: string, p: PlayerSim): void {
  const task = p.hold ? coopTask(p.hold.targetId) : undefined;
  if (!task || !holding(room, p, task)) {
    p.hold = null;
    return;
  }
  const s = sharedOf(room, task.id);
  const tick = room.state.tick;
  if (s.lastTick === tick) return;
  s.lastTick = tick;
  const holders = holdersOf(room, task);
  s.ticks = coopTicks(s.ticks, holders.length, task.coopPlayers ?? 2);
  const done = coopDone(s.ticks, task.holdS, TICK_RATE);
  const progress = done ? 1 : coopProgress(s.ticks, task.holdS, TICK_RATE);
  if (holders.length !== s.holders || progress !== s.progress) {
    s.holders = holders.length;
    s.progress = progress;
    for (const id of holders) {
      clientOf(room, id)?.send(S2C.coopHold, { taskId: task.id, holders: holders.length, progress });
    }
  }
  if (!done) return;
  for (const id of holders) {
    const player = room.state.players.get(id);
    const q = simOf(room).players.get(id);
    if (player && q && player.priv.tasks.some((t) => t.id === task.id && !t.done))
      completeTask(room, id, player, q, task.id);
    if (q) q.hold = null;
  }
  s.ticks = 0;
  s.holders = 0;
  s.progress = 0;
}
