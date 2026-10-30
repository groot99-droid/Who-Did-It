import { type SceneId, navs, scenes } from '@wdi/content';
import { NavGrid, Phase, TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../src/rooms/PartyRoom';
import { type MeetingRequest, type DeathEvent, simOf } from '../src/sim/RoomSim';
import { sceneIndex } from '../src/sim/World';
import { until } from './flowHelpers';
import { type Bot, type Match, sleep, standAt } from './simHelpers';

export { sleep };

/** White-box: sets the phase with a far end tick so no phase timer interferes with a short test. */
export function setPhase(m: Match, phase: number): void {
  m.room.state.phase = phase;
  m.room.state.phaseEndsTick = m.room.state.tick + 20 * 3600;
}
export const toDay = (m: Match): void => setPhase(m, Phase.day);

/** White-box: puts a bot on a tile of a scene (sim and roster agree) and refreshes the views. */
export function teleport(m: Match, bot: Bot, sceneId: SceneId, tx: number, ty: number): void {
  const sim = simOf(m.room);
  const p = sim.players.get(bot.id);
  const player = m.room.state.players.get(bot.id);
  if (!p || !player) throw new Error('no seat');
  p.sceneIdx = sceneIndex(sceneId);
  player.priv.sceneId = p.sceneIdx;
  standAt(m, bot, tx, ty);
  sim.viewsDirty = true;
}

/** White-box: a pixel position in the bot's current scene, with a fresh ring. */
export function placeAtPx(m: Match, bot: Bot, x: number, y: number): void {
  const p = simOf(m.room).players.get(bot.id);
  if (!p) throw new Error('no sim');
  p.x = x;
  p.y = y;
  p.resetRing();
}

export const tilePx = (t: number): number => (t + 0.5) * TILE_PX;

export const simOfBot = (m: Match, bot: Bot) => {
  const p = simOf(m.room).players.get(bot.id);
  if (!p) throw new Error('no sim');
  return p;
};
export const playerOf = (m: Match, bot: Bot) => {
  const p = m.room.state.players.get(bot.id);
  if (!p) throw new Error('no player');
  return p;
};

/** Error codes a bot received, in order. */
export const errorCodes = (bot: Bot): number[] =>
  bot.events.filter((e) => e.type === 'error').map((e) => (e.payload as { code: number }).code);
export const eventsOf = (bot: Bot, type: string) =>
  bot.events.filter((e) => e.type === type).map((e) => e.payload);

/** Ticks `act` waits for after its send: the one that consumes the message and two more for whatever it starts. */
export const ACT_TICKS = 3;
/** Longest `act` polls for those ticks; a paused or left room then falls through to the floor below. */
export const ACT_TICK_WAIT_MS = 2000;

/**
 * Sends a message and waits for the server to consume it and reply. Round 10, x16 (6Z's grant of 2026-10-30): the
 * wait is on the room's tick, not the wall clock. The bot's own `state.tick` is the server's, mirrored by the patch
 * of each step (one per tick since x7, A373), so it moves only when a step has run and its patch has crossed the
 * socket. After the send it advances `ACT_TICKS` ticks, then one more patch lands after that observation: a refusal
 * or an event the server sends in a step goes down the same socket before that step's patch, so by then it has
 * arrived. A loaded run that steps late (the `act()` flake of x15, `expected [] to include 427`) now waits for the
 * steps instead of a fixed 200 ms; a quiet one is no faster, since the wait never ends before `ms`.
 */
export async function act(bot: Bot, type: string, payload: unknown, ms = 200): Promise<void> {
  bot.room.send(type, payload);
  const sentAt = Date.now();
  const seen = bot.room.state.tick;
  if (await until(() => bot.room.state.tick >= seen + ACT_TICKS, ACT_TICK_WAIT_MS)) {
    const after = bot.room.state.tick;
    await until(() => bot.room.state.tick > after, ACT_TICK_WAIT_MS);
  }
  const left = ms - (Date.now() - sentAt);
  if (left > 0) await sleep(left);
}

/** A horizontal run of `len` walkable tiles in a scene: the first tile. */
export function openRun(sceneId: SceneId, len: number): { x: number; y: number } {
  const grid = new NavGrid(navs[sceneId], 'small');
  for (let y = 0; y < grid.h; y++)
    for (let x = 0; x + len <= grid.w; x++) {
      let ok = true;
      for (let i = 0; i < len && ok; i++) ok = !grid.solidAt(x + i, y);
      if (ok) return { x, y };
    }
  throw new Error(`no run in ${sceneId}`);
}

/** Records every meeting request and death the sim receives, even if a later stage drains the queue. */
export function record(m: Match): { requests: MeetingRequest[]; deaths: DeathEvent[] } {
  const sim = simOf(m.room);
  const out = { requests: [] as MeetingRequest[], deaths: [] as DeathEvent[] };
  const watch = <T>(key: 'meetingRequests' | 'deaths', into: T[]) => {
    const wrap = (arr: T[]): T[] => {
      const push = arr.push.bind(arr);
      arr.push = (...items: T[]) => {
        into.push(...items);
        return push(...items);
      };
      return arr;
    };
    let cur = wrap(sim[key] as unknown as T[]);
    Object.defineProperty(sim, key, { get: () => cur, set: (v: T[]) => (cur = wrap(v)), configurable: true });
  };
  watch('meetingRequests', out.requests);
  watch('deaths', out.deaths);
  return out;
}

/** The overworld prop of a given id, as a tile. */
export const prop = (id: string): { x: number; y: number } => {
  const p = scenes.overworld.props.find((q) => q.id === id);
  if (!p) throw new Error(`no prop ${id}`);
  return { x: p.x, y: p.y };
};

/** Clears the Knife's cooldown (the entry K writes at day). */
export function readyKnife(m: Match, bot: Bot): void {
  playerOf(m, bot).priv.cooldownEndTick.set('kill', 0);
}

export const room = (m: Match): PartyRoom => m.room;

/** Flattens a decoded state into `path -> value`, to diff what a client held before and after. */
export function flatten(
  value: unknown,
  path = '',
  out: Record<string, unknown> = {},
): Record<string, unknown> {
  if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>))
      flatten(v, path ? `${path}.${k}` : k, out);
  } else out[path] = value;
  return out;
}

/** Paths whose value differs (added, removed or changed) between two flattened snapshots. */
export function diffPaths(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((k) => before[k] !== after[k]).sort();
}
