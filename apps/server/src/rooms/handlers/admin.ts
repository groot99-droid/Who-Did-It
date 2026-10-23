import type { Client } from '@colyseus/core';
import { MAX_PLAYERS, ADMIN_C2S, ErrorCode, S2C } from '@wdi/shared';
import type { PartyRoom } from '../PartyRoom';
import {
  AUTO_STREAMS,
  type AutoOptions,
  type AutoCommand,
  applyClock,
  autoOf,
  autoOptionsProblem,
} from '../../sim/auto/Auto';
import { isAdminClient } from '../../sim/auto/AdminView';
import type { FixedSeeds, SeedWords } from '../../sim/seeds';

/** Commands waiting for the step; a flood past this is dropped (the step drains them all, paused rooms included). */
export const MAX_QUEUED_COMMANDS = 32;
/** One `admin.clock {step}` runs at most this many ticks in one go. */
export const MAX_STEP_REQUEST = 100;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isWord = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) >= 0 && (v as number) < 2 ** 32;

function parseSeeds(raw: unknown): FixedSeeds | null | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) return null;
  const seeds: FixedSeeds = {};
  for (const [name, words] of Object.entries(raw)) {
    if (!(AUTO_STREAMS as string[]).includes(name)) return null;
    if (!Array.isArray(words) || words.length !== 4 || !words.every(isWord)) return null;
    seeds[name as keyof FixedSeeds] = words as unknown as SeedWords;
  }
  return seeds;
}

/** The options of an `admin.setup` payload, or null when the shape is wrong or `enableAuto` would refuse them. */
export function parseSetup(raw: unknown): AutoOptions | null {
  if (!isRecord(raw)) return null;
  const { map, seats, difficulty } = raw;
  if (typeof map !== 'string' || typeof difficulty !== 'string') return null;
  if (typeof seats !== 'number' || seats > MAX_PLAYERS) return null;
  const seeds = parseSeeds(raw.seeds);
  if (seeds === null) return null;
  const options = {
    map,
    seats,
    difficulty,
    ...(seeds !== undefined ? { seeds } : {}),
  } as AutoOptions;
  return autoOptionsProblem(options) === null ? options : null;
}

/**
 * The `admin.*` handlers (round 6, docs/round6/auto-admin.md 6): each pushes an `AutoCommand` into
 * `autoOf(room).commands`, which `runAuto` applies inside the step; nothing in a game sense mutates here. The one
 * exception is `admin.clock {step}`: it adds to the clock's single-step counter, which the tick loop consumes and
 * which only exists to be read between steps, so a paused room (that runs no step, hence drains no queue) can still
 * be stepped. Called from `AdminRoom.onCreate` only, so a `party` room never has them.
 */
export function registerAdminHandlers(room: PartyRoom): void {
  const refuse = (client: Client, msg: string) => client.send(S2C.error, { code: ErrorCode.cannot, msg });
  const queue = (client: Client, cmd: AutoCommand): void => {
    const auto = autoOf(room);
    if (!auto || !isAdminClient(room, client.sessionId)) return;
    if (auto.commands.length >= MAX_QUEUED_COMMANDS) return refuse(client, 'busy');
    auto.commands.push(cmd);
  };

  room.onMessage(ADMIN_C2S.setup, (client, payload: unknown) => {
    const options = parseSetup(payload);
    if (options === null) return refuse(client, 'bad setup');
    queue(client, { kind: 'setup', options });
  });
  room.onMessage(ADMIN_C2S.start, (client) => queue(client, { kind: 'start' }));
  room.onMessage(ADMIN_C2S.reset, (client) => queue(client, { kind: 'reset' }));
  room.onMessage(ADMIN_C2S.clock, (client, payload: unknown) => {
    if (!isRecord(payload) || !isAdminClient(room, client.sessionId)) return refuse(client, 'bad clock');
    const { scale, paused, step } = payload;
    if (scale !== undefined && ![1, 2, 5, 10].includes(scale as number)) return refuse(client, 'bad clock');
    if (paused !== undefined && typeof paused !== 'boolean') return refuse(client, 'bad clock');
    if (
      step !== undefined &&
      (!Number.isInteger(step) || (step as number) < 1 || (step as number) > MAX_STEP_REQUEST)
    ) {
      return refuse(client, 'bad clock');
    }
    if (scale !== undefined || paused !== undefined) {
      queue(client, {
        kind: 'clock',
        ...(scale !== undefined ? { scale: scale as 1 | 2 | 5 | 10 } : {}),
        ...(paused !== undefined ? { paused } : {}),
      });
    }
    if (step !== undefined) applyClock(room, { step: step as number });
  });
}
