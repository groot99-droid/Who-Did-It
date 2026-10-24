import { balance } from '@wdi/content';
import { TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { balanceOf, purseBand } from '../economy/purse';
import { hubOf } from '../MapSites';
import { lightBurns } from '../mobs/light';
import { isNpcSeat } from '../Npc';
import { type Brain, npcMemory } from '../npc/memory';
import { type Needs, hasBodyEffect, moodStrength, needsOf } from '../npc/needs';
import { phaseClassOf } from '../npc/routine';
import { type PlayerSim, simOf } from '../RoomSim';
import { sceneKey } from '../World';
import { type Figure, figuresOf } from './figures';

/**
 * The mugging (round 8, GDD 3.24, docs/round8/townsfolk.md 3; Session 8E). A Hungry, Angry or Desperate ambient
 * figure or NPC seat that is alone with one seat (A100's room rule, with the figures as company too) rolls each
 * second on its own stream; the chance rises with the target's purse band and the mugger's mood, with the night,
 * with a Weakened or Fatigued target and with a long time alone beside a heavy purse, and falls with the mugger's
 * fear and a lit light in the target's hand (`mugChance`). The mugger walks up, threatens, and the target chooses
 * within `moods.mug.answerS`: Pay loses `share` of the purse (banked Scrip is safe), Flee is a chase. A human
 * answers with `act.mug` (`handleMug`); an NPC seat pays. Fight and the strike that ends a silent prompt wait on
 * 8A's fists (body.md 4): until then no answer is taken as a Pay, and `fight` is refused. Every move of Scrip
 * goes through `movePurse` (a figure's take sits in its `@figure:<id>` account), every mugging leaves a `scuffle`
 * clue, and nothing of it reaches the wire but the prompt and the drawn threat. This step holds the roll and its
 * memory; the walk-up, the threat, the prompt and the take follow (DECISIONS A180).
 */

export type MugChoice = 'pay' | 'fight' | 'flee';
export type MugOutcome = 'paid' | 'taken' | 'caught' | 'escaped' | 'lost';
type MugState = 'approach' | 'threat' | 'prompt' | 'chase';

/** One mugging under way, room memory only. */
export interface Mugging {
  /** The figure id or the NPC seat id. */
  mugger: string;
  figure: Figure | null;
  /** The seat mugged. */
  target: string;
  state: MugState;
  /** When the state runs out: the approach given up, the threat over, the answer due, the chase over. */
  untilTick: number;
}

interface MugMemory {
  byTarget: Map<string, Mugging>;
  byMugger: Map<string, Mugging>;
  /** Per mugger: the seat it has been alone with and since when (the long-alone factor). */
  alone: Map<string, { target: string; sinceTick: number }>;
  /** Per mugger or target id: no roll touches it before this tick. */
  cooldownUntil: Map<string, number>;
}

/** The private message of the prompt (seams.md 3 `mug.prompt`): `S2C.mugPrompt` once the protocol row lands. */
export const MUG_PROMPT = 'mugPrompt';
/** The account a figure's takings sit in (8C's purse: any `@` account but the town and the banks). */
export const figureAccount = (id: string): string => `@figure:${id}`;

/** 8A's effect ids (seams.md 2), read by number as `needs.ts` reads Famished. */
const WEAKENED_EFFECT = 4;
const FATIGUED_EFFECT = 6;
/** A seat wearing the Watchman's look is never mugged: the look is the badge everyone sees, never the card. */
const WATCHMAN_LOOK = 'watchman';
export const MUG_MOODS: ReadonlySet<Needs['mood']> = new Set(['hungry', 'angry', 'desperate']);

const memories = new WeakMap<PartyRoom, MugMemory>();

function memoryOf(room: PartyRoom): MugMemory {
  let m = memories.get(room);
  if (!m) {
    m = { byTarget: new Map(), byMugger: new Map(), alone: new Map(), cooldownUntil: new Map() };
    memories.set(room, m);
  }
  return m;
}

/** The mugging of `target` (a seat id) under way, if any. */
export const muggingOf = (room: PartyRoom, target: string): Mugging | undefined =>
  memoryOf(room).byTarget.get(target);
/** The mugging `mugger` (a figure or NPC seat id) is busy with, if any; `run.ts` leaves such a figure to this module. */
export const muggingBy = (room: PartyRoom, mugger: string): Mugging | undefined =>
  memoryOf(room).byMugger.get(mugger);

/** The lobby forgets every mugging and cooldown. */
export function clearMuggings(room: PartyRoom): void {
  memories.delete(room);
}

/** What the roll reads (townsfolk.md 3), gathered by `factorsOf`. */
export interface MugFactors {
  /** The target's purse band (8C's `purseBand`). */
  band: 'light' | 'heavy';
  /** The need behind the mugger's mood, 0..1. */
  strength: number;
  /** The mugger's Fear, 0..1. */
  fear: number;
  night: boolean;
  /** The target is Weakened or Fatigued. */
  weak: boolean;
  /** The two have been alone for `longAloneS` (counts only beside a heavy purse). */
  longAlone: boolean;
  /** A light burns in the target's hand. */
  light: boolean;
}

/** The chance per second of a mugging under `f`, in [0, 1]. */
export function mugChance(f: MugFactors): number {
  const c = balance.moods.mug;
  let chance = c.chancePerS[f.band] * (1 + c.moodMul * f.strength) * Math.max(0, 1 - c.fearMul * f.fear);
  if (f.night) chance *= c.nightMul;
  if (f.weak) chance *= c.weakMul;
  if (f.longAlone && f.band === 'heavy') chance *= c.longAloneMul;
  if (f.light) chance *= c.lightMul;
  return Math.min(1, chance);
}

/** A figure or NPC seat that could mug this tick. */
interface Mugger {
  id: string;
  figure: Figure | null;
  brain: Brain;
  sceneIdx: number;
  x: number;
  y: number;
}

/** Every living, placed, unbusy figure and NPC seat with a brain. */
export function muggers(room: PartyRoom): Mugger[] {
  const tick = room.state.tick;
  const out: Mugger[] = [];
  for (const f of figuresOf(room).values()) {
    if (f.dead || f.handle === null || tick < f.busyUntilTick) continue;
    out.push({ id: f.id, figure: f, brain: f.brain, sceneIdx: f.sceneIdx, x: f.x, y: f.y });
  }
  const mem = npcMemory(room);
  for (const [id, p] of simOf(room).players) {
    if (!isNpcSeat(room, id) || p.dead || !p.placed || tick < p.busyUntilTick) continue;
    const brain = mem.brains.get(id);
    if (brain) out.push({ id, figure: null, brain, sceneIdx: p.sceneIdx, x: p.x, y: p.y });
  }
  return out;
}

/**
 * The one seat alone with the mugger (A100's room rule, `companionFor`): in any scene but the map's hub, the only
 * other living placed seat there, with no living figure besides the mugger, not crossing a door, within
 * `npc.aloneKill.sightTiles`, with a purse to lose and not wearing the Watchman's look; null otherwise.
 */
export function aloneTarget(room: PartyRoom, m: Mugger): string | null {
  if (sceneKey(m.sceneIdx) === hubOf(room)) return null;
  const sim = simOf(room);
  let found: string | null = null;
  let other: PlayerSim | null = null;
  for (const [id, q] of sim.players) {
    if (id === m.id || q.dead || !q.placed || q.sceneIdx !== m.sceneIdx) continue;
    if (found !== null) return null;
    found = id;
    other = q;
  }
  if (found === null || other === null) return null;
  for (const f of figuresOf(room).values()) {
    if (f.id !== m.id && !f.dead && f.sceneIdx === m.sceneIdx) return null;
  }
  if (room.state.tick < other.busyUntilTick) return null;
  if (Math.hypot(other.x - m.x, other.y - m.y) > balance.npc.aloneKill.sightTiles * TILE_PX) return null;
  const player = room.state.players.get(found);
  if (!player?.priv || player.look === WATCHMAN_LOOK || balanceOf(room, found) <= 0) return null;
  return found;
}

export function factorsOf(room: PartyRoom, m: Mugger, target: string, longAlone: boolean): MugFactors {
  const n = needsOf(m.brain);
  return {
    band: purseBand(room, target),
    strength: moodStrength(n),
    fear: n.fear,
    night: phaseClassOf(room.state.phase) === 'night',
    weak: hasBodyEffect(room, target, WEAKENED_EFFECT) || hasBodyEffect(room, target, FATIGUED_EFFECT),
    longAlone,
    light: lightBurns(room, target),
  };
}
