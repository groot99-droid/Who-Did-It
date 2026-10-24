import { balance } from '@wdi/content';
import { TICK_RATE, TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { AnimId } from '../constants';
import { emitSim, onSim, type SimEvent } from '../events/bus';
import { mobBodies } from '../Mobs';
import { MobState } from '../mobs/ai';
import { lightBurns } from '../mobs/light';
import { type PlayerSim, simOf } from '../RoomSim';
import { sceneKey } from '../World';
import { type Brain, npcMemory } from './memory';
import { litAtNight, phaseClassOf } from './routine';

/**
 * Needs and moods (round 8, GDD 3.24, docs/round8/townsfolk.md 1; Session 8E). Every NPC seat (and, through the same
 * functions, every ambient townsfolk figure) carries four needs, each a 0..1 level in room memory: Hunger, Fear,
 * Anger and Want. The mood is the strongest need over `moods.threshold`, or Desperate when `moods.desperateNeeds`
 * needs are over it. Nothing here reaches the wire: the only public trace of a mood is the idle the seat plays
 * while it stands still (`moodIdleOf`, the `cower`, `fidget` and `stomp` idles of seams.md 2) and the routine draw
 * it shifts (`moodWeights`). Card-blind: every need moves on what happened to the seat, never on its card, so a
 * Killer NPC cowers at a body like anyone else, its own included.
 *
 * `updateNeeds` is the one-line hook of `sim/npc/world.ts` (seams.md 5), `moodWeights` the one of `sim/npc/routine.ts`.
 * The needs are keyed by the `Brain` object, so a new role card (which forgets every brain) starts them afresh.
 */

export type Mood = 'calm' | 'hungry' | 'scared' | 'angry' | 'desperate';
export type NeedId = 'hunger' | 'fear' | 'anger' | 'want';

/** What one seat needs; room memory only, never on the wire. */
export interface Needs {
  hunger: number;
  fear: number;
  anger: number;
  want: number;
  mood: Mood;
  /** The tick the current mood began (a mood holds `moods.moodHoldS` before it may change). */
  moodSinceTick: number;
  /** The seat this one was last struck, robbed or taxed by; null when none (the Angry routine's anchor). */
  angryAt: string | null;
  /** Bodies counted into Fear so far (`Brain.seenBodies` only ever grows within a brain's life). */
  bodiesSeen: number;
  /** The creature counted into Fear as chasing this seat, so one chase frightens once. */
  chasedBy: string | null;
}

/** The mood idles the server sends while a seat stands still (seams.md 2; the `AnimId` rows of 8A's #131). */
export const MOOD_ANIM = { cower: AnimId.cower, fidget: AnimId.fidget, stomp: AnimId.stomp } as const;

/** The idle each mood shows; Calm shows the plain idle. A mood is never a word on the wire, only this. */
const IDLE_OF: Record<Mood, number | null> = {
  calm: null,
  hungry: MOOD_ANIM.fidget,
  scared: MOOD_ANIM.cower,
  angry: MOOD_ANIM.stomp,
  desperate: MOOD_ANIM.fidget,
};

const MOOD_OF_NEED: Record<NeedId, Mood> = {
  hunger: 'hungry',
  fear: 'scared',
  anger: 'angry',
  want: 'desperate',
};
const NEED_IDS: readonly NeedId[] = ['hunger', 'fear', 'anger', 'want'];

const store = new WeakMap<Brain, Needs>();
/** The idle a still seat shows this tick, by its sim; absent when its mood is Calm (or it is not an NPC). */
const idles = new WeakMap<PlayerSim, number>();
const wired = new WeakSet<PartyRoom>();
/** The brains of the ambient townsfolk figures by figure id (`sim/townsfolk/`), so an event naming a figure finds its needs. */
const figureBrains = new WeakMap<PartyRoom, Map<string, Brain>>();

const clamp = (v: number): number => Math.min(1, Math.max(0, v));

/** The needs of a brain, made at zero on first use. */
export function needsOf(brain: Brain): Needs {
  let n = store.get(brain);
  if (!n) {
    n = {
      hunger: 0,
      fear: 0,
      anger: 0,
      want: 0,
      mood: 'calm',
      moodSinceTick: -1,
      angryAt: null,
      bodiesSeen: 0,
      chasedBy: null,
    };
    store.set(brain, n);
  }
  return n;
}

/** The mood of an NPC seat or a townsfolk figure, or null for one with no brain (a human, or one not yet ticked). */
export function moodOf(room: PartyRoom, id: string): Mood | null {
  const n = needsById(room, id);
  return n?.mood ?? null;
}

/** The mood idle of a brain (a townsfolk figure's, `sim/townsfolk/`); undefined for the plain idle. */
export function moodIdleFor(brain: Brain): number | undefined {
  const n = store.get(brain);
  return n === undefined ? undefined : (IDLE_OF[n.mood] ?? undefined);
}

/** `sim/townsfolk/`: a figure's brain answers to its id on the bus (`body.hit`, `rob`, `eat`, `eject`) until unbound. */
export function bindFigureNeeds(room: PartyRoom, id: string, brain: Brain | null): void {
  let brains = figureBrains.get(room);
  if (!brains) figureBrains.set(room, (brains = new Map()));
  if (brain === null) brains.delete(id);
  else brains.set(id, brain);
}

/** The mood idle a still seat shows (the `publishPresence` line, `sim/Movement.ts`); undefined for the plain idle. */
export function moodIdleOf(p: PlayerSim): number | undefined {
  return idles.get(p);
}

/**
 * The routine weights under the seat's mood (the `choose` line of `sim/npc/routine.ts`): the class's base weights
 * scaled by `moods.weights[mood]` and normalised, so a Hungry seat works more, a Scared one idles, an Angry or
 * Desperate one strolls. Calm returns the base untouched.
 */
export function moodWeights<T extends { work: number; stroll: number; idle: number }>(
  brain: Brain,
  base: T,
): T {
  const n = store.get(brain);
  if (!n || n.mood === 'calm') return base;
  const f = balance.moods.weights[n.mood];
  const work = base.work * f.work;
  const stroll = base.stroll * f.stroll;
  const idle = base.idle * f.idle;
  const sum = work + stroll + idle || 1;
  return { ...base, work: work / sum, stroll: stroll / sum, idle: idle / sum };
}

/** 8C's purse, read without a compile-time dependency on its schema row; null until it exists. */
function purseOf(room: PartyRoom, seat: string): number | null {
  const priv = room.state.players.get(seat)?.priv as unknown as { purse?: unknown } | undefined;
  return typeof priv?.purse === 'number' ? priv.purse : null;
}

/**
 * Whether 8A's `Private.body.effects` carries an effect (seams.md 2 ids: Famished 9, Indebted 11), read without a
 * compile-time dependency on its schema row; false until it exists.
 */
function hasEffect(room: PartyRoom, seat: string, id: number): boolean {
  const priv = room.state.players.get(seat)?.priv as unknown as
    { body?: { effects?: Iterable<{ id?: unknown }> } } | undefined;
  const effects = priv?.body?.effects;
  if (!effects) return false;
  for (const e of effects) if (e?.id === id) return true;
  return false;
}
const FAMISHED_EFFECT = 9;
const INDEBTED_EFFECT = 11;

/** Another living seat placed in the scene within day sight: company (and, for 8E's mugging, the end of being alone). */
function hasCompany(room: PartyRoom, seat: string, p: { sceneIdx: number; x: number; y: number }): boolean {
  const reach = balance.vision.dayTiles * TILE_PX;
  for (const [id, o] of simOf(room).players) {
    if (id === seat || o.dead || !o.placed || o.sceneIdx !== p.sceneIdx) continue;
    if (Math.hypot(o.x - p.x, o.y - p.y) <= reach) return true;
  }
  return false;
}

/** The creature chasing this seat now, if any (`Mobs.ts` room memory). */
function chaserOf(room: PartyRoom, seat: string): string | null {
  for (const body of mobBodies(room).values()) {
    if (body.mind.state === MobState.chase && body.mind.prey === seat) return body.id;
  }
  return null;
}

/** The needs behind an NPC seat id or a townsfolk figure id, when that brain has ticked. */
function needsById(room: PartyRoom, id: unknown): Needs | null {
  if (typeof id !== 'string') return null;
  const brain = npcMemory(room).brains.get(id) ?? figureBrains.get(room)?.get(id);
  const n = brain === undefined ? undefined : store.get(brain);
  return n ?? null;
}

/** The seat this brain suspects most (the A41 stand-in), or null. */
function topSuspect(brain: Brain): string | null {
  let best: string | null = null;
  let count = 0;
  for (const [id, c] of brain.suspicion) {
    if (c > count) {
      count = c;
      best = id;
    }
  }
  return best;
}

/**
 * The bus events that move a need (townsfolk.md 1), wired once per room. The kinds of other sessions are named by
 * seams.md 4 and read by string, so nothing here waits on their PRs: `body.hit` (8A), `rob` (8E's mugging PR),
 * `rent.paid` and `quota.met` (8D), `purse` (8C) and `eject`; `eat` is the kind 8E asks 8A for (a Wake Loaf eaten).
 */
function wire(room: PartyRoom): void {
  if (wired.has(room)) return;
  wired.add(room);
  const m = balance.moods;
  onSim(room, 'body.hit', (e: SimEvent) => {
    const n = needsById(room, e.data?.target);
    if (!n) return;
    n.fear = clamp(n.fear + m.fear.struck);
    n.anger = clamp(n.anger + m.anger.struck);
    if (typeof e.data?.by === 'string') n.angryAt = e.data.by;
  });
  onSim(room, 'rob', (e: SimEvent) => {
    const n = needsById(room, e.data?.target);
    if (!n) return;
    n.anger = clamp(n.anger + m.anger.robbed);
    if (typeof e.data?.by === 'string') n.angryAt = e.data.by;
  });
  const taxed = (e: SimEvent) => {
    const n = needsById(room, e.seat ?? e.data?.seat);
    if (n) n.anger = clamp(n.anger + m.anger.taxed);
  };
  onSim(room, 'rent.paid', taxed);
  onSim(room, 'quota.met', taxed);
  onSim(room, 'purse', (e: SimEvent) => {
    const n = needsById(room, e.seat ?? e.data?.seat);
    if (!n) return;
    if (e.data?.reason === 'wage') n.want = clamp(n.want - m.want.wage);
    else if (e.data?.reason === 'sale') n.want = clamp(n.want - m.want.sale);
  });
  onSim(room, 'eat', (e: SimEvent) => {
    const n = needsById(room, e.seat ?? e.data?.seat);
    if (!n) return;
    n.hunger = clamp(n.hunger - m.hunger.mealRelief);
    n.anger = clamp(n.anger - m.anger.mealRelief);
  });
  onSim(room, 'eject', (e: SimEvent) => {
    const mem = npcMemory(room);
    for (const [id, brain] of mem.brains) {
      const n = store.get(brain);
      if (!n || simOf(room).players.get(id)?.dead !== false) continue;
      n.fear = clamp(n.fear + m.fear.ejection);
      if (e.seat !== undefined && topSuspect(brain) === e.seat)
        n.anger = clamp(n.anger - m.anger.ejectionRelief);
    }
    // The townsfolk hear of it too (a living figure keeps its binding; a dead one is unbound).
    for (const brain of figureBrains.get(room)?.values() ?? []) {
      const n = store.get(brain);
      if (n) n.fear = clamp(n.fear + m.fear.ejection);
    }
  });
}

/** Who a tick of needs is about: an NPC seat (`updateNeeds`) or a townsfolk figure (`sim/townsfolk/`). */
export interface NeedSubject {
  /** The seat id or the figure id (what the `mood` event names). */
  id: string;
  sceneIdx: number;
  x: number;
  y: number;
  /** Standing in its home scene. */
  home: boolean;
  /** A burning light in hand (a figure carries none). */
  light: boolean;
}

/**
 * One tick of a living, placed NPC seat (the locked hook in `runWorldNpc`, after `observe`): the needs rise and fall
 * by their rates, then the mood is settled and its idle recorded for `publishPresence`.
 */
export function updateNeeds(room: PartyRoom, brain: Brain, seat: string): void {
  const p = simOf(room).players.get(seat);
  if (!p) return;
  const scene = sceneKey(p.sceneIdx);
  const idle = tickNeeds(room, brain, {
    id: seat,
    sceneIdx: p.sceneIdx,
    x: p.x,
    y: p.y,
    home: brain.persona?.home === scene,
    light: lightBurns(room, seat),
  });
  if (idle === undefined) idles.delete(p);
  else idles.set(p, idle);
}

/**
 * One tick of needs for `s` on `brain` (the seat hook above, and every townsfolk figure's tick): the rates, the
 * mood, then the mood idle to show while still (undefined for the plain idle).
 */
export function tickNeeds(room: PartyRoom, brain: Brain, s: NeedSubject): number | undefined {
  wire(room);
  const m = balance.moods;
  const n = needsOf(brain);
  const dt = 1 / TICK_RATE;
  const phase = room.state.phase;
  const scene = sceneKey(s.sceneIdx);
  const home = s.home;
  const lit = litAtNight(scene);
  const cls = phaseClassOf(phase);

  // Hunger: time without food, faster when Famished; a meal at home (the `eat` event is the Wake Loaf).
  const rise = (dt / m.hunger.riseS) * (hasEffect(room, s.id, FAMISHED_EFFECT) ? m.hunger.famishedMul : 1);
  n.hunger = clamp(n.hunger + rise - (home ? dt / m.hunger.homeFallS : 0));

  // Fear: bodies seen (own ones too: card-blind), a creature's chase, the dark outdoors alone without a light; falls
  // with daylight, company, a lit scene or home.
  const bodies = brain.seenBodies.size;
  if (bodies > n.bodiesSeen) {
    n.fear = clamp(n.fear + m.fear.body * (bodies - n.bodiesSeen));
    n.bodiesSeen = bodies;
  }
  const chaser = chaserOf(room, s.id);
  if (chaser !== null && chaser !== n.chasedBy) n.fear = clamp(n.fear + m.fear.chase);
  n.chasedBy = chaser;
  const company = hasCompany(room, s.id, s);
  if (cls === 'night' && !lit && !company && !s.light) n.fear = clamp(n.fear + dt / m.fear.darkRiseS);
  if (cls === 'day' || lit || home || company) n.fear = clamp(n.fear - dt / m.fear.fallS);

  // Anger cools with time; the events above heat it.
  n.anger = clamp(n.anger - dt / m.anger.fallS);
  if (n.anger === 0) n.angryAt = null;

  // Want: a light purse and debt (8C's and 8D's rows, read when they exist); wages and sales relieve it.
  const purse = purseOf(room, s.id);
  if (purse !== null && purse < m.want.lightPurse) n.want = clamp(n.want + dt / m.want.lightRiseS);
  if (hasEffect(room, s.id, INDEBTED_EFFECT)) n.want = clamp(n.want + dt / m.want.debtRiseS);

  settleMood(room, s.id, n);
  return IDLE_OF[n.mood] ?? undefined;
}

/** The strongest need over the threshold, Desperate with `desperateNeeds` over it, Calm with none; held `moodHoldS`. */
function settleMood(room: PartyRoom, figure: string, n: Needs): void {
  const m = balance.moods;
  const tick = room.state.tick;
  const over = NEED_IDS.filter((id) => n[id] >= m.threshold);
  let next: Mood = 'calm';
  if (over.length >= m.desperateNeeds) next = 'desperate';
  else if (over.length > 0) {
    let best = over[0] as NeedId;
    for (const id of over) if (n[id] > n[best]) best = id;
    next = MOOD_OF_NEED[best];
  }
  if (next === n.mood) return;
  if (n.moodSinceTick >= 0 && tick - n.moodSinceTick < Math.round(m.moodHoldS * TICK_RATE)) return;
  n.mood = next;
  n.moodSinceTick = tick;
  // Server only (seams.md 4): the admin log may show it, a client never does.
  emitSim(room, { tick, kind: 'mood', data: { figure, mood: next } });
}
