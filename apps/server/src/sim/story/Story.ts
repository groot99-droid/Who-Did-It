import { generateId } from '@colyseus/core';
import { balance, type Chapter, type Story, story as storyFile } from '@wdi/content';
import { ItemStack, Phase } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { newSeat } from '../../rooms/handlers/lobby';
import { applyClock, enableAuto, queueAutoStart } from '../auto/Auto';
import { markCardReady } from '../Covers';
import { ANY_SIM, type SimEvent, emitSim, onSim } from '../events/bus';
import { flowOf, setPhase } from '../Flow';
import { settle } from '../Inventory';
import { dayPartOf } from '../mobs/spawn';
import { isNpcSeat } from '../Npc';
import { simOf } from '../RoomSim';
import { SCENE_KEYS } from '../World';
import { endMatch } from '../Win';
import type { FixedSeeds } from '../seeds';
import { runAction } from './actions';
import { holderOf, switchRole } from './handover';
import { type Latches, hear, holds } from './triggers';

/**
 * Story mode's engine (docs/story/README.md 2, GDD 3.34): one human seat among NPC seats on the auto harness, seeds
 * fixed from the story so it replays, the clock paused whenever a card is up, and the beat runner (`runStory`, one
 * Step stage after `runEvents`). State is room memory beside the clock's, never in a schema; nothing here reaches a
 * public field.
 */

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

export const STORY_MSG = { card: 'story.card', goals: 'story.goals' } as const;

export type StoryCommand = { kind: 'continue'; seat: string };

export interface StoryState {
  story: Story;
  /** The one human seat's id, fixed for the whole story (the client's session id). */
  humanId: string;
  /** Index of the running chapter, -1 before the first one starts. */
  chapterIdx: number;
  chapterStartTick: number;
  /** A chapter has ended and its end card is up (or queued); no beats run until the next one starts. */
  ended: boolean;
  failed: boolean;
  /** The match ended mid-chapter: this chapter is the last one. */
  final: boolean;
  /** The story is over (its last end card was dismissed, or the match ended). */
  over: boolean;
  /** A card is up and the clock waits for `story.continue`. */
  cardUp: boolean;
  /** Cards waiting behind the one that is up, in order. */
  cards: StoryCard[];
  fired: string[];
  latches: Latches;
  goalsDone: Set<string>;
  counters: Record<string, number>;
  queue: StoryCommand[];
  /** The human's scene and item counts last tick, to emit `story.enter` and `story.pickup` on a change. */
  seen: { scene: string; items: Map<string, number> | null };
  /** Bus events heard since the last `runStory`, in emission order. */
  inbox: SimEvent[];
}

const states = new WeakMap<PartyRoom, StoryState>();
const registry = new Map<string, Story>();

/** Registers a story under its id (tests); the shipped stories come from `story.json`. */
export function registerStory(story: Story): void {
  registry.set(story.id, story);
}

export function resolveStory(storyId: string): Story | null {
  return registry.get(storyId) ?? storyFile.stories[storyId] ?? null;
}

export function storyOf(room: PartyRoom): StoryState | null {
  return states.get(room) ?? null;
}

export interface StoryOptions {
  /** The human's seat id: the joined client's session id. Defaults to the one non-NPC seat, or a new seat. */
  humanId?: string;
  /** Fixed NPC seat ids, in seat order; defaults to `<storyId>:npc<i>` so a replay seats the same ids. */
  npcIds?: string[];
  /** The human's name when the seat is created here (headless runs). */
  humanName?: string;
  /** Queue the start at once (default). */
  start?: boolean;
}

/** The ids of the story's NPC seats, stable across runs. */
export const storyNpcIds = (story: Story): string[] =>
  Array.from({ length: story.roster.npcCount }, (_, i) => `${story.id}:npc${i}`);

/**
 * Turns a lobby room into a story room: `enableAuto` with the story's map, seed words and NPC count, then the human
 * seat (kept, or made) as the only non-NPC seat and the room's leader, chapter one's card dealt to it, and the start
 * queued for the next step.
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
    // Headless: no client joined. The seat is made before the NPCs', so it deals and places first.
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

  const state: StoryState = {
    story,
    humanId,
    chapterIdx: -1,
    chapterStartTick: 0,
    ended: false,
    failed: false,
    final: false,
    over: false,
    cardUp: false,
    cards: [],
    fired: [],
    latches: { set: new Set() },
    goalsDone: new Set(),
    counters: {},
    queue: [],
    seen: { scene: '', items: null },
    inbox: [],
  };
  states.set(room, state);
  // The runner's own outputs stay out of its inbox; `story.enter` and `story.pickup` are the triggers' to hear.
  onSim(room, ANY_SIM, (ev) => {
    if (!ev.kind.startsWith('story.') || ev.kind === 'story.enter' || ev.kind === 'story.pickup')
      state.inbox.push(ev);
  });
  const first = story.chapters[0];
  if (first !== undefined) flowOf(room).fixedDeal = { [humanId]: first.roleId };
  if (opts.start !== false) queueAutoStart(room);
  return state;
}

/** The player's `story.continue`: queued by the message callback, consumed by the next `runStory`. */
export function queueStoryContinue(room: PartyRoom, seat: string): void {
  const state = storyOf(room);
  if (state !== null && seat === state.humanId) state.queue.push({ kind: 'continue', seat });
}

/** Commands waiting for a step; a paused clock runs one step for them (`PartyRoom`'s tick, `stepsThisTick`). */
export const storyQueued = (room: PartyRoom): number => storyOf(room)?.queue.length ?? 0;

// --- cards ---------------------------------------------------------------------------------------------------------

const send = (room: PartyRoom, state: StoryState, type: string, payload: unknown): void =>
  room.clients.getById(state.humanId)?.send(type, payload);

function showCard(room: PartyRoom, state: StoryState, card: StoryCard): void {
  state.cardUp = true;
  applyClock(room, { paused: true });
  send(room, state, STORY_MSG.card, card);
}

/** Raises a card at once, or queues it behind the one that is up. */
function raise(room: PartyRoom, state: StoryState, card: StoryCard): void {
  if (state.cardUp) state.cards.push(card);
  else showCard(room, state, card);
}

const chapterOf = (state: StoryState): Chapter | undefined => state.story.chapters[state.chapterIdx];

function sendGoals(room: PartyRoom, state: StoryState): void {
  const chapter = chapterOf(state);
  if (chapter === undefined) return;
  send(room, state, STORY_MSG.goals, {
    chapterId: chapter.id,
    goals: chapter.goals.map((g) => ({ id: g.id, text: g.text, done: state.goalsDone.has(g.id) })),
  });
}

function completeGoal(room: PartyRoom, state: StoryState, goalId: string): void {
  const chapter = chapterOf(state);
  if (chapter === undefined || state.goalsDone.has(goalId) || !chapter.goals.some((g) => g.id === goalId))
    return;
  state.goalsDone.add(goalId);
  emitSim(room, { tick: room.state.tick, kind: 'story.goal', data: { chapterId: chapter.id, goal: goalId } });
  sendGoals(room, state);
}

// --- chapters ------------------------------------------------------------------------------------------------------

/** Fast-forwards the clock across a break to the chapter's `startPhase` (a hint; never backwards). */
function seekPhase(room: PartyRoom, chapter: Chapter): void {
  const { cycle, part } = chapter.startPhase;
  const s = room.state;
  if (s.phase < Phase.grace || s.phase === Phase.gameOver) return;
  const here = dayPartOf(s.phase);
  if (s.round > cycle || (s.round === cycle && (part === 'day' || here === 'night'))) return;
  s.round = cycle;
  if (part === 'night') setPhase(room, Phase.night, balance.phases.nightS);
  else setPhase(room, Phase.day, balance.phases.dayS);
}

function giveItem(room: PartyRoom, state: StoryState, ref: string): void {
  const player = room.state.players.get(state.humanId);
  if (!player) return;
  const stack = new ItemStack();
  stack.defId = ref;
  stack.qty = 1;
  player.priv.inventory.slots.push(stack);
  settle(player);
}

function startChapter(room: PartyRoom, state: StoryState, idx: number): void {
  const chapter = state.story.chapters[idx];
  if (chapter === undefined) return;
  const previous = state.story.chapters[idx - 1];
  if (idx > 0) {
    switchRole(
      room,
      state.humanId,
      chapter.roleId,
      chapter.look,
      new Set(state.story.chapters.map((c) => c.roleId)),
    );
    seekPhase(room, chapter);
  } else if (chapter.look !== undefined) {
    const player = room.state.players.get(state.humanId);
    if (player) player.look = chapter.look;
  }
  state.seen.items = null; // a new card's kit is not a pickup
  state.chapterIdx = idx;
  state.chapterStartTick = room.state.tick;
  state.ended = false;
  state.failed = false;
  state.fired = [];
  state.latches = { set: new Set() };
  state.goalsDone = new Set();
  state.counters = {};
  const handed = previous?.handOn ?? [];
  for (const h of handed) if (h.kind === 'item') giveItem(room, state, h.ref);
  emitSim(room, {
    tick: room.state.tick,
    kind: 'story.chapterStart',
    data: { chapterId: chapter.id, index: idx },
  });
  raise(room, state, {
    kind: 'title',
    chapterId: chapter.id,
    title: chapter.title,
    lines: [chapter.setup, ...handed.map((h) => h.text)],
  });
  sendGoals(room, state);
}

function endChapter(room: PartyRoom, state: StoryState, failed: boolean): void {
  const chapter = chapterOf(state);
  if (chapter === undefined || state.ended) return;
  state.ended = true;
  state.failed = failed;
  state.cards = []; // beat cards the player has not read yet are moot
  const summary = Object.fromEntries(chapter.end.summaryKeys.map((k) => [k, state.counters[k] ?? 0]));
  emitSim(room, {
    tick: room.state.tick,
    kind: 'story.chapterEnd',
    data: { chapterId: chapter.id, failed, summary },
  });
  const next = state.story.chapters[state.chapterIdx + 1];
  const card: StoryCard = {
    kind: 'end',
    chapterId: chapter.id,
    title: chapter.title,
    lines: failed ? [chapter.end.failedLine] : chapter.end.lines,
    summary,
    ...(next !== undefined && { next: next.title }),
  };
  if (state.cardUp) state.cards.push(card);
  else showCard(room, state, card);
}

/** The end card was dismissed: the next chapter starts, or the story is over. */
function afterEndCard(room: PartyRoom, state: StoryState): void {
  if (!state.final && state.chapterIdx + 1 < state.story.chapters.length)
    startChapter(room, state, state.chapterIdx + 1);
  else finishStory(room, state);
}

function finishStory(room: PartyRoom, state: StoryState): void {
  state.over = true;
  emitSim(room, { tick: room.state.tick, kind: 'story.end', data: { storyId: state.story.id } });
  if (room.state.phase !== Phase.gameOver) endMatch(room, 'village');
}

// --- counters ------------------------------------------------------------------------------------------------------

/** The counters an end card shows, from the events the chapter heard (unknown keys stay 0). */
function count(state: StoryState, ev: SimEvent, seatOf: (who: string) => string | null): void {
  const bump = (k: string) => (state.counters[k] = (state.counters[k] ?? 0) + 1);
  const mine = ev.seat !== undefined && ev.seat === seatOf('player');
  if (ev.kind === 'taskDone' && mine) {
    bump('tasksDone');
    if (/dough|bake|loaf|oven/i.test(String(ev.data?.taskId ?? ''))) bump('loavesBaked');
  }
  if (ev.kind === 'clue') {
    bump('cluesFound');
    if (ev.data?.kind === 11) bump('scratchesLeft');
  }
  if (ev.kind === 'phase' && ev.data?.to === Phase.night) bump('nightsUsed');
}

/**
 * `story.enter` { sceneId } when the player's avatar is in a new scene, `story.pickup` { item } when its pack gains
 * an item (README 1a, S1's contract request). Both name the player's seat and reach the bus one tick later.
 */
function watchPlayer(room: PartyRoom, state: StoryState): void {
  const player = room.state.players.get(state.humanId);
  const p = simOf(room).players.get(state.humanId);
  if (!player || !p?.placed) return;
  const scene = SCENE_KEYS[p.sceneIdx] ?? '';
  if (scene !== state.seen.scene) {
    if (state.seen.scene !== '' && scene !== '')
      emitSim(room, {
        tick: room.state.tick,
        kind: 'story.enter',
        seat: state.humanId,
        sceneId: scene,
        data: { sceneId: scene },
      });
    state.seen.scene = scene;
  }
  const now = new Map<string, number>();
  for (const stack of player.priv.inventory.slots)
    now.set(stack.defId, (now.get(stack.defId) ?? 0) + stack.qty);
  for (const [item, qty] of now)
    if (state.seen.items !== null && qty > (state.seen.items.get(item) ?? 0))
      emitSim(room, { tick: room.state.tick, kind: 'story.pickup', seat: state.humanId, data: { item } });
  state.seen.items = now;
}

// --- the stage -----------------------------------------------------------------------------------------------------

/**
 * The story's Step stage, after `runEvents` (locked call site in `sim/Step.ts`): the player's queued commands, the
 * tick's bus events, then the chapter's goals, beats and end trigger, in that order. Nothing happens in a message
 * callback (CLAUDE.md).
 */
export function runStory(room: PartyRoom): void {
  const state = storyOf(room);
  if (state === null || state.over) return;

  for (const cmd of state.queue.splice(0)) {
    if (cmd.kind !== 'continue' || !state.cardUp) continue;
    state.cardUp = false;
    const card = state.cards.shift();
    if (card !== undefined) showCard(room, state, card);
    else {
      applyClock(room, { paused: false });
      if (state.ended) afterEndCard(room, state);
      else markCardReady(room, state.humanId); // dismisses the role card; the title card stood in for it
    }
  }
  if (state.over) return;

  const seatOf = (who: string): string | null =>
    who === 'player' ? state.humanId : holderOf(room, state.humanId, who);
  watchPlayer(room, state);
  const events = state.inbox.splice(0);
  if (state.chapterIdx < 0) {
    if (events.some((e) => e.kind === 'start')) startChapter(room, state, 0);
    return;
  }
  const chapter = chapterOf(state);
  if (chapter === undefined || state.ended) return;

  for (const ev of events) {
    count(state, ev, seatOf);
    chapter.goals.forEach((g) => g.trigger && hear(g.trigger, `g:${g.id}`, ev, state.latches, seatOf));
    chapter.beats.forEach((b) => hear(b.trigger, `b:${b.id}`, ev, state.latches, seatOf));
    hear(chapter.end.trigger, 'end', ev, state.latches, seatOf);
    if (ev.kind === 'end') {
      state.final = true; // the match itself ended (a win): this chapter's end card is the story's last
      return endChapter(room, state, false);
    }
  }

  const tick = room.state.tick - state.chapterStartTick;
  if (simOf(room).players.get(state.humanId)?.dead) return endChapter(room, state, true);

  for (const g of chapter.goals)
    if (g.trigger && holds(g.trigger, `g:${g.id}`, tick, state.latches)) completeGoal(room, state, g.id);
  const host = {
    room,
    humanId: state.humanId,
    card: (line: string, speaker?: string, portrait?: string, goalId?: string) => {
      const goal = chapter.goals.find((g) => !state.goalsDone.has(g.id) && g.id !== goalId);
      raise(room, state, {
        kind: 'beat',
        chapterId: chapter.id,
        ...(speaker !== undefined && { title: speaker }),
        lines: [line],
        ...(portrait !== undefined && { portrait }),
        ...(goal !== undefined && { goal: goal.text }),
      });
      if (goalId !== undefined) completeGoal(room, state, goalId);
    },
  };
  for (const beat of chapter.beats) {
    if (state.fired.includes(beat.id) || !holds(beat.trigger, `b:${beat.id}`, tick, state.latches)) continue;
    state.fired.push(beat.id);
    emitSim(room, {
      tick: room.state.tick,
      kind: 'story.beat',
      data: { chapterId: chapter.id, beat: beat.id },
    });
    runAction(host, beat.action);
  }
  if (holds(chapter.end.trigger, 'end', tick, state.latches)) endChapter(room, state, false);
}
