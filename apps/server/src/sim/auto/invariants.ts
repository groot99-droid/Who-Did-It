import { balance } from '@wdi/content';
import { type InvariantFailure, Phase, TICK_RATE, TILE_PX, VIEW_TAG } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { isAiming } from '../NightPowers';
import { npcMemory } from '../npc/memory';
import { simOf } from '../RoomSim';
import { isWorldPhase } from '../World';
import { isAdminClient } from './AdminView';
import { matchEvents } from './log';

/**
 * The invariant registry (round 6, docs/round6/auto-admin.md 5): checks the harness, `pnpm auto` and the admin room
 * run every few ticks. An invariant returns a failure or null and never mutates the room; a check that follows the
 * match over time keeps its own bookkeeping beside the room and reports each incident once. Round 6 registers the
 * seven checks below (DECISIONS A84); later rounds add theirs (vendettas, the law) under the same registry.
 */
export type Invariant = (room: PartyRoom) => InvariantFailure | null;

// round 8, 8A: a hoisted function, not a module `const`, so a check on this module's own import path (the body's,
// through `AdminView` and the handlers) can register while this module is still loading.
function registry(): Map<string, Invariant> {
  const self = registry as typeof registry & { map?: Map<string, Invariant> };
  return (self.map ??= new Map());
}

export function registerInvariant(name: string, fn: Invariant): void {
  registry().set(name, fn); // round 8, 8A
}

export function registeredInvariants(): readonly string[] {
  return [...registry().keys()]; // round 8, 8A
}

export function runInvariants(room: PartyRoom): InvariantFailure[] {
  const failures: InvariantFailure[] = [];
  for (const [name, fn] of registry()) {
    // round 8, 8A
    const failure = fn(room);
    if (failure) failures.push({ ...failure, name });
  }
  return failures;
}

/** Per-room bookkeeping of the checks that follow the match over time. */
function memo<T>(make: () => T): (room: PartyRoom) => T {
  const all = new WeakMap<PartyRoom, T>();
  return (room) => {
    let v = all.get(room);
    if (v === undefined) all.set(room, (v = make()));
    return v;
  };
}

const fail = (room: PartyRoom, detail: string): InvariantFailure => ({
  name: '',
  tick: room.state.tick,
  detail,
});

// 1. No seat's `priv` (nor its `presence`) in another seat's view (visibility.test.ts's rule).
registerInvariant('privLeak', (room) => {
  for (const client of room.clients) {
    const view = client.view;
    if (!view || isAdminClient(room, client.sessionId) || !room.state.players.has(client.sessionId)) continue;
    for (const [id, player] of room.state.players) {
      if (id === client.sessionId) continue;
      if (view.hasTag(player, VIEW_TAG.priv))
        return fail(room, `seat ${client.sessionId} holds the priv of ${id}`);
      if (view.hasTag(player, VIEW_TAG.presence))
        return fail(room, `seat ${client.sessionId} holds the presence of ${id}`);
    }
  }
  return null;
});

// 2. No `Avatar.seat` (the ghost tag) in a living seat's view (GDD 3.17).
registerInvariant('seatLeak', (room) => {
  const sim = simOf(room);
  for (const client of room.clients) {
    const view = client.view;
    const viewer = sim.players.get(client.sessionId);
    if (!view || !viewer || viewer.dead || isAdminClient(room, client.sessionId)) continue;
    for (const [sceneId, scene] of room.state.scenes) {
      for (const [handle, avatar] of scene.avatars) {
        if (view.hasTag(avatar, VIEW_TAG.ghost))
          return fail(
            room,
            `living seat ${client.sessionId} holds the seat of avatar ${handle} in ${sceneId}`,
          );
      }
    }
  }
  return null;
});

// 3. No NPC stuck: the same unreached activity goal from the same tile for more than `npc.stuckInvariantS`.
interface Watch {
  key: string;
  since: number;
  reported: boolean;
}
const stuckWatch = memo(() => new Map<string, Watch>());
registerInvariant('npcStuck', (room) => {
  const { tick, phase } = room.state;
  const watch = stuckWatch(room);
  const sim = simOf(room);
  const limit = balance.npc.stuckInvariantS * TICK_RATE;
  let found: InvariantFailure | null = null;
  for (const [id, brain] of npcMemory(room).brains) {
    const p = sim.players.get(id);
    const goal = brain.act?.goal;
    const away = goal && p && Math.hypot(goal.x - p.x, goal.y - p.y) > TILE_PX;
    if (!p || !goal || !away || p.dead || !p.placed || !isWorldPhase(phase)) {
      watch.delete(id);
      continue;
    }
    const tile = `${p.sceneIdx}:${Math.floor(p.x / TILE_PX)},${Math.floor(p.y / TILE_PX)}`;
    const key = `${brain.act?.kind}>${goal.scene}:${goal.x},${goal.y}@${tile}`;
    const w = watch.get(id);
    if (!w || w.key !== key) {
      watch.set(id, { key, since: tick, reported: false });
      continue;
    }
    if (w.reported || tick - w.since <= limit) continue;
    w.reported = true;
    found ??= fail(room, `NPC ${id} on ${tile} toward ${brain.act?.kind} goal since tick ${w.since}`);
  }
  return found;
});

// 4. No phase past its end: `phaseEndsTick + 1`, except the reveal a Last Shot aim holds (GDD 3.3, 5G).
registerInvariant('phaseOverrun', (room) => {
  const { tick, phase, phaseEndsTick } = room.state;
  if (phase === Phase.lobby || tick <= phaseEndsTick + 1) return null;
  if (phase === Phase.reveal && [...room.state.players.keys()].some((id) => isAiming(room, id))) return null;
  return fail(room, `phase ${phase} ended at tick ${phaseEndsTick}`);
});

// 5. No exception from `step`: whoever drives the step catches it with `guardStep`, and the check reports it once.
const stepErrors = memo((): InvariantFailure[] => []);
export function guardStep(room: PartyRoom, run: () => void): boolean {
  try {
    run();
    return true;
  } catch (err) {
    stepErrors(room).push(fail(room, String((err as Error)?.stack ?? err)));
    return false;
  }
}
registerInvariant('step', (room) => stepErrors(room).shift() ?? null);

// 6. The match ends by `finalNight.afterCycle + 1` cycles: the rounds stop at the Final Night (GDD 3.3).
registerInvariant('matchLength', (room) => {
  const { phase, round } = room.state;
  if (phase === Phase.lobby || phase === Phase.gameOver) return null;
  const last = balance.finalNight.afterCycle + 1;
  return round > last ? fail(room, `round ${round} after the Final Night (round ${last})`) : null;
});

// 7. Every kill drops its clues: a `clue` event in the kill's scene on the kill's tick (Kill.ts, GDD 3.4).
const killCursor = memo(() => ({ log: null as unknown, next: 0 }));
registerInvariant('killClues', (room) => {
  const log = matchEvents(room);
  const cursor = killCursor(room);
  if (cursor.log !== log) Object.assign(cursor, { log, next: 0 });
  let found: InvariantFailure | null = null;
  for (; cursor.next < log.length; cursor.next++) {
    const kill = log[cursor.next];
    if (kill?.kind !== 'kill') continue;
    const clue = log.some((e) => e.kind === 'clue' && e.tick === kill.tick && e.sceneId === kill.sceneId);
    if (!clue)
      found ??= fail(room, `kill of ${kill.seat} in ${kill.sceneId} at tick ${kill.tick} left no clue`);
  }
  return found;
});
