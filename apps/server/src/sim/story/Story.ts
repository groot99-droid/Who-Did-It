import { generateId } from '@colyseus/core';
import { Phase } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { newSeat } from '../../rooms/handlers/lobby';
import { applyClock, enableAuto, queueAutoStart } from '../auto/Auto';
import { ANY_SIM, type SimEvent, emitSim, onSim } from '../events/bus';
import { markCardReady } from '../Covers';
import { isNpcSeat } from '../Npc';
import { flowOf } from '../Flow';
import type { FixedSeeds } from '../seeds';
import type { Story } from './types';

/**
 * Story mode's engine (docs/story/README.md 2, GDD 3.34): one human seat among NPC seats on the auto harness, seeds
 * fixed from the story so it replays, and the clock paused whenever a card is up. State is room memory beside the
 * clock's, never in a schema; nothing here reaches a public field.
 */
export interface StoryState {
  story: Story;
  /** The one human seat's id, fixed for the whole story (the client's session id). */
  humanId: string;
  /** Index of the running chapter, -1 before the first one starts. */
  chapterIdx: number;
  /** A card is up and the clock waits for `story.continue`. */
  cardUp: boolean;
  /** Commands queued by the message callbacks, drained by `runStory` inside the step. */
  queue: StoryCommand[];
  /** Bus events heard since the last `runStory`, in emission order (the bus delivers in `runEvents`, the stage before). */
  inbox: SimEvent[];
}

export type StoryCommand = { kind: 'continue'; seat: string };

const states = new WeakMap<PartyRoom, StoryState>();
const registry = new Map<string, Story>();

/** Registers a story under its id (tests, and the loader of `@wdi/content`'s story file once S1's schema lands). */
export function registerStory(story: Story): void {
  registry.set(story.id, story);
}

export function resolveStory(storyId: string): Story | null {
  return registry.get(storyId) ?? null;
}

export function storyOf(room: PartyRoom): StoryState | null {
  return states.get(room) ?? null;
}

export interface StoryOptions {
  /** The human's seat id: the joined client's session id. Defaults to the first non-NPC seat, or a new seat. */
  humanId?: string;
  /** Fixed NPC seat ids, in seat order; defaults to `<storyId>:npc<i>` so a replay seats the same ids. */
  npcIds?: string[];
  /** The human's name when the seat is created here (headless runs). */
  humanName?: string;
}

/** The ids of the story's NPC seats, stable across runs. */
export const storyNpcIds = (story: Story): string[] =>
  Array.from({ length: story.roster.npcCount }, (_, i) => `${story.id}:npc${i}`);

/**
 * Turns a lobby room into a story room: `enableAuto` with the story's map, seed words and NPC count, then the human
 * seat (kept, or made) as the only non-NPC seat and the room's leader. `queueStoryStart` plays it.
 */
export function enableStory(room: PartyRoom, storyId: string, opts: StoryOptions = {}): StoryState {
  const story = resolveStory(storyId);
  if (story === null) throw new Error(`enableStory: unknown story ${storyId}`);
  if (room.state.phase !== Phase.lobby) throw new Error('enableStory: the room is not in the lobby');
  const humans = [...room.state.players.keys()].filter((id) => !isNpcSeat(room, id));
  if (humans.length > 1) throw new Error('enableStory: a story has exactly one human seat');
  const humanId = opts.humanId ?? humans[0] ?? generateId();
  if (humans.length === 1 && humans[0] !== humanId)
    throw new Error('enableStory: humanId is not the seated human');

  if (!room.state.players.has(humanId)) {
    // Headless: no client joined. The seat is created first in the map, so it deals and places first.
    const seat = newSeat(room, humanId, opts.humanName ?? 'Player');
    seat.ready = false;
  }
  enableAuto(room, {
    map: story.mapId,
    seats: story.roster.npcCount,
    difficulty: 'normal',
    seeds: story.seedWords as FixedSeeds,
    npcIds: opts.npcIds ?? storyNpcIds(story),
  });
  room.state.leaderId = humanId;
  applyClock(room, { scale: 1, paused: false });

  const state: StoryState = { story, humanId, chapterIdx: -1, cardUp: false, queue: [], inbox: [] };
  states.set(room, state);
  onSim(room, ANY_SIM, (ev) => {
    if (!ev.kind.startsWith('story.')) state.inbox.push(ev);
  });
  return state;
}

/**
 * Queues the auto start with chapter one's card dealt to the human seat (`flow.fixedDeal`, the deal's own override,
 * so the deal needs no second path). The cards after it move by `switchRole` (`handover.ts`).
 */
export function queueStoryStart(room: PartyRoom): void {
  const state = storyOf(room);
  if (state === null) throw new Error('queueStoryStart: not a story room');
  const first = state.story.chapters[0];
  if (first !== undefined) flowOf(room).fixedDeal = { [state.humanId]: first.roleId };
  queueAutoStart(room);
}

/** The player's `story.continue`: queued by the message callback, consumed by the next `runStory`. */
export function queueStoryContinue(room: PartyRoom, seat: string): void {
  const state = storyOf(room);
  if (state !== null && seat === state.humanId) state.queue.push({ kind: 'continue', seat });
}

/** Commands waiting for a step; a paused clock runs one step for them (`PartyRoom`'s tick, `stepsThisTick`). */
export const storyQueued = (room: PartyRoom): number => storyOf(room)?.queue.length ?? 0;

/** Raises a card to the human's own client and pauses the clock until `story.continue`. */
function raiseCard(room: PartyRoom, state: StoryState, card: StoryCard): void {
  state.cardUp = true;
  applyClock(room, { paused: true });
  room.clients.getById(state.humanId)?.send('story.card', card);
}

/** The `story.card` payload (docs/story/README.md 3); S3 owns the wire constants and the client. */
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

function startChapter(room: PartyRoom, state: StoryState, idx: number): void {
  const chapter = state.story.chapters[idx];
  if (chapter === undefined) return;
  state.chapterIdx = idx;
  emitSim(room, {
    tick: room.state.tick,
    kind: 'story.chapterStart',
    data: { chapter: chapter.id, index: idx },
  });
  raiseCard(room, state, {
    kind: 'title',
    chapterId: chapter.id,
    title: chapter.title,
    lines: [chapter.setup],
  });
}

/**
 * The story's Step stage, after `runEvents` (locked call site in `sim/Step.ts`): drains the player's queued commands
 * and reads the tick's bus events. Nothing happens in a message callback (CLAUDE.md).
 */
export function runStory(room: PartyRoom): void {
  const state = storyOf(room);
  if (state === null) return;
  for (const cmd of state.queue.splice(0)) {
    if (cmd.kind === 'continue' && state.cardUp) {
      state.cardUp = false;
      applyClock(room, { paused: false });
      markCardReady(room, state.humanId); // dismisses the role card; the story's own title card stood in for it
    }
  }
  for (const ev of state.inbox.splice(0)) {
    if (ev.kind === 'start' && state.chapterIdx < 0) startChapter(room, state, 0);
  }
}
