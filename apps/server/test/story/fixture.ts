import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Client } from '@colyseus/core';
import type { ColyseusTestServer } from '@colyseus/testing';
import { type InvariantFailure, Phase, type SimEventWire } from '@wdi/shared';
import type { PartyRoom } from '../../src/rooms/PartyRoom';
import * as AutoModule from '../../src/sim/auto/Auto';
import { applyClock } from '../../src/sim/auto/Auto';
import { runInvariants } from '../../src/sim/auto/invariants';
import { markDead } from '../../src/sim/Death';
import { isNpcSeat } from '../../src/sim/Npc';
import { ANY_SIM, onSim } from '../../src/sim/events/bus';
import { simOf } from '../../src/sim/RoomSim';
import { type Party, advance, lobbyOf, pauseClock } from '../npcHelpers';

/**
 * The story-mode test fixture (docs/story/README.md 4, docs/story/test-plan.md). Written against the shapes of
 * README sections 1 to 3, before the engine exists: everything it needs from S2 is `enableStory` (read off the
 * `Auto` module by name, so this file compiles and the dependent suites skip until it lands), the bus events
 * `story.*`, and the two private messages `story.card` and `story.goals`. Everything else is the existing harness.
 *
 * Determinism. The room runs off its own clock and steps only through `advance` (npcHelpers.ts). The scripted
 * player's `story.continue` is pushed on the room's command queue directly, the queue `PartyRoom`'s `'*'` handler
 * fills, so it is consumed inside `step()` on the next tick like a real one and no wall-time race decides its tick.
 * The room's outgoing private messages are captured on the server side of the player's client, in send order.
 */

/** Wire names of README 3; `S2C`/`C2S` constants replace these when S3's protocol PR is merged. */
export const STORY_MSG = {
  start: 'story.start',
  continue: 'story.continue',
  card: 'story.card',
  goals: 'story.goals',
} as const;

export interface StoryCard {
  kind: 'title' | 'beat' | 'end';
  chapterId: string;
  title?: string;
  lines: string[];
  portrait?: string;
  goal?: string;
  summary?: Record<string, number>;
  next?: string;
}
export interface StoryGoals {
  chapterId: string;
  goals: { id: string; text: string; done: boolean }[];
}

/** The slice of README section 1 the tests read; `story.json` has more. */
export interface StoryDef {
  id: string;
  mapId: string;
  roster: { humanSeat: 0; npcCount: number };
  seedWords: Record<string, [number, number]>;
  chapters: {
    id: string;
    roleId: string;
    startPhase: { cycle: number; part: 'day' | 'night' };
    goals: { id?: string }[];
    beats: { id: string }[];
  }[];
}

// --- what exists yet -------------------------------------------------------------------------------------------

type EnableStory = (room: PartyRoom, storyId: string) => void;

/** S2's `enableStory`, or null while it has not merged (README 2: "beside `enableAuto`"). */
export const enableStory: EnableStory | null =
  ((AutoModule as Record<string, unknown>).enableStory as EnableStory | undefined) ?? null;

/** `story.json` read straight off disk (README 1 fixes its shape), or null while S1's file has not merged. */
export function loadStoryFile(): Record<string, StoryDef> | null {
  const path = fileURLToPath(new URL('../../../../packages/content/data/story.json', import.meta.url));
  try {
    return (JSON.parse(readFileSync(path, 'utf8')) as { stories: Record<string, StoryDef> }).stories;
  } catch {
    return null;
  }
}

/** The story id the tests play; README 1 names it. */
export const STORY_ID = 'hollowmere_winter';

export function storyDef(id = STORY_ID): StoryDef | null {
  return loadStoryFile()?.[id] ?? null;
}

/** True when the engine and the content are both in: the suites that play a story run only then. */
export const storyReady = (): boolean => enableStory !== null && storyDef() !== null;

// --- the story room --------------------------------------------------------------------------------------------

export interface StoryRoom {
  party: Party;
  room: PartyRoom;
  /** The human's seat id (the session id). */
  humanId: string;
  def: StoryDef;
  /** Every `story.card` sent to the player, in send order, with the tick it was sent on. */
  cards: { tick: number; card: StoryCard }[];
  goals: { tick: number; goals: StoryGoals }[];
  /** Every private message sent to the player (type, payload), for the leak audit. */
  sent: { tick: number; type: string; payload: unknown }[];
  /** Every sim event of the bus, in order (`story.*` included). */
  events: SimEventWire[];
  /** Cards already answered with `story.continue`. */
  answered: number;
  failures: InvariantFailure[];
}

export interface StartOptions {
  storyId?: string;
  /** Run `runInvariants` every n ticks while stepping (0 = never). */
  invariantsEvery?: number;
}

/**
 * A story room: one human joined, the clock off, `enableStory` called, and the room stepped until the match has
 * started (the engine queues its own start, as `queueAutoStart` does; a start by `story.start` is the S3 wire path
 * and is covered by the protocol test, not here).
 */
export async function startStoryRoom(
  colyseus: ColyseusTestServer,
  opts: StartOptions = {},
): Promise<StoryRoom> {
  if (enableStory === null) throw new Error('startStoryRoom: S2 has not merged enableStory');
  const storyId = opts.storyId ?? STORY_ID;
  const def = storyDef(storyId);
  if (def === null) throw new Error(`startStoryRoom: no story ${storyId} in story.json`);

  const party = await lobbyOf(colyseus, 1);
  const room = party.room;
  pauseClock(room);
  const humanId = party.humans[0]!.id;
  const sr: StoryRoom = {
    party,
    room,
    humanId,
    def,
    cards: [],
    goals: [],
    sent: [],
    events: [],
    answered: 0,
    failures: [],
  };
  captureSent(sr);
  onSim(room, ANY_SIM, (ev) => sr.events.push({ ...ev }));
  enableStory(room, storyId);
  // Clock paused by the harness stays paused: the fixture steps the room itself.
  applyClock(room, { paused: true });
  for (let i = 0; i < 5 && room.state.phase === Phase.lobby; i++) stepRoom(sr, 1, opts.invariantsEvery ?? 0);
  if (room.state.phase === Phase.lobby) throw new Error('startStoryRoom: the story did not start');
  return sr;
}

/** The server side of the player's client: wraps `send` so every private message is recorded as it is sent. */
function captureSent(sr: StoryRoom): void {
  const client = sr.room.clients.find((c) => c.sessionId === sr.humanId) as Client | undefined;
  if (client === undefined) throw new Error('captureSent: the human has no client');
  const original = client.send.bind(client) as (type: unknown, payload?: unknown) => void;
  (client as unknown as { send: typeof original }).send = (type, payload) => {
    const t = String(type);
    const tick = sr.room.state.tick;
    sr.sent.push({ tick, type: t, payload });
    if (t === STORY_MSG.card) sr.cards.push({ tick, card: payload as StoryCard });
    if (t === STORY_MSG.goals) sr.goals.push({ tick, goals: payload as StoryGoals });
    original(type, payload);
  };
}

/** Steps `n` ticks; invariants every `every` ticks when asked. */
export function stepRoom(sr: StoryRoom, n: number, every = 0): void {
  for (let i = 0; i < n; i++) {
    advance(sr.party, 1);
    if (every > 0 && sr.room.state.tick % every === 0) sr.failures.push(...runInvariants(sr.room));
  }
}

// --- the scripted player ---------------------------------------------------------------------------------------

/** Queues the player's `story.continue`, consumed in the next `step()`. */
export function continueCard(sr: StoryRoom): void {
  const client = { sessionId: sr.humanId } as Client;
  sr.room.commands.push(client, STORY_MSG.continue, {});
}

/** The newest `story.card` the player has not answered, or null. */
export function pendingCard(sr: StoryRoom): StoryCard | null {
  return sr.answered < sr.cards.length ? sr.cards[sr.cards.length - 1]!.card : null;
}

/** The chapter ids the bus has started, in order. */
export const chaptersStarted = (sr: StoryRoom): string[] =>
  sr.events.filter((e) => e.kind === 'story.chapterStart').map((e) => String(e.data?.chapterId ?? ''));

export const chaptersEnded = (sr: StoryRoom): string[] =>
  sr.events.filter((e) => e.kind === 'story.chapterEnd').map((e) => String(e.data?.chapterId ?? ''));

/**
 * The seat the human controls now. A chapter break can move the human to another seat id (README 2: "an NPC seat
 * holding that card swaps controllers with the player's"), so this is the one seat that is not an NPC; the
 * player's own session id is the fallback while the engine keeps one seat.
 */
export function humanSeat(sr: StoryRoom): string {
  const humans = [...sr.room.state.players.keys()].filter((id) => !isNpcSeat(sr.room, id));
  return humans.length === 1 ? humans[0]! : sr.humanId;
}

/** How many seats are not NPC-controlled: README 2's invariant says exactly one at all times. */
export const humanSeatCount = (sr: StoryRoom): number =>
  [...sr.room.state.players.keys()].filter((id) => !isNpcSeat(sr.room, id)).length;

/** The role id the player's seat holds now (its private view; the player's own card). */
export function humanRole(sr: StoryRoom): string {
  return sr.room.state.players.get(humanSeat(sr))?.priv?.role.roleId ?? '';
}

export interface PlayOptions {
  maxTicks: number;
  /** Stop when this returns true (checked after each tick). Default: the room is over. */
  until?: (sr: StoryRoom) => boolean;
  /** The player's play between cards: called every tick the world runs. Default: stand still. */
  policy?: (sr: StoryRoom, tick: number) => void;
  invariantsEvery?: number;
}

export interface PlayResult {
  ticks: number;
  /** True when `until` held (or the room ended) before `maxTicks`. */
  finished: boolean;
}

/**
 * Plays: each tick the policy acts, the room steps, and a card that came up is answered with `story.continue` on
 * the following tick (the player "reads" it for one tick). Returns when `until` holds, the room is over, or
 * `maxTicks` ticks have run; a test that needs the end asserts `finished`.
 */
export function play(sr: StoryRoom, opts: PlayOptions): PlayResult {
  const done = opts.until ?? ((r: StoryRoom) => r.room.state.phase === Phase.gameOver);
  let ticks = 0;
  while (ticks < opts.maxTicks) {
    if (done(sr)) return { ticks, finished: true };
    opts.policy?.(sr, ticks);
    const card = pendingCard(sr);
    if (card !== null) {
      continueCard(sr);
      sr.answered = sr.cards.length;
    }
    stepRoom(sr, 1, opts.invariantsEvery ?? 0);
    ticks++;
  }
  return { ticks, finished: done(sr) };
}

/** White-box: the player's seat dies now (`markDead`, the one path every death takes). */
export function killHuman(sr: StoryRoom, cause: 'knife' | 'poison' | 'wolf' = 'knife'): void {
  markDead(sr.room, humanSeat(sr), cause);
}

/** True while the player's seat is dead in the sim. */
export const humanDead = (sr: StoryRoom): boolean => simOf(sr.room).players.get(humanSeat(sr))?.dead === true;

// --- the digest ------------------------------------------------------------------------------------------------

/**
 * A running SHA-256 of the story's public face: each tick's phase, tick and every seat's id, life, scene and
 * position, plus the card sequence and the `story.*` events. Two runs of the same seed words give the same digest.
 * Never includes avatar handles (they are drawn per run, DECISIONS A84).
 */
export class StoryDigest {
  private readonly hash = createHash('sha256');

  tick(sr: StoryRoom): void {
    const parts = [String(sr.room.state.tick), String(sr.room.state.phase)];
    sr.room.state.players.forEach((p, id) => {
      const pr = p.presence;
      parts.push(`${id}:${p.alive ? 1 : 0}:${p.priv?.sceneId ?? -1}:${pr.x},${pr.y}`);
    });
    this.hash.update(`${parts.join('|')}\n`);
  }

  finish(sr: StoryRoom): string {
    for (const c of sr.cards) this.hash.update(`card ${c.tick} ${c.card.kind} ${c.card.chapterId}\n`);
    for (const e of sr.events)
      if (e.kind.startsWith('story.'))
        this.hash.update(`${e.tick} ${e.kind} ${JSON.stringify(e.data ?? {})}\n`);
    return this.hash.digest('hex');
  }
}

/** Plays with a digest running; returns the digest of the whole run. */
export function playDigest(sr: StoryRoom, opts: PlayOptions): { result: PlayResult; digest: string } {
  const d = new StoryDigest();
  const policy = opts.policy;
  const result = play(sr, {
    ...opts,
    policy: (r, t) => {
      d.tick(r);
      policy?.(r, t);
    },
  });
  return { result, digest: d.finish(sr) };
}
