import {
  STEM_KINDS,
  balance,
  classesOfProp,
  interactions,
  items,
  propStem,
  scenes,
  type Interaction,
  type Mode,
  type SceneId,
} from '@wdi/content';
import {
  Phase,
  PropState,
  S2C,
  TICK_RATE,
  TILE_PX,
  refusalFrame,
  type PlayerState,
  type RefusalArgMap,
  type RefusalReason,
} from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { addStack, canAdd, count, take } from '../Inventory';
import { runJailBoards, startJailGame, startLockpick } from '../Minigames';
import { emitNoise } from '../Noise';
import { type PlayerSim, simOf } from '../RoomSim';
import type { MatchSeeds } from '../seeds';
import { isVerbPhase, sceneKey, tileCentre } from '../World';

/**
 * The logic table's resolver (round 10, A10; docs/round9/logic-table.md 4, GDD 3.14): `act.hold {action: 'interact',
 * targetId, via?}` finds the prop's class in `interactions.json`, picks the interaction and the first mode whose tool
 * the seat holds, and runs it as a hold beside the legacy actions, which stay until their callers move. Humans and NPC
 * seats come through the same `handleHold`. A prop's changed state is public to its scene and never names who changed
 * it; the drops roll on the `loot` stream.
 */

interface Target {
  sceneId: SceneId;
  id: string;
  x: number;
  y: number;
  classId: string;
  stem: string | undefined;
}

/** What a running interact hold chose when it started. */
interface Running {
  interactionId: string;
  modeIdx: number;
}

type Problem = { [R in RefusalReason]: { reason: R; args?: RefusalArgMap[R] } }[RefusalReason];

const RUNNING = new WeakMap<PlayerSim, Running>();
/** Uses worn off each seat's tools, by item id; server memory only. */
const WORN = new WeakMap<PartyRoom, Map<string, Map<string, number>>>();
/** The match whose prop states the scenes hold. */
const MATCH = new WeakMap<PartyRoom, MatchSeeds>();

const NIGHT: ReadonlySet<number> = new Set([Phase.night, Phase.finalNight]);

/** The placed prop `targetId` in the seat's scene with the class that answers for it, or null. */
function targetOf(room: PartyRoom, p: PlayerSim, targetId: string): Target | null {
  return targetIn(room, sceneKey(p.sceneIdx), targetId);
}

function targetIn(room: PartyRoom, sceneId: SceneId, targetId: string): Target | null {
  const prop = scenes[sceneId].props.find((pr) => pr.id === targetId);
  if (!prop || (prop.profiles !== undefined && !prop.profiles.includes(simOf(room).profile))) return null;
  const [classId] = classesOfProp(interactions, prop);
  if (classId === undefined) return null;
  const stem = STEM_KINDS.has(prop.kind) ? propStem(prop.id) : undefined;
  return {
    sceneId,
    id: prop.id,
    x: tileCentre(prop.x, TILE_PX),
    y: tileCentre(prop.y, TILE_PX),
    classId,
    stem,
  };
}

/** The items that carry `tag` at `tier` or more, the lowest tier first, so the plainest tool held does the work. */
function toolsFor(tag: string, tier: number): string[] {
  return Object.values(items.items)
    .filter((it) => (it.tool?.[tag as keyof typeof it.tool] ?? 0) >= tier)
    .sort((a, b) => (a.tool?.[tag as never] ?? 0) - (b.tool?.[tag as never] ?? 0) || a.id.localeCompare(b.id))
    .map((it) => it.id);
}

/** The item a mode would wear, `null` for bare hands, or undefined when the seat cannot run it. */
function toolHeld(player: PlayerState, mode: Mode, t: Target): string | null | undefined {
  if (mode.only !== undefined && (t.stem === undefined || !mode.only.includes(t.stem))) return undefined;
  if (mode.tool === null) return null;
  return toolsFor(mode.tool.tag, mode.tool.tier).find((id) => count(player, id) > 0);
}

const runnable = (player: PlayerState, it: Interaction, t: Target): number =>
  it.modes.findIndex((m) => toolHeld(player, m, t) !== undefined);

/** The interaction a hold on `t` runs: one whose tool `via` names if given, else the first the seat can run. */
function chooseInteraction(player: PlayerState, t: Target, via: string | undefined): string | undefined {
  const list = Object.entries(interactions.interactions).filter(([, it]) => it.target === t.classId);
  const viaFits = ([, it]: [string, Interaction]) =>
    it.modes.some((m) => m.tool !== null && (items.items[via ?? '']?.tool?.[m.tool.tag] ?? 0) >= m.tool.tier);
  const pick =
    (via !== undefined ? list.find(viaFits) : undefined) ??
    list.find(([, it]) => runnable(player, it, t) >= 0);
  return (pick ?? list[0])?.[0];
}

function stateOf(room: PartyRoom, t: Target) {
  return room.state.scenes.get(t.sceneId)?.propStates.get(t.id);
}

/** The first item a mode consumes that the seat holds too few of, or undefined when it holds them all. */
const missingInput = (player: PlayerState, mode: Mode): string | undefined =>
  mode.consumes?.find((c) => count(player, c.item) < c.qty)?.item;

const spent = (room: PartyRoom, t: Target): boolean => {
  const state = stateOf(room, t);
  return state !== undefined && (state.untilTick === 0 || room.state.tick < state.untilTick);
};

/**
 * Whether a seat holding what `player` holds could run an interaction on prop `propId` of `sceneId` now, wherever it
 * stands: a live interaction open in the phase, the prop not spent, a mode the seat's tools run with no mini-game.
 * An NPC seat's routine picks only such props (round 10, D1), so it never walks to a wall it cannot pass.
 */
export function interactReady(
  room: PartyRoom,
  player: PlayerState,
  sceneId: SceneId,
  propId: string,
): boolean {
  const t = targetIn(room, sceneId, propId);
  if (!t || !isVerbPhase(room.state.phase) || spent(room, t)) return false;
  const cls = NIGHT.has(room.state.phase) ? 'night' : 'day';
  return Object.values(interactions.interactions).some(
    (it) =>
      it.target === t.classId &&
      it.status === 'live' &&
      it.phases.includes(cls) &&
      it.modes.some(
        (m) => m.minigame === undefined && toolHeld(player, m, t) !== undefined && !missingInput(player, m),
      ),
  );
}

/** Why the hold cannot start or go on this tick, or null; also picks the mode it runs. */
function problemOf(
  room: PartyRoom,
  player: PlayerState,
  p: PlayerSim,
  targetId: string,
  interactionId: string | undefined,
): { problem: Problem | null; t?: Target; modeIdx?: number } {
  const { phase, tick } = room.state;
  if (!isVerbPhase(phase)) return { problem: { reason: 'PHASE_CLOSED' } };
  if (p.dead || !p.placed) return { problem: { reason: 'NOT_IN_PLAY' } };
  if (tick < p.busyUntilTick) return { problem: { reason: 'BUSY' } };
  const t = targetOf(room, p, targetId);
  if (!t) return { problem: { reason: 'NO_TARGET' } };
  const it = interactionId === undefined ? undefined : interactions.interactions[interactionId];
  if (!it) return { problem: { reason: 'NFY', args: { feature: 'this action' } }, t };
  if (it.status === 'nfy')
    return { problem: { reason: 'NFY', args: { feature: it.feature ?? 'this action' } }, t };
  if (!it.phases.includes(NIGHT.has(phase) ? 'night' : 'day'))
    return { problem: { reason: 'PHASE_CLOSED' }, t };
  if (spent(room, t)) return { problem: { reason: 'NOTHING_THERE' }, t };
  if (Math.hypot(p.x - t.x, p.y - t.y) > balance.doors.reachTiles * TILE_PX)
    return { problem: { reason: 'TOO_FAR', args: { of: 'pile' } }, t };
  const modeIdx = runnable(player, it, t);
  const mode = it.modes[modeIdx];
  if (!mode) {
    const wall = it.modes.find((m) => m.tool !== null)?.tool;
    const need = wall ? toolsFor(wall.tag, wall.tier)[0] : undefined;
    return { problem: { reason: 'NEED_TOOL', args: need && wall ? { need, tier: wall.tier } : {} }, t };
  }
  const lacking = missingInput(player, mode);
  if (lacking !== undefined) return { problem: { reason: 'NEED_ITEM', args: { need: lacking } }, t };
  if ((mode.drops ?? []).some((d) => !canAdd(player, d.item, d.qty[1])))
    return { problem: { reason: 'PACK_FULL' }, t };
  if (it.handler === 'sharpen' && !hasWorn(room, player)) return { problem: { reason: 'ALREADY_DONE' }, t };
  return { problem: null, t, modeIdx };
}

function refuse(
  room: PartyRoom,
  sessionId: string,
  problem: Problem,
  interactionId: string | undefined,
): void {
  const line = interactionId ? interactions.interactions[interactionId]?.fail[problem.reason] : undefined;
  const extra = { ...(line ? { msg: line } : {}), ...(interactionId ? { interaction: interactionId } : {}) };
  room.clients
    .getById(sessionId)
    ?.send(S2C.error, refusalFrame(problem.reason, problem.args as never, extra));
}

/** `act.hold {action: 'interact', targetId, via?}` (`sim/Hold.ts`): starts the hold if it can run. */
export function handleInteract(room: PartyRoom, sessionId: string, targetId: string, via?: string): void {
  const player = room.state.players.get(sessionId);
  const p = simOf(room).players.get(sessionId);
  if (!player || !p) return;
  const t = targetOf(room, p, targetId);
  const interactionId = t ? chooseInteraction(player, t, via) : undefined;
  const { problem, modeIdx } = problemOf(room, player, p, targetId, interactionId);
  if (problem) return refuse(room, sessionId, problem, interactionId);
  const mode = interactions.interactions[interactionId as string]?.modes[modeIdx as number];
  // A mode with a mini-game (the lock-pick, round 10 D5) opens it in place of a hold.
  if (t && mode?.minigame !== undefined && startJailGame(room, sessionId, mode.minigame, t)) return;
  if (mode?.minigame !== undefined && mode.minigame !== 'lockpick')
    return refuse(room, sessionId, { reason: 'NFY', args: { feature: 'this action' } }, interactionId);
  if (t && mode?.minigame === 'lockpick')
    return startLockpick(
      room,
      sessionId,
      { sceneId: t.sceneId, propId: t.id, interactionId: interactionId as string },
      mode.noise,
    );
  // Pressing again on the same target keeps the original start; another target restarts.
  if (p.hold?.action === 'interact' && p.hold.targetId === targetId) return;
  p.hold = { action: 'interact', targetId, startTick: room.state.tick };
  RUNNING.set(p, { interactionId: interactionId as string, modeIdx: modeIdx as number });
}

/**
 * One tick of an interact hold (`runHolds`): moving, a phase change, a prop another seat changed, a lost tool or a
 * full pack cancel it with nothing done; at the end of `holdS` the drops land, the tool wears, the prop changes state
 * and the noise sounds. A `sharpen` hold (the grindstone, round 10, x9) instead forgets every use worn off the seat's
 * tools, so each is whole again; a tool that broke is gone for good.
 */
export function tickInteract(room: PartyRoom, sessionId: string, p: PlayerSim): void {
  const hold = p.hold;
  const run = RUNNING.get(p);
  const player = room.state.players.get(sessionId);
  if (!hold || !run || !player) return void (p.hold = null);
  const { problem, t, modeIdx } = problemOf(room, player, p, hold.targetId, run.interactionId);
  if (problem || !t || modeIdx !== run.modeIdx || p.vx !== 0 || p.vy !== 0) return void (p.hold = null);
  const it = interactions.interactions[run.interactionId] as Interaction;
  const mode = it.modes[modeIdx] as Mode;
  if (room.state.tick - hold.startTick < Math.round((mode.holdS ?? 0) * TICK_RATE)) return;
  p.hold = null;
  const rng = room.seeds.get('loot');
  for (const d of mode.drops ?? []) {
    if (d.chance !== undefined && rng() >= d.chance) continue;
    addStack(player, d.item, d.qty[0] + Math.floor(rng() * (d.qty[1] - d.qty[0] + 1)));
  }
  for (const c of mode.consumes ?? []) take(player, c.item, c.qty);
  const tool = toolHeld(player, mode, t);
  if (tool) wear(room, sessionId, player, tool, mode.wear);
  if (it.handler === 'sharpen') WORN.get(room)?.delete(sessionId);
  if (it.after) {
    const state = new PropState();
    state.id = t.id;
    state.state = it.after.state;
    state.untilTick =
      it.after.respawnS === null ? 0 : room.state.tick + Math.round(it.after.respawnS * TICK_RATE);
    room.state.scenes.get(t.sceneId)?.propStates.set(t.id, state);
  }
  if (mode.noise !== null)
    emitNoise(room, t.sceneId, t.x, t.y, balance.noise[mode.noise], mode.noise, sessionId);
}

/** Wears `n` uses off the seat's `tool`; the tool breaks (one is taken) when its `uses` run out. */
export function wear(room: PartyRoom, sessionId: string, player: PlayerState, tool: string, n: number): void {
  const uses = items.items[tool]?.uses;
  if (uses === undefined || n === 0) return;
  const bySeat = WORN.get(room) ?? new Map<string, Map<string, number>>();
  WORN.set(room, bySeat);
  const worn = bySeat.get(sessionId) ?? new Map<string, number>();
  bySeat.set(sessionId, worn);
  const total = (worn.get(tool) ?? 0) + n;
  if (total < uses) return void worn.set(tool, total);
  take(player, tool, 1);
  worn.set(tool, 0);
}

/** Whether a tool the seat still carries has uses worn off it (round 10, x9: the grindstone has work only then). */
function hasWorn(room: PartyRoom, player: PlayerState): boolean {
  for (const [tool, n] of WORN.get(room)?.get(player.id) ?? [])
    if (n > 0 && count(player, tool) > 0) return true;
  return false;
}

/** Step stage after `runResources`: a new match clears the prop states and the wear; a respawned prop is whole again. */
export function runInteract(room: PartyRoom): void {
  if (MATCH.get(room) !== room.seeds) {
    MATCH.set(room, room.seeds);
    WORN.delete(room);
    room.state.scenes.forEach((scene) => scene.propStates.clear());
    return;
  }
  const tick = room.state.tick;
  room.state.scenes.forEach((scene) => {
    for (const [id, s] of scene.propStates)
      if (s.untilTick !== 0 && tick >= s.untilTick) scene.propStates.delete(id);
  });
  runJailBoards(room);
}

/** The tool uses worn off a seat's `item` (tests). */
export const wornOf = (room: PartyRoom, sessionId: string, item: string): number =>
  WORN.get(room)?.get(sessionId)?.get(item) ?? 0;
