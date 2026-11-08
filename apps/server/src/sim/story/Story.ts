import { generateId } from '@colyseus/core';
import { type ArcStory as Story, balance, storyArc } from '@wdi/content';
import { ItemStack, Phase } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { newSeat } from '../../rooms/handlers/lobby';
import { applyClock, autoOf, enableAuto, queueAutoStart } from '../auto/Auto';
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
import { type Unit, unitsOf } from './units';
import { type ChapterSummary, type SaveCtx, type StorySave, saveStoreFor } from '../../accounts/saves';
import { castTable, holderOf, switchRole } from './handover';
import { type Latches, hear, holds } from './triggers';
import { resetProgress } from '../vendettas/progress';
import { setVendetta } from '../vendettas/state';

/**
 * Story mode's engine (docs/story/README.md 2, GDD 3.34): one human seat among NPC seats on the auto harness, seeds
 * fixed from the story so it replays, the clock paused whenever a card is up, and the beat runner (`runStory`, one
 * Step stage after `runEvents`). State is room memory beside the clock's, never in a schema; nothing here reaches a
 * public field.
 */

/** The `story.card` payload (docs/story/README.md 3); S3 owns the wire constants and the client. */
export interface StoryCard {
  kind: 'title' | 'section' | 'beat' | 'line' | 'end';
  /** The arc chapter's id; `sectionId` is the running section's (the wire of docs/story/part2.md, P3's A518). */
  chapterId: string;
  sectionId?: string;
  /** A `line` card's speaker: a seat's public name or a named figure. */
  speaker?: string;
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
  /** The story's sections in play order: the running unit is `units[chapterIdx]` (arc E1). */
  units: Unit[];
  /** The one human seat's id, fixed for the whole story (the client's session id). */
  humanId: string;
  /** Index of the running section in `units` (the part-1 name stays), -1 before the first one starts. */
  chapterIdx: number;
  chapterStartTick: number;
  /** A chapter has ended and its end card is up (or queued); no beats run until the next one starts. */
  ended: boolean;
  failed: boolean;
  /** Sections whose one replay is spent (A515: a failure replays the section once, then the story moves on). */
  replayUsed: Set<string>;
  /** The end card that is up (or queued) ends in a replay of the same section. */
  replaying: boolean;
  /** Where the story started: 0, or the first section of the chapter a resumed save continues (plan 5). */
  startIdx: number;
  /** Arc chapters finished so far, in order, and what the end screen shows of each: the save's body. */
  finished: string[];
  summaries: ChapterSummary[];
  /** The save's revision; each break writes the next. */
  rev: number;
  /** Counters summed over the sections of the running arc chapter, and whether any section failed for good. */
  totals: Record<string, number>;
  chapterFailed: boolean;
  now: () => number;
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
  return registry.get(storyId) ?? storyArc.stories[storyId] ?? null;
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
  /** A validated save to continue from (`resumeIndex` found its place); the story starts at that chapter. */
  resume?: StorySave;
  /** The clock for a save's `savedAt` (default: the wall clock; a replay digest never reads it). */
  now?: () => number;
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
    units: unitsOf(story),
    humanId,
    chapterIdx: -1,
    chapterStartTick: 0,
    ended: false,
    failed: false,
    replayUsed: new Set(),
    replaying: false,
    startIdx: 0,
    finished: [],
    summaries: [],
    rev: 0,
    totals: {},
    chapterFailed: false,
    now: opts.now ?? Date.now,
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
  const at = opts.resume === undefined ? -1 : resumeIndex(state.units, opts.resume);
  if (opts.resume !== undefined && at > 0) {
    const sections = new Set(state.units.slice(0, at).map((u) => u.id));
    state.startIdx = at;
    state.finished = [...opts.resume.finished];
    state.summaries = opts.resume.summaries.filter((m) => opts.resume!.finished.includes(m.chapterId));
    state.replayUsed = new Set(opts.resume.replayUsed.filter((id) => sections.has(id)));
    state.rev = opts.resume.rev;
  }
  const first = state.units[state.startIdx];
  if (first !== undefined) flowOf(room).fixedDeal = { [humanId]: first.roleId };
  if (opts.start !== false) queueAutoStart(room);
  return state;
}

/** The player's `story.continue`: queued by the message callback, consumed by the next `runStory`. */
/** Queues the start of the story's match once; a start already queued by `enableStory` is not doubled. */
export function queueStoryStart(room: PartyRoom): void {
  const auto = autoOf(room);
  if (auto !== null && auto.commands.some((c) => c.kind === 'start')) return;
  queueAutoStart(room);
}

export function queueStoryContinue(room: PartyRoom, seat: string): void {
  const state = storyOf(room);
  if (state !== null && seat === state.humanId) state.queue.push({ kind: 'continue', seat });
}

/**
 * `story.start { storyId, chapterId? }` (the title screen): the sender's room becomes the story room straight from the
 * lobby, with the sender as the one human, and the story starts. An unknown story, a room that is not a lone
 * human's lobby, or a second start is ignored; `chapterId` replays a finished chapter of the save (`replayFrom`).
 */
export function handleStoryStart(room: PartyRoom, seat: string, payload: Record<string, unknown>): void {
  const { storyId } = payload;
  if (typeof storyId !== 'string' || storyOf(room) !== null || room.state.phase !== Phase.lobby) return;
  if (room.state.leaderId !== seat) return;
  try {
    // `resume` is the save the client was last given by `story.saved`; the device store re-validates it (plan 5).
    const ctx: SaveCtx = {
      seat,
      send: (t, p) => room.clients.getById(seat)?.send(t, p),
      resume: payload.resume,
    };
    const kept = saveStoreFor(ctx).get(ctx, storyId);
    const save =
      kept !== null && typeof payload.chapterId === 'string' ? replayFrom(kept, payload.chapterId) : kept;
    enableStory(room, storyId, { humanId: seat, ...(save !== null && { resume: save }) });
  } catch {
    // an unknown story id, or a lobby with more than one human: nothing starts
  }
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

const chapterOf = (state: StoryState): Unit | undefined => state.units[state.chapterIdx];

function sendGoals(room: PartyRoom, state: StoryState): void {
  const chapter = chapterOf(state);
  if (chapter === undefined) return;
  send(room, state, STORY_MSG.goals, {
    chapterId: chapter.chapter.id,
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
function seekPhase(room: PartyRoom, chapter: Unit): void {
  if (chapter.startPhase === undefined) return;
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

function startChapter(room: PartyRoom, state: StoryState, idx: number, replay = false): void {
  const chapter = state.units[idx];
  if (chapter === undefined) return;
  const previous = state.units[idx - 1];
  if (idx > 0 || replay) {
    // A replay is the same card again: the view starts over and the player is made whole where they stand.
    switchRole(
      room,
      state.humanId,
      chapter.roleId,
      chapter.look,
      new Set(state.units.map((c) => c.roleId)),
      chapter.vendetta,
    );
    seekPhase(room, chapter);
  } else if (chapter.look !== undefined) {
    const player = room.state.players.get(state.humanId);
    if (player) player.look = chapter.look;
  }
  // The chapter's cast (arc E2): after the seat's own card has moved, every card the cast names has a seat.
  if (chapter.first && !replay && chapter.chapter.cast !== undefined)
    castTable(room, state.humanId, chapter.chapter.cast);
  // E4: the Killer the player meets already holds the section's vendetta, its progress started over. When the player
  // takes the card at the next break the vendetta travels with it (`switchRole`).
  if (chapter.npcVendetta !== undefined && !replay) {
    const killer = holderOf(room, state.humanId, 'killer');
    if (killer !== null) {
      setVendetta(room, killer, chapter.npcVendetta);
      resetProgress(room, killer);
    }
  }
  state.seen.items = null; // a new card's kit is not a pickup
  if (chapter.first && !replay) {
    state.totals = {};
    state.chapterFailed = false;
  }
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
    data: { chapterId: chapter.id, chapter: chapter.id, index: idx, arcChapter: chapter.chapter.id, replay },
  });
  // The first section of an arc chapter opens with the chapter's card; every later section has its own (arc E1).
  const opening = chapter.first ? [chapter.chapter.setup, chapter.setup] : [chapter.setup];
  raise(room, state, {
    kind: chapter.first ? 'title' : 'section',
    chapterId: chapter.chapter.id,
    sectionId: chapter.id,
    title: chapter.first ? chapter.chapter.title : chapter.title,
    lines: [...new Set(opening), ...handed.map((h) => h.text)],
  });
  sendGoals(room, state);
}

function endChapter(room: PartyRoom, state: StoryState, failed: boolean): void {
  const chapter = chapterOf(state);
  if (chapter === undefined || state.ended) return;
  state.ended = true;
  state.failed = failed;
  state.cards = []; // beat cards the player has not read yet are moot
  // A break inside an arc chapter has no card unless the section names one; a failure or the match's end always does.
  const card = chapter.endCard ?? (failed || state.final ? chapter.chapter.end : null);
  const keys = (chapter.endCard ?? chapter.chapter.end).summaryKeys;
  // A failure replays the section once (A515); a second failure, or a match that has ended, moves on.
  const replay =
    failed && !state.final && room.state.phase !== Phase.gameOver && !state.replayUsed.has(chapter.id);
  if (replay) state.replayUsed.add(chapter.id);
  state.replaying = replay;
  if (!replay) {
    for (const [k, n] of Object.entries(state.counters)) state.totals[k] = (state.totals[k] ?? 0) + n;
    state.chapterFailed ||= failed;
    if (chapter.last || state.final) saveBreak(room, state, chapter);
  }
  const summary = Object.fromEntries(keys.map((k) => [k, state.counters[k] ?? 0]));
  emitSim(room, {
    tick: room.state.tick,
    kind: 'story.chapterEnd',
    data: { chapterId: chapter.id, chapter: chapter.id, failed, replay, summary },
  });
  if (card === null) return afterEndCard(room, state);
  const next = state.units[state.chapterIdx + 1];
  const endCard: StoryCard = {
    kind: 'end',
    chapterId: chapter.chapter.id,
    sectionId: chapter.id,
    title: chapter.title,
    lines: failed ? [card.failedLine] : card.lines,
    summary,
    ...(replay
      ? { next: chapter.first ? chapter.chapter.title : chapter.title }
      : next !== undefined && { next: next.first ? next.chapter.title : next.title }),
  };
  if (state.cardUp) state.cards.push(endCard);
  else showCard(room, state, endCard);
}

/** The save at an arc chapter's break (plan 5): written by the server from what it ran, then handed to the store. */
function saveBreak(room: PartyRoom, state: StoryState, chapter: Unit): void {
  const keys = chapter.chapter.end.summaryKeys;
  const counters = Object.fromEntries(keys.map((k) => [k, state.totals[k] ?? 0]));
  state.finished.push(chapter.chapter.id);
  state.summaries.push({
    chapterId: chapter.chapter.id,
    ...(state.chapterFailed && { failed: true }),
    counters,
  });
  const next = state.units[state.chapterIdx + 1];
  const save: StorySave = {
    v: 1,
    storyId: state.story.id,
    nextChapterId: state.final || next === undefined ? null : next.chapter.id,
    finished: [...state.finished],
    handOn: chapter.handOn,
    replayUsed: [...state.replayUsed],
    summaries: state.summaries.map((m) => ({ ...m })),
    rev: ++state.rev,
    savedAt: state.now(),
  };
  const ctx: SaveCtx = { seat: state.humanId, send: (t, p) => send(room, state, t, p) };
  saveStoreFor(ctx).put(ctx, save);
}

/**
 * `story.start { chapterId }` (Q-S4): the save narrowed to the chapters before a finished `chapterId`, so the story
 * continues from that chapter. A chapter the save has not finished is not offered; the save comes back as it was.
 */
export function replayFrom(save: StorySave, chapterId: string): StorySave {
  const at = save.finished.indexOf(chapterId);
  return at < 0 ? save : { ...save, nextChapterId: chapterId, finished: save.finished.slice(0, at) };
}

/**
 * Where a validated save continues: the first section of its `nextChapterId`, when `finished` is exactly the chapters
 * before it in order; -1 (start over) for a save that does not fit the story.
 */
export function resumeIndex(units: readonly Unit[], save: StorySave): number {
  const idx = units.findIndex((u) => u.first && u.chapter.id === save.nextChapterId);
  if (idx <= 0) return -1;
  const before = units
    .slice(0, idx)
    .filter((u) => u.first)
    .map((u) => u.chapter.id);
  return before.length === save.finished.length && before.every((id, i) => id === save.finished[i])
    ? idx
    : -1;
}

/** The end card was dismissed: the next chapter starts, or the story is over. */
function afterEndCard(room: PartyRoom, state: StoryState): void {
  if (state.replaying) {
    state.replaying = false;
    startChapter(room, state, state.chapterIdx, true);
  } else if (!state.final && state.chapterIdx + 1 < state.units.length)
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
  if (ev.kind === 'vendetta.heist.cracked') bump('strongboxTaken');
  if (ev.kind === 'vendetta.sabotage.tampered') bump('targetsTampered');
  if (ev.kind === 'vendetta.sabotage.wrecked') bump('worksWrecked');
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
    if (events.some((e) => e.kind === 'start')) startChapter(room, state, state.startIdx);
    return;
  }
  const chapter = chapterOf(state);
  if (chapter === undefined || state.ended) return;

  for (const ev of events) {
    count(state, ev, seatOf);
    chapter.goals.forEach((g) => g.trigger && hear(g.trigger, `g:${g.id}`, ev, state.latches, seatOf));
    chapter.beats.forEach((b) => hear(b.trigger, `b:${b.id}`, ev, state.latches, seatOf));
    hear(chapter.end, 'end', ev, state.latches, seatOf);
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
    card: (line: string, speaker?: string, portrait?: string, goalId?: string, spoken?: boolean) => {
      const goal = chapter.goals.find((g) => !state.goalsDone.has(g.id) && g.id !== goalId);
      raise(room, state, {
        kind: spoken === true ? 'line' : 'beat',
        chapterId: chapter.chapter.id,
        sectionId: chapter.id,
        ...(speaker !== undefined && (spoken === true ? { speaker } : { title: speaker })),
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
  if (holds(chapter.end, 'end', tick, state.latches)) endChapter(room, state, false);
}
