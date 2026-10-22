import { createHash } from 'node:crypto';
import type { SimEventWire } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { matchLog } from '../../services/MatchLog';
import { simOf } from '../RoomSim';

/**
 * The match's event log (round 6, docs/round6/auto-admin.md 4 and 5): every sim event `runEvents` delivers, by seat
 * id and tick, never by avatar handle, so two runs with the same seeds and seat ids give the same `logHash`. The log
 * restarts at each `start`. In an auto room the `end` event also writes the match log's `event: 'auto'` line, which
 * tells the soak report an all-NPC match from a bot match (DECISIONS A84).
 */
const logs = new WeakMap<PartyRoom, SimEventWire[]>();

export function appendLog(room: PartyRoom, event: SimEventWire): void {
  let log = logs.get(room);
  if (!log || event.kind === 'start') {
    log = [];
    logs.set(room, log);
  }
  log.push(event);
  if (event.kind === 'end' && simOf(room).auto !== null) logAuto(room, log);
}

/** The events of the current match so far (since the last `start`), oldest first. */
export function matchEvents(room: PartyRoom): readonly SimEventWire[] {
  return logs.get(room) ?? [];
}

/** One line per event: tick, kind, seat, scene and the data, in a fixed order. */
export function logLine(e: SimEventWire): string {
  return `${e.tick} ${e.kind} ${e.seat ?? '-'} ${e.sceneId ?? '-'} ${JSON.stringify(e.data ?? {})}`;
}

/** SHA-256 over the log's lines: the replay check of `auto-admin.md` 4. */
export function logHash(room: PartyRoom): string {
  const hash = createHash('sha256');
  for (const e of matchEvents(room)) hash.update(`${logLine(e)}\n`);
  return hash.digest('hex');
}

function logAuto(room: PartyRoom, log: readonly SimEventWire[]): void {
  const auto = simOf(room).auto;
  if (auto === null) return;
  const { map, mode, seats, difficulty, seeds, npcIds } = auto.options;
  const kinds: Record<string, number> = {};
  for (const e of log) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
  matchLog.write(
    JSON.stringify({
      event: 'auto',
      code: room.roomId,
      map,
      mode,
      seats,
      difficulty,
      winner: log[log.length - 1]?.data?.winner ?? '',
      ticks: room.state.tick,
      rounds: room.state.round,
      kinds,
      logHash: logHash(room),
      seeds,
      npcIds,
    }),
  );
}
