import { createHash } from 'node:crypto';
import { type ColyseusTestServer, boot } from '@colyseus/testing';
import { balance } from '@wdi/content';
import { type InvariantFailure, MAX_PLAYERS, Phase, type SimEventWire, TICK_RATE } from '@wdi/shared';
import type { PartyRoom } from '../src/rooms/PartyRoom';
import { createServer } from '../src/server';
import type { FixedSeeds } from '../src/sim/seeds';
import { type AutoOptions, applyClock, autoOf, enableAuto, queueAutoStart } from '../src/sim/auto/Auto';
import { runInvariants } from '../src/sim/auto/invariants';
import { attachShadowViews } from '../src/sim/auto/shadowViews';
import { onSim } from '../src/sim/events/bus';
import { matchLog } from '../src/services/MatchLog';
import { advance } from './npcHelpers';

/**
 * The headless harness (round 6, docs/round6/auto-admin.md 4, GDD 3.19): creates a `party` room, `enableAuto`,
 * `queueAutoStart`, then `advance`s (npcHelpers.ts, the one step loop) until `Phase.gameOver` or `maxTicks`, running
 * `runInvariants` every `invariantsEvery` ticks. The loop is synchronous and the room's own clock is paused, so the
 * fixed timestep never steps the room behind the harness's back. 6B reads the result.
 */
export interface AutoResult {
  winner: number;
  ticks: number;
  rounds: number;
  events: SimEventWire[];
  failures: InvariantFailure[];
  seeds: FixedSeeds;
  /** The NPC seat ids in seat order: with `seeds`, all a replay needs. */
  npcIds: string[];
  /**
   * SHA-256 over every tick's public state (phase, and each seat's id, life, scene and position) and the deal:
   * two runs with the same seeds and seat ids give the same digest. Seat ids only, never avatar handles.
   */
  digest: string;
  /**
   * Round 10, x14 (A453): with `views`, the avatars compared between each seat's decoded state and the server
   * (`sim/auto/shadowViews.ts`); 0 when the shadows were off.
   */
  decodedChecks: number;
}

export interface AutoRunOptions extends AutoOptions {
  maxTicks?: number;
  invariantsEvery?: number;
  /** Round 10, x14 (A453): decode a shadow view per seat every tick and check it (`pnpm auto -- --views`). */
  views?: boolean;
}

export { AUTO_STREAMS } from '../src/sim/auto/Auto';

/** A test server with no debug handlers and no rate limits worth hitting, for the harness and `pnpm auto`. */
export const bootAutoServer = (): Promise<ColyseusTestServer> =>
  boot(createServer({ ipBurst: 1e5, ipPerMin: 1e8, globalPerMin: 1e8 }));

/** Sends the match-log lines to `sink` instead of stdout (the runner prints them its own way). */
export function captureMatchLog(sink: (line: string) => void): void {
  matchLog.write = sink;
}

/** The sim events the round-6 emitters send (auto-admin.md 5); the harness listens to all of them. */
export const AUTO_EVENT_KINDS = [
  'kill',
  'death',
  'clue',
  'meeting',
  'vote',
  'eject',
  'phase',
  'start',
  'end',
];

/** `finalNight.afterCycle + 1` cycles of the longest discussion, after the role card, grace and the opening. */
export function defaultMaxTicks(seats: number): number {
  const p = balance.phases;
  const n = Math.min(MAX_PLAYERS, Math.max(balance.players.min, seats));
  const discussionS = balance.byCount[String(n) as keyof typeof balance.byCount].discussionS;
  const cycleS = p.dayS + p.duskS + p.nightS + discussionS + p.voteS + p.revealS;
  const s = p.roleRevealS + p.graceS + p.openingS + (balance.finalNight.afterCycle + 1) * cycleS;
  return Math.ceil(s * TICK_RATE);
}

function tickLine(room: PartyRoom): string {
  const parts = [String(room.state.tick), String(room.state.phase)];
  room.state.players.forEach((p, id) => {
    const pr = p.presence;
    parts.push(`${id}:${p.alive ? 1 : 0}:${p.priv?.sceneId ?? -1}:${pr.x},${pr.y}`);
  });
  return parts.join('|');
}

/** Plays one all-NPC match headless to its end (or `maxTicks`), then disposes the room. */
export async function runAutoMatch(colyseus: ColyseusTestServer, opts: AutoRunOptions): Promise<AutoResult> {
  const { maxTicks = defaultMaxTicks(opts.seats), invariantsEvery = 20, views = false, ...autoOpts } = opts;
  const room = (await colyseus.createRoom('party', {})) as unknown as PartyRoom;
  let shadows: ReturnType<typeof attachShadowViews> | undefined;
  try {
    enableAuto(room, autoOpts);
    shadows = views ? attachShadowViews(room) : undefined;
    applyClock(room, { paused: true });
    queueAutoStart(room);
    const events: SimEventWire[] = [];
    for (const kind of AUTO_EVENT_KINDS) onSim(room, kind, (ev) => events.push({ ...ev }));
    const failures: InvariantFailure[] = [];
    const hash = createHash('sha256');
    const party = { humans: [], room };
    let dealt = false;

    for (let i = 0; i < maxTicks && room.state.phase !== Phase.gameOver; i++) {
      try {
        advance(party, 1);
      } catch (err) {
        failures.push({ name: 'step', tick: room.state.tick, detail: String((err as Error)?.stack ?? err) });
        break;
      }
      // A room with no client patches nothing on its own; the shadows decode a frame on every tick (x14).
      if (shadows && shadows.encodedTick !== room.state.tick) room.broadcastPatch();
      if (!dealt && room.state.phase !== Phase.lobby) {
        dealt = true;
        room.state.players.forEach((p, id) => hash.update(`deal ${id}=${p.priv?.role.roleId ?? ''}\n`));
      }
      hash.update(`${tickLine(room)}\n`);
      if (room.state.tick % invariantsEvery === 0) failures.push(...runInvariants(room));
    }
    const auto = autoOf(room);
    return {
      winner: room.state.winner,
      ticks: room.state.tick,
      rounds: room.state.round,
      events,
      failures,
      seeds: auto?.options.seeds ?? {},
      npcIds: auto?.options.npcIds ?? [],
      digest: hash.digest('hex'),
      decodedChecks: shadows?.checks ?? 0,
    };
  } finally {
    shadows?.dispose();
    await room.disconnect();
  }
}
