import { balance, clues } from '@wdi/content';
import { ClueKind, ErrorCode, S2C, TICK_RATE, TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { decaySeconds, spawnClue } from '../Clues';
import { balanceOf, movePurse, purseBand } from '../economy/purse';
import { emitSim } from '../events/bus';
import { hubOf } from '../MapSites';
import { lightBurns } from '../mobs/light';
import { isNpcSeat } from '../Npc';
import { type Brain, npcMemory, playRng } from '../npc/memory';
import { type Needs, hasBodyEffect, moodStrength, needsOf } from '../npc/needs';
import { phaseClassOf } from '../npc/routine';
import { type PlayerSim, simOf } from '../RoomSim';
import { isWorldPhase, reject, sceneKey } from '../World';
import { type Figure, figureRng, figuresOf } from './figures';
import { walkFigure } from './walk';

/**
 * The mugging (round 8, GDD 3.24, docs/round8/townsfolk.md 3; Session 8E). A Hungry, Angry or Desperate ambient
 * figure or NPC seat that is alone with one seat (A100's room rule, with the figures as company too) rolls each
 * second on its own stream; the chance rises with the target's purse band and the mugger's mood, with the night,
 * with a Weakened or Fatigued target and with a long time alone beside a heavy purse, and falls with the mugger's
 * fear and a lit light in the target's hand (`mugChance`). The mugger walks up, threatens, and the target chooses
 * within `moods.mug.answerS`: Pay loses `share` of the purse (banked Scrip is safe). A human answers with `act.mug`
 * (`handleMug`); an NPC seat pays. This is part one (DECISIONS A180): a silent target is taken for the share, a
 * target that leaves the scene escapes, and `flee` (the chase) and `fight` are refused until 8A's fists land
 * (body.md 4). Every move of Scrip goes through `movePurse` (a figure's take sits in its `@figure:<id>` account),
 * every mugging leaves a `scuffle` clue, and nothing of it reaches the wire but the prompt and the drawn threat.
 */

export type MugChoice = 'pay' | 'fight' | 'flee';
export type MugOutcome = 'paid' | 'taken' | 'escaped' | 'lost';
type MugState = 'approach' | 'threat' | 'prompt';

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

/** The account a figure's takings sit in (8C's purse: any `@` account but the town and the banks). */
export const figureAccount = (id: string): string => `@figure:${id}`;

/** 8A's effect ids (seams.md 2), read by number as `needs.ts` reads Famished. */
const WEAKENED_EFFECT = 4;
const FATIGUED_EFFECT = 6;
/** A seat wearing the Watchman's look is never mugged: the look is the badge everyone sees, never the card. */
const WATCHMAN_LOOK = 'watchman';
const MUG_MOODS: ReadonlySet<Needs['mood']> = new Set(['hungry', 'angry', 'desperate']);

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
function muggers(room: PartyRoom): Mugger[] {
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

function factorsOf(room: PartyRoom, m: Mugger, target: string, longAlone: boolean): MugFactors {
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

const ticksOf = (s: number): number => Math.round(s * TICK_RATE);

/**
 * The muggings' tick (the first thing `runTownsfolk` does in a world phase): every mugging under way advances, then,
 * once a second, every figure and NPC seat in a mugging mood that is alone with a seat and off cooldown rolls.
 * Outside the world phases every mugging is dropped.
 */
export function runMuggings(room: PartyRoom): void {
  const mem = memoryOf(room);
  const tick = room.state.tick;
  if (!isWorldPhase(room.state.phase)) {
    for (const mg of [...mem.byTarget.values()]) end(room, mg, 'lost');
    return;
  }
  for (const mg of [...mem.byTarget.values()]) advance(room, mg);
  if (tick % TICK_RATE !== 0) return;
  const c = balance.moods.mug;
  const reach = c.reachTiles * TILE_PX;
  for (const m of muggers(room)) {
    if (mem.byMugger.has(m.id)) continue;
    const target = aloneTarget(room, m);
    if (target === null) {
      mem.alone.delete(m.id);
      continue;
    }
    // The long-alone clock runs whatever the mood, so a mood that turns finds it already running.
    let since = mem.alone.get(m.id);
    if (since?.target !== target) mem.alone.set(m.id, (since = { target, sinceTick: tick }));
    if (!MUG_MOODS.has(needsOf(m.brain).mood) || mem.byTarget.has(target)) continue;
    if ((mem.cooldownUntil.get(m.id) ?? 0) > tick || (mem.cooldownUntil.get(target) ?? 0) > tick) continue;
    const t = simOf(room).players.get(target);
    if (!t) continue;
    const dist = Math.hypot(t.x - m.x, t.y - m.y);
    // An NPC seat mugs only within reach: its walk-up waits on a react line in `npc/world.ts` (A180, open).
    if (m.figure === null && dist > reach) continue;
    const chance = mugChance(factorsOf(room, m, target, tick - since.sinceTick >= ticksOf(c.longAloneS)));
    if (chance <= 0) continue;
    const rng = m.figure ? figureRng(room, m.figure) : playRng(room, m.id);
    if (rng() >= chance) continue;
    start(room, m, target, dist <= reach);
  }
}

function start(room: PartyRoom, m: Mugger, target: string, inReach: boolean): void {
  const c = balance.moods.mug;
  const tick = room.state.tick;
  const mg: Mugging = {
    mugger: m.id,
    figure: m.figure,
    target,
    state: inReach ? 'threat' : 'approach',
    untilTick: tick + ticksOf(inReach ? c.threatS : c.approachS),
  };
  const mem = memoryOf(room);
  mem.byTarget.set(target, mg);
  mem.byMugger.set(m.id, mg);
  if (mg.state === 'threat') threaten(room, mg);
  emitSim(room, { tick, kind: 'mug.start', data: { mugger: m.id, target } });
}

/** Where the mugger stands, or null once it is gone (a dead figure, a dead or unplaced seat). */
function muggerAt(room: PartyRoom, mg: Mugging): { sceneIdx: number; x: number; y: number } | null {
  if (mg.figure) return mg.figure.dead ? null : mg.figure;
  const p = simOf(room).players.get(mg.mugger);
  return !p || p.dead || !p.placed ? null : p;
}

function advance(room: PartyRoom, mg: Mugging): void {
  const c = balance.moods.mug;
  const tick = room.state.tick;
  const t = simOf(room).players.get(mg.target);
  const at = muggerAt(room, mg);
  if (mg.figure) mg.figure.moving = false;
  if (!t || t.dead || !t.placed || at === null) return end(room, mg, 'lost');
  // A target through a door while its answer is due has run; the chase lands with Flee (A180).
  if (t.sceneIdx !== at.sceneIdx) return end(room, mg, mg.state === 'prompt' ? 'escaped' : 'lost');
  const reach = c.reachTiles * TILE_PX;
  switch (mg.state) {
    case 'approach': {
      if (!mg.figure) return end(room, mg, 'lost');
      const walked = walkFigure(room, mg.figure, t.x, t.y, reach);
      if (walked === 'arrived') {
        mg.state = 'threat';
        mg.untilTick = tick + ticksOf(c.threatS);
        threaten(room, mg);
      } else if (walked === 'stuck' || tick >= mg.untilTick) end(room, mg, 'lost');
      return;
    }
    case 'threat':
      hold(room, mg);
      if (tick >= mg.untilTick) prompt(room, mg);
      return;
    case 'prompt':
      hold(room, mg);
      // A silent target is taken for the share (the strike, once the fists land).
      if (tick >= mg.untilTick) take(room, mg, 'taken');
      return;
    default:
  }
}

/** The threat shows on a figure (`threaten`, `figures.ts`); an NPC seat's one-shot waits on 8A's presence slot. */
function threaten(room: PartyRoom, mg: Mugging): void {
  if (mg.figure) mg.figure.threatening = true;
  hold(room, mg);
}

/** The mugger stands still while it threatens and waits: a figure by its flag, an NPC seat by its brain's pause. */
function hold(room: PartyRoom, mg: Mugging): void {
  if (mg.figure) return;
  const brain = npcMemory(room).brains.get(mg.mugger);
  if (brain) brain.pauseUntilTick = room.state.tick + 2;
}

/** The threat is over: the target's choice is due; a human gets the prompt, an NPC seat pays (card-blind). */
function prompt(room: PartyRoom, mg: Mugging): void {
  mg.state = 'prompt';
  mg.untilTick = room.state.tick + ticksOf(balance.moods.mug.answerS);
  if (isNpcSeat(room, mg.target)) return take(room, mg, 'paid');
  const muggerId = mg.figure
    ? (mg.figure.handle ?? '')
    : (room.state.players.get(mg.mugger)?.priv.avatar ?? '');
  room.clients.getById(mg.target)?.send(S2C.mugPrompt, { muggerId, endsTick: mg.untilTick });
}

/** The share leaves the target's purse for the mugger's (the `rob` event), the scuffle is left, the mugging ends. */
function take(room: PartyRoom, mg: Mugging, outcome: MugOutcome): void {
  const tick = room.state.tick;
  const purse = balanceOf(room, mg.target);
  const share = purse <= 0 ? 0 : Math.max(1, Math.round(purse * balance.moods.mug.share));
  const to = mg.figure ? figureAccount(mg.mugger) : mg.mugger;
  const moved = share > 0 ? movePurse(room, mg.target, to, share, 'theft') : 0;
  if (moved > 0)
    emitSim(room, { tick, kind: 'rob', data: { by: mg.mugger, target: mg.target, amount: moved } });
  leaveScuffle(room, mg);
  end(room, mg, outcome);
}

/** The `scuffle` clue on the target's tile, showing the mugger's height and fading as clues.json `scuffle` says. */
function leaveScuffle(room: PartyRoom, mg: Mugging): void {
  const t = simOf(room).players.get(mg.target);
  if (!t) return;
  const def = clues.clues.scuffle;
  const value = mg.figure
    ? balance.townsfolk.height
    : (room.state.players.get(mg.mugger)?.traits.height ?? 0);
  spawnClue(room, sceneKey(t.sceneIdx), {
    kind: ClueKind.scuffle,
    value,
    dir: 0,
    decayS: def ? decaySeconds(def.decay) : null,
    tx: Math.floor(t.x / TILE_PX),
    ty: Math.floor(t.y / TILE_PX),
  });
}

function end(room: PartyRoom, mg: Mugging, outcome: MugOutcome): void {
  const mem = memoryOf(room);
  const tick = room.state.tick;
  mem.byTarget.delete(mg.target);
  mem.byMugger.delete(mg.mugger);
  if (mg.figure) mg.figure.threatening = false;
  const until = tick + ticksOf(balance.moods.mug.cooldownS);
  mem.cooldownUntil.set(mg.mugger, until);
  mem.cooldownUntil.set(mg.target, until);
  emitSim(room, { tick, kind: 'mug.end', data: { mugger: mg.mugger, target: mg.target, outcome } });
}

/**
 * `act.mug { choice }` from the target (the `Commands.ts` line, consumed in `step()`): only while its prompt
 * is open. `flee` and `fight` are refused until the fists land (A180 part two, body.md 4).
 */
export function handleMug(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): void {
  const mg = memoryOf(room).byTarget.get(sessionId);
  if (!mg || mg.state !== 'prompt') return reject(room, sessionId, ErrorCode.cannot, 'not now');
  const choice = payload.choice;
  if (choice !== 'pay' && choice !== 'flee' && choice !== 'fight') {
    return reject(room, sessionId, ErrorCode.cannot, 'bad choice');
  }
  if (choice !== 'pay') return reject(room, sessionId, ErrorCode.cannot, 'not yet');
  take(room, mg, 'paid');
}
