import { balance, clues as clueDefs, traits } from '@wdi/content';
import {
  ClueKind,
  EntryWeight,
  Phase,
  S2C,
  TICK_RATE,
  TribunalEntry,
  TribunalFinding,
  TribunalSentence,
  TribunalStep,
} from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { wakeAll } from '../body/damage';
import { markDead } from '../Death';
import { TOWN, movePurse } from '../economy/purse';
import { emitSim } from '../events/bus';
import { roleIdOf, setPhase } from '../Flow';
import { onMeetingOpenDisguise } from '../Impersonate';
import { placeAtSquare } from '../Meeting';
import { onMeetingOpenNight } from '../NightPowers';
import { simOf } from '../RoomSim';
import { isOnLine } from '../Train';
import { countsVote } from '../vendettas/conversion';
import { isWorldPhase, reject } from '../World';
import { inCell, isJailed, releaseToSquare, untilDawnS } from './Jail';
import { type Cuffed, cuffedOf } from './Manhunt';
import { type WarrantEntry, attachable, backedEntry, graceAccused, publicAxis } from './Petition';

/**
 * The Tribunal (round 10, B6a; GDD 3.8, `phases.md` 4, `world-mode.md` 5; seams.md 3 row 22). It opens when the seat
 * a cuff holds is placed in the cell, never during the Final Night: a phase of its own, the world paused under it,
 * the deaths so far revealed and the living gathered on the square as at a meeting. The held seat stays in the cell
 * (the dock), pinned in the face it was cuffed in; the accused is the warrant's seat throughout.
 *
 * The scales hold the warrant's entries and what the attendees present (`act.present`): a backed trait entry weighs
 * a match when it fits the accused's public traits and an exclusion when it does not. At the verdict any exclusion
 * dismisses; `trial.murderAt` matches prove murder and `trial.convictAt` any other charge. The sentence follows the
 * charge: death on the usual death path with the role shown, jail until the morning train, or a fine from the charge
 * alone (B6a), served in jail when the purse falls short. A dismissal or a paid fine releases the held seat onto the
 * square at the Return, then the world resumes where it paused.
 */

interface Scale {
  clueKind: number;
  value: number;
  sceneId: number;
  backed: boolean;
  presenter: string;
  weight: number;
}

interface Open {
  cuffed: Cuffed;
  /** The world phase the Tribunal paused and its remaining seconds. */
  resume: { phase: number; seconds: number };
  presented: Map<string, number>;
  /** The clues on the scales, `kind:scene:value`: none counts twice (row 22). */
  keys: Set<string>;
}

interface TribunalMemory {
  open: Open | null;
  tried: WeakSet<Cuffed>;
}

const memories = new WeakMap<PartyRoom, TribunalMemory>();
function memoryOf(room: PartyRoom): TribunalMemory {
  let m = memories.get(room);
  if (!m) memories.set(room, (m = { open: null, tried: new WeakSet() }));
  return m;
}

const S = (s: number): number => Math.round(s * TICK_RATE);
const KIND_KEY = new Map<number, string>(Object.entries(ClueKind).map(([k, v]) => [v, k]));
const clueKey = (kind: number, sceneId: number, value: number): string => `${kind}:${sceneId}:${value}`;

/** The trait axis any clue kind reveals, whoever may read it (`traits.json`). */
function traitAxis(kind: number): keyof typeof traits.axes | undefined {
  const key = KIND_KEY.get(kind) ?? '';
  return (Object.keys(traits.axes) as (keyof typeof traits.axes)[]).find((a) => traits.axes[a].clue === key);
}

/** How a backed reading of `axis` = `value` weighs against the accused's public traits. */
function weigh(room: PartyRoom, axis: keyof typeof traits.axes | undefined, value: number): number {
  const t = room.state.players.get(room.state.tribunal.accused)?.traits;
  if (axis === undefined || !t) return EntryWeight.none;
  return t[axis] === value ? EntryWeight.match : EntryWeight.exclusion;
}

/** A warrant entry weighs only by what row 13 shows: a reading the row leaves out weighs none. */
const warrantWeight = (room: PartyRoom, e: WarrantEntry): number =>
  e.backed ? weigh(room, publicAxis(e.clueKind), e.value) : EntryWeight.none;

/**
 * A presented entry: backed as the presenter's Notebook shows it, never Doubted testimony (GDD 3.20), and a role's
 * reading only when the presenter is its reader.
 */
function presentedWeight(
  room: PartyRoom,
  seat: string,
  e: { clueKind: number; value: number; status: number },
) {
  if (!backedEntry(e) || !countsVote(room, seat)) return EntryWeight.none;
  const reader = clueDefs.clues[KIND_KEY.get(e.clueKind) ?? '']?.reader;
  if (reader !== 'anyone' && reader !== roleIdOf(room.state.players.get(seat)!)) return EntryWeight.none;
  return weigh(room, traitAxis(e.clueKind), e.value);
}

function push(room: PartyRoom, e: Scale): void {
  const row = new TribunalEntry();
  Object.assign(row, e);
  const t = room.state.tribunal;
  t.entries.push(row);
  if (e.weight === EntryWeight.match) t.matches++;
  if (e.weight === EntryWeight.exclusion) t.exclusions++;
}

function openTribunal(room: PartyRoom, m: TribunalMemory, cuffed: Cuffed): void {
  const state = room.state;
  const sim = simOf(room);
  m.tried.add(cuffed);
  m.open = {
    cuffed,
    resume: { phase: state.phase, seconds: Math.max(0, state.phaseEndsTick - state.tick) / TICK_RATE },
    presented: new Map(),
    keys: new Set(),
  };
  // As a meeting opens (A30, locked order): Nightshade first, then the deaths so far, the disguises, the knocked out.
  onMeetingOpenNight(room);
  state.players.forEach((player, id) => {
    if (sim.players.get(id)?.dead) player.alive = false;
  });
  onMeetingOpenDisguise(room); // the held seat's pinned face stays (row 19)
  wakeAll(room);
  placeAtSquare(room, false); // the jailed (the dock included) and the line stay where they are
  const t = state.tribunal;
  t.accused = cuffed.warrant.accused;
  t.charge = cuffed.warrant.charge;
  t.entries.clear();
  t.matches = 0;
  t.exclusions = 0;
  t.finding = TribunalFinding.none;
  t.sentence = TribunalSentence.none;
  for (const e of cuffed.warrant.entries) {
    m.open.keys.add(clueKey(e.clueKind, e.sceneId, e.raw));
    const { clueKind, value, sceneId, backed } = e;
    push(room, { clueKind, value, sceneId, backed, presenter: '', weight: warrantWeight(room, e) });
  }
  const p = balance.phases;
  const tr = balance.trial;
  setPhase(room, Phase.tribunal, tr.chargeS + tr.caseS + tr.defenceS + p.revealS + p.immunityS + 5);
  toStep(room, TribunalStep.charge, tr.chargeS);
  emitSim(room, { tick: state.tick, kind: 'tribunal.open', seat: t.accused, data: { charge: t.charge } });
}

function toStep(room: PartyRoom, step: number, seconds: number): void {
  room.state.tribunal.step = step;
  room.state.tribunal.untilTick = room.state.tick + S(seconds);
}

/** The finding: any exclusion dismisses; murder at `murderAt`, any other charge at `convictAt`. */
function findingOf(room: PartyRoom): number {
  const t = room.state.tribunal;
  if (t.exclusions > 0) return TribunalFinding.dismissed;
  if (t.charge === 'murder')
    return t.matches >= balance.trial.murderAt ? TribunalFinding.murder : TribunalFinding.dismissed;
  return t.matches >= balance.trial.convictAt ? TribunalFinding.proven : TribunalFinding.dismissed;
}

const FINES: Record<string, () => number> = {
  theft: () => balance.trial.theftFine,
  trespass: () => balance.trial.trespassFine,
  rumour: () => balance.trial.rumourFine,
};

/** The verdict: the finding, then the sentence the charge sets, on the seat held. */
function verdict(room: PartyRoom, open: Open): void {
  const t = room.state.tribunal;
  const seat = open.cuffed.seat;
  t.finding = findingOf(room);
  if (t.finding === TribunalFinding.dismissed) {
    t.sentence = TribunalSentence.release;
    graceAccused(room, t.accused);
  } else if (t.finding === TribunalFinding.murder) {
    t.sentence = TribunalSentence.death;
    const player = room.state.players.get(seat);
    markDead(room, seat, 'ejected'); // dies for good: the death path, never the line
    if (player) {
      player.alive = false;
      room.broadcast(S2C.tribunalVerdict, { roleId: roleIdOf(player) });
    }
  } else {
    const fine = FINES[t.charge]?.();
    if (fine === undefined) t.sentence = TribunalSentence.jail;
    else
      t.sentence =
        movePurse(room, seat, TOWN, fine, 'fine') < fine ? TribunalSentence.fineJail : TribunalSentence.fine;
  }
  emitSim(room, {
    tick: room.state.tick,
    kind: 'tribunal.verdict',
    seat,
    data: { accused: t.accused, charge: t.charge, finding: t.finding, sentence: t.sentence },
  });
}

/** Back to the world: the cleared row, and the paused phase with the seconds it had left. */
function close(room: PartyRoom, m: TribunalMemory): void {
  const open = m.open;
  m.open = null;
  const t = room.state.tribunal;
  t.accused = '';
  t.charge = '';
  t.step = TribunalStep.none;
  t.untilTick = 0;
  t.entries.clear();
  t.matches = 0;
  t.exclusions = 0;
  t.finding = TribunalFinding.none;
  t.sentence = TribunalSentence.none;
  if (open && room.state.phase === Phase.tribunal) setPhase(room, open.resume.phase, open.resume.seconds);
}

/** The Tribunal's tick (inside `runLaw`, after the jail): an open on a placed cuff, the steps, the verdict, the end. */
export function runTribunal(room: PartyRoom): void {
  const m = memoryOf(room);
  const state = room.state;
  if (state.phase === Phase.lobby) {
    if (m.open) close(room, m);
    return;
  }
  const open = m.open;
  if (!open) {
    if (!isWorldPhase(state.phase) || state.phase === Phase.finalNight) return;
    const due = cuffedOf(room).find((c) => !m.tried.has(c) && isJailed(room, c.seat) && inCell(room, c.seat));
    if (due) openTribunal(room, m, due);
    return;
  }
  if (state.phase !== Phase.tribunal) return close(room, m); // the match ended under it
  const t = state.tribunal;
  if (state.tick < t.untilTick) return;
  const tr = balance.trial;
  if (t.step === TribunalStep.charge) toStep(room, TribunalStep.case, tr.caseS);
  else if (t.step === TribunalStep.case) toStep(room, TribunalStep.defence, tr.defenceS);
  else if (t.step === TribunalStep.defence) {
    toStep(room, TribunalStep.verdict, balance.phases.revealS);
    verdict(room, open);
  } else if (t.step === TribunalStep.verdict) {
    toStep(room, TribunalStep.return, balance.phases.immunityS);
    if (t.sentence === TribunalSentence.release || t.sentence === TribunalSentence.fine)
      releaseToSquare(room, open.cuffed.seat); // still pinned, then unpinned (row 19)
    placeAtSquare(room, true); // the announced placement: the client's cue to leave the screen (A30)
  } else close(room, m);
}

/** `act.present {entryId}` (queued, consumed in `step()`): one of the seat's own clue entries onto the scales. */
export function handlePresent(room: PartyRoom, seat: string, payload: Record<string, unknown>): void {
  const open = memoryOf(room).open;
  const t = room.state.tribunal;
  if (!open || (t.step !== TribunalStep.case && t.step !== TribunalStep.defence))
    return reject(room, seat, 'PHASE_CLOSED');
  const p = simOf(room).players.get(seat);
  const player = room.state.players.get(seat);
  if (!p || !player || p.dead || isOnLine(room, seat)) return reject(room, seat, 'NOT_IN_PLAY');
  // A held seat that is not the accused presents nothing, so no presenter names it (row 22).
  if (seat !== t.accused && isJailed(room, seat))
    return reject(room, seat, 'IN_JAIL', { untilDawn: untilDawnS(room, seat) });
  if ((open.presented.get(seat) ?? 0) >= balance.meeting.presentPerPlayer) return reject(room, seat, 'SPENT');
  const id = typeof payload.entryId === 'string' ? payload.entryId : '';
  const e = player.priv.notebook.find((x) => x.id === id);
  if (!e || !attachable(e)) return reject(room, seat, 'BAD_REQUEST');
  const key = clueKey(e.clueKind, e.sceneId, e.value);
  if (open.keys.has(key)) return reject(room, seat, 'ALREADY_DONE');
  const weight = presentedWeight(room, seat, e);
  if (t.step === TribunalStep.defence && seat !== t.accused && weight !== EntryWeight.exclusion)
    return reject(room, seat, 'PHASE_CLOSED');
  open.keys.add(key);
  open.presented.set(seat, (open.presented.get(seat) ?? 0) + 1);
  push(room, {
    clueKind: e.clueKind,
    value: publicAxis(e.clueKind) === undefined ? 0 : e.value,
    sceneId: e.sceneId,
    backed: backedEntry(e),
    presenter: seat,
    weight,
  });
}

/** White-box (tests): whether a Tribunal is open. */
export const tribunalOpen = (room: PartyRoom): boolean => memoryOf(room).open !== null;
