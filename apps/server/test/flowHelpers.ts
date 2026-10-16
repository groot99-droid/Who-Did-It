import type { ColyseusTestServer } from '@colyseus/testing';
import { boot } from '@colyseus/testing';
import { roles } from '@wdi/content';
import { Phase, type PlayerState } from '@wdi/shared';
import { createServer } from '../src/server';
import { simOf } from '../src/sim/RoomSim';
import { type Bot, type Match, sleep, startMatch, stateOf } from './simHelpers';

/** Boots a test server with the debug handlers on; call `release` in afterAll. */
export async function bootFlowServer(): Promise<{
  colyseus: ColyseusTestServer;
  release: () => Promise<void>;
}> {
  process.env.WDI_DEBUG = '1';
  const colyseus = await boot(createServer({ ipBurst: 1e5, ipPerMin: 1e8, globalPerMin: 1e8 }));
  return {
    colyseus,
    release: async () => {
      delete process.env.WDI_DEBUG;
      await colyseus.shutdown();
    },
  };
}

/** Polls until `cond` holds or the timeout passes; returns whether it held. */
export async function until(cond: () => boolean, ms = 5000): Promise<boolean> {
  for (let waited = 0; waited < ms; waited += 25) {
    if (cond()) return true;
    await sleep(25);
  }
  return cond();
}

/** The role names of the roster row for `n`, in deal order: Bot0 is the Killer, Bot1 the Detective. */
export const rolesFor = (n: number): Record<string, string> =>
  Object.fromEntries((roles.rosters[String(n) as '4']?.deal ?? []).map((r, i) => [`Bot${i}`, r]));

/** A started match with the roster roles written white-box (debug start deals none). */
export const startParty = (colyseus: ColyseusTestServer, n: number): Promise<Match> =>
  startMatch(colyseus, n, rolesFor(n));

export const events = (bot: Bot, type: string) =>
  bot.events.filter((e) => e.type === type).map((e) => e.payload as Record<string, unknown>);

export const seat = (m: Match, i: number): PlayerState => {
  const p = m.room.state.players.get((m.bots[i] as Bot).id);
  if (!p) throw new Error(`no seat ${i}`);
  return p;
};
export const sim = (m: Match, i: number) => {
  const p = simOf(m.room).players.get((m.bots[i] as Bot).id);
  if (!p) throw new Error(`no sim ${i}`);
  return p;
};
export const idOf = (m: Match, i: number): string => (m.bots[i] as Bot).id;

/** Sends `debug.clock` and waits for the step to apply it. */
export async function clock(m: Match, args: { phase?: string; clearCooldowns?: boolean }): Promise<void> {
  (m.bots[0] as Bot).room.send('debug.clock', args);
  await sleep(150);
}

/** Makes the current phase end on the next tick (white-box; the clock itself is covered by its own test). */
export async function skipPhase(m: Match): Promise<void> {
  m.room.state.phaseEndsTick = m.room.state.tick;
  await sleep(150);
}

/** What L's report and bell push: a meeting request for the next `runPhases`. */
export function request(m: Match, callerIdx: number, bodyIdx?: number): void {
  simOf(m.room).meetingRequests.push({
    reason: bodyIdx === undefined ? 'bell' : 'body',
    callerId: idOf(m, callerIdx),
    ...(bodyIdx !== undefined && { bodyOf: idOf(m, bodyIdx) }),
  });
}

/** What L's kill leaves behind: the victim a private ghost and a death event for the flow stage. */
export function murder(m: Match, victimIdx: number, killerIdx = 0): void {
  sim(m, victimIdx).dead = true;
  simOf(m.room).viewsDirty = true;
  simOf(m.room).deaths.push({
    playerId: idOf(m, victimIdx),
    cause: 'knife',
    killerId: idOf(m, killerIdx),
    tick: m.room.state.tick,
  });
}

export async function openMeeting(m: Match, callerIdx = 1, bodyIdx?: number): Promise<void> {
  request(m, callerIdx, bodyIdx);
  await until(() => m.room.state.phase === Phase.meetingDiscussion);
}

export const vote = (m: Match, i: number, target: string): void =>
  (m.bots[i] as Bot).room.send('meeting.vote', { targetId: target });

/** Everyone alive casts `pick(i)`; resolves once the room reaches the reveal. */
export async function voteAll(m: Match, living: number[], pick: (i: number) => string): Promise<void> {
  for (const i of living) vote(m, i, pick(i));
  await until(() => m.room.state.phase === Phase.reveal);
}

export const phaseOf = (m: Match) => stateOf(m.bots[0] as Bot).phase;
