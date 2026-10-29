import { randomInt } from 'node:crypto';
import { generateId } from '@colyseus/core';
import { MAP_IDS } from '@wdi/content';
import { MAX_PLAYERS, NpcLevel, Phase } from '@wdi/shared';
import { type FixedSeeds, MatchSeeds, type SeedWords, type StreamName } from '../seeds';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { startMatch, startRefusal } from '../../rooms/handlers/lobby';
import { isNpcSeat, releaseNpcSeat } from '../Npc';
import { addNpcSeat } from '../npc/seats';
import { simOf } from '../RoomSim';
import { resetToLobby } from '../Win';
import { clockOf } from './clock';

/**
 * The all-NPC match (round 6, docs/round6/auto-admin.md 3, GDD 3.19): a room whose every seat is an NPC, started
 * inside the step with no leader, at the clock's speed. `enableAuto` is the one production path allowed to assign
 * `room.fixedSeeds` (`seeds.test.ts` allowlist), and this file is the only writer of the clock (`auto.test.ts`).
 */
export interface AutoOptions {
  map: string;
  seats: number;
  difficulty: 'easy' | 'normal' | 'hard';
  seeds?: FixedSeeds;
  /** Fixed NPC seat ids, for replay and the log; drawn when absent. */
  npcIds?: string[];
}

export type AutoCommand =
  | { kind: 'start' }
  | { kind: 'reset' }
  | { kind: 'clock'; scale?: 1 | 2 | 5 | 10; paused?: boolean; step?: number }
  | { kind: 'setup'; options: AutoOptions };

export interface AutoState {
  /** An NPC Killer may take an NPC as prey (`preyFor`, `sim/npc/world.ts`). */
  npcPrey: boolean;
  /** Queued by the admin handlers and the harness, applied by `runAuto` inside the step. */
  commands: AutoCommand[];
  started: boolean;
  /** The options in force, with the seed words and seat ids filled in, so a run can be replayed from them. */
  options: AutoOptions;
}

/** Every stream of `sim/seeds.ts`: an auto match fixes them all, so its seed record replays it whole. */
const STREAMS = {
  deal: 1,
  traits: 1,
  npcNames: 1,
  piles: 1,
  npcTiming: 1,
  npcPlay: 1,
  mobs: 1,
  nodes: 1,
  minigame: 1,
  contract: 1,
  events: 1,
  vendetta: 1,
  tasks: 1,
  body: 1, // round 8, 8A
  purse: 1,
  talk: 1, // round 8, 8T (with the `talk` stream)
  townsfolk: 1, // round 8, 8E
  loot: 1, // round 10, A10
} satisfies Record<StreamName, 1>;
export const AUTO_STREAMS = Object.keys(STREAMS) as StreamName[];

const SCALES: readonly number[] = [1, 2, 5, 10];

const drawWords = (): SeedWords => [
  randomInt(2 ** 32),
  randomInt(2 ** 32),
  randomInt(2 ** 32),
  randomInt(2 ** 32),
];

/** Why the options cannot run, or null. */
export function autoOptionsProblem(opts: AutoOptions): string | null {
  if (!(MAP_IDS as readonly string[]).includes(opts.map)) return `unknown map ${opts.map}`;
  if (!(opts.difficulty in NpcLevel)) return `unknown difficulty ${String(opts.difficulty)}`;
  if (!Number.isInteger(opts.seats) || opts.seats < 1 || opts.seats > MAX_PLAYERS)
    return `seats must be 1 to ${MAX_PLAYERS}`;
  if (opts.npcIds !== undefined && new Set(opts.npcIds).size !== opts.npcIds.length)
    return 'duplicate npcIds';
  return null;
}

export function autoOf(room: PartyRoom): AutoState | null {
  return simOf(room).auto;
}

/** Seeds, settings and seats from the options; the room must be in the lobby. Fills in what was drawn. */
function applyOptions(room: PartyRoom, opts: AutoOptions): AutoOptions {
  const seeds: FixedSeeds = { ...opts.seeds };
  for (const name of AUTO_STREAMS) seeds[name] ??= drawWords();
  room.fixedSeeds = seeds;
  room.seeds = new MatchSeeds(seeds);

  const settings = room.state.settings;
  settings.map = opts.map;
  settings.npcDifficulty = NpcLevel[opts.difficulty];

  // The seats: every NPC seat goes, then `seats` come back under the given ids (or fresh ones), named in order
  // from the fixed `npcNames` stream, so a replay seats the same names under the same ids.
  for (const id of [...room.state.players.keys()]) {
    if (!isNpcSeat(room, id)) continue;
    room.state.players.delete(id);
    releaseNpcSeat(room, id);
  }
  const names = room.seeds.get('npcNames');
  const npcIds: string[] = [];
  for (let i = 0; i < opts.seats; i++) {
    const id = addNpcSeat(room, names, opts.npcIds?.[i] ?? generateId());
    if (id !== null) npcIds.push(id);
  }
  room.state.leaderId = '';
  return { ...opts, seeds, npcIds };
}

/** Marks the room as an auto match, fixes its seeds, adds the NPC seats and applies the settings. */
export function enableAuto(room: PartyRoom, opts: AutoOptions): void {
  const problem = autoOptionsProblem(opts);
  if (problem !== null) throw new Error(`enableAuto: ${problem}`);
  const sim = simOf(room);
  sim.auto = { npcPrey: true, commands: [], started: false, options: opts };
  sim.auto.options = applyOptions(room, opts);
}

/** Queues `{ kind: 'start' }`; `runAuto` calls `startMatch` inside the next step. */
export function queueAutoStart(room: PartyRoom): void {
  const auto = autoOf(room);
  if (auto === null) throw new Error('queueAutoStart: not an auto room');
  auto.commands.push({ kind: 'start' });
}

/** The clock command: a scale of 1, 2, 5 or 10, pause or resume, and single steps to run while paused. */
export function applyClock(
  room: PartyRoom,
  cmd: Omit<Extract<AutoCommand, { kind: 'clock' }>, 'kind'>,
): void {
  const clock = clockOf(room);
  if (cmd.scale !== undefined && SCALES.includes(cmd.scale)) clock.scale = cmd.scale;
  if (typeof cmd.paused === 'boolean') clock.paused = cmd.paused;
  if (cmd.step !== undefined && Number.isInteger(cmd.step) && cmd.step > 0) clock.pendingSteps += cmd.step;
}

/** Step stage before `runNpcs` (locked call site in `sim/Step.ts`): drains the auto commands, in order. */
export function runAuto(room: PartyRoom): void {
  const auto = simOf(room).auto;
  if (auto === null || auto.commands.length === 0) return;
  for (const cmd of auto.commands.splice(0)) {
    switch (cmd.kind) {
      case 'start':
        // No leader and no human: `leaderId` is '' and `startRefusal` skips the human minimum in an auto room.
        if (startRefusal(room, room.state.leaderId) === null) {
          startMatch(room);
          auto.started = true;
        }
        break;
      case 'setup':
        if (room.state.phase === Phase.lobby && autoOptionsProblem(cmd.options) === null)
          auto.options = applyOptions(room, cmd.options);
        break;
      case 'reset':
        resetToLobby(room);
        auto.started = false;
        auto.options = applyOptions(room, auto.options);
        clockOf(room).paused = true;
        break;
      case 'clock':
        applyClock(room, cmd);
        break;
    }
  }
}
