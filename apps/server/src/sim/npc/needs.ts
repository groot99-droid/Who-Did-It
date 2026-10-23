import { balance } from '@wdi/content';
import { TICK_RATE, TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { onSim, type SimEvent } from '../events/bus';
import { mobBodies } from '../Mobs';
import { MobState } from '../mobs/ai';
import { lightBurns } from '../mobs/light';
import { type PlayerSim, simOf } from '../RoomSim';
import { sceneKey } from '../World';
import { type Brain, npcMemory } from './memory';
import { litAtNight, phaseClassOf } from './routine';

/**
 * Needs (round 8, GDD 3.24, docs/round8/townsfolk.md 1; Session 8E). Every NPC seat carries four needs, each a 0..1
 * level in room memory: Hunger, Fear, Anger and Want. They move with the bus events of seams.md 4 and the rates of
 * `balance.json` `moods`, and nothing here reaches the wire. Card-blind: every need moves on what happened to the
 * seat, never on its card, so a Killer NPC fears a body like anyone else, its own included. The mood built on them
 * (the idle a still seat shows and the routine draw it shifts) is the stacked PR's.
 *
 * `updateNeeds` is the one-line hook of `sim/npc/world.ts` (seams.md 5). The needs are keyed by the `Brain` object,
 * so a new role card (which forgets every brain) starts them afresh.
 */

export type NeedId = 'hunger' | 'fear' | 'anger' | 'want';

/** What one seat needs; room memory only, never on the wire. */
export interface Needs {
  hunger: number;
  fear: number;
  anger: number;
  want: number;
  /** The seat this one was last struck, robbed or taxed by; null when none (the Angry routine's anchor). */
  angryAt: string | null;
  /** Bodies counted into Fear so far (`Brain.seenBodies` only ever grows within a brain's life). */
  bodiesSeen: number;
  /** The creature counted into Fear as chasing this seat, so one chase frightens once. */
  chasedBy: string | null;
}

const store = new WeakMap<Brain, Needs>();
const wired = new WeakSet<PartyRoom>();

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
      angryAt: null,
      bodiesSeen: 0,
      chasedBy: null,
    };
    store.set(brain, n);
  }
  return n;
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
function hasCompany(room: PartyRoom, seat: string, p: PlayerSim): boolean {
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

/** The brain's needs by seat id, when that seat is an NPC that has ticked. */
function needsBySeat(room: PartyRoom, seat: unknown): Needs | null {
  if (typeof seat !== 'string') return null;
  const brain = npcMemory(room).brains.get(seat);
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
    const n = needsBySeat(room, e.data?.target);
    if (!n) return;
    n.fear = clamp(n.fear + m.fear.struck);
    n.anger = clamp(n.anger + m.anger.struck);
    if (typeof e.data?.by === 'string') n.angryAt = e.data.by;
  });
  onSim(room, 'rob', (e: SimEvent) => {
    const n = needsBySeat(room, e.data?.target);
    if (!n) return;
    n.anger = clamp(n.anger + m.anger.robbed);
    if (typeof e.data?.by === 'string') n.angryAt = e.data.by;
  });
  const taxed = (e: SimEvent) => {
    const n = needsBySeat(room, e.seat ?? e.data?.seat);
    if (n) n.anger = clamp(n.anger + m.anger.taxed);
  };
  onSim(room, 'rent.paid', taxed);
  onSim(room, 'quota.met', taxed);
  onSim(room, 'purse', (e: SimEvent) => {
    const n = needsBySeat(room, e.seat ?? e.data?.seat);
    if (!n) return;
    if (e.data?.reason === 'wage') n.want = clamp(n.want - m.want.wage);
    else if (e.data?.reason === 'sale') n.want = clamp(n.want - m.want.sale);
  });
  onSim(room, 'eat', (e: SimEvent) => {
    const n = needsBySeat(room, e.seat ?? e.data?.seat);
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
  });
}

/**
 * One tick of a living, placed NPC seat (the locked hook in `runWorldNpc`, after `observe`): the needs rise and fall
 * by their rates.
 */
export function updateNeeds(room: PartyRoom, brain: Brain, seat: string): void {
  wire(room);
  const p = simOf(room).players.get(seat);
  if (!p) return;
  const m = balance.moods;
  const n = needsOf(brain);
  const dt = 1 / TICK_RATE;
  const phase = room.state.phase;
  const scene = sceneKey(p.sceneIdx);
  const home = brain.persona?.home === scene;
  const lit = litAtNight(scene);
  const cls = phaseClassOf(phase);

  // Hunger: time without food, faster when Famished; a meal at home (the `eat` event is the Wake Loaf).
  const rise = (dt / m.hunger.riseS) * (hasEffect(room, seat, FAMISHED_EFFECT) ? m.hunger.famishedMul : 1);
  n.hunger = clamp(n.hunger + rise - (home ? dt / m.hunger.homeFallS : 0));

  // Fear: bodies seen (own ones too: card-blind), a creature's chase, the dark outdoors alone without a light; falls
  // with daylight, company, a lit scene or home.
  const bodies = brain.seenBodies.size;
  if (bodies > n.bodiesSeen) {
    n.fear = clamp(n.fear + m.fear.body * (bodies - n.bodiesSeen));
    n.bodiesSeen = bodies;
  }
  const chaser = chaserOf(room, seat);
  if (chaser !== null && chaser !== n.chasedBy) n.fear = clamp(n.fear + m.fear.chase);
  n.chasedBy = chaser;
  const company = hasCompany(room, seat, p);
  if (cls === 'night' && !lit && !company && !lightBurns(room, seat))
    n.fear = clamp(n.fear + dt / m.fear.darkRiseS);
  if (cls === 'day' || lit || home || company) n.fear = clamp(n.fear - dt / m.fear.fallS);

  // Anger cools with time; the events above heat it.
  n.anger = clamp(n.anger - dt / m.anger.fallS);
  if (n.anger === 0) n.angryAt = null;

  // Want: a light purse and debt (8C's and 8D's rows, read when they exist); wages and sales relieve it.
  const purse = purseOf(room, seat);
  if (purse !== null && purse < m.want.lightPurse) n.want = clamp(n.want + dt / m.want.lightRiseS);
  if (hasEffect(room, seat, INDEBTED_EFFECT)) n.want = clamp(n.want + dt / m.want.debtRiseS);
}
