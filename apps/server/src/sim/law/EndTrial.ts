import { balance, laws, roles } from '@wdi/content';
import {
  EndTrialCase,
  EntryWeight,
  Phase,
  TICK_RATE,
  TribunalEntry,
  TribunalFinding,
  TribunalSentence,
  TribunalStep,
} from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { emitSim } from '../events/bus';
import { setPhase } from '../Flow';
import { isPaintTown } from '../paintTown';
import { simOf } from '../RoomSim';
import { isOnLine } from '../Train';
import { endMatch, evaluateWin } from '../Win';
import { reject } from '../World';
import { isJailed, untilDawnS } from './Jail';
import { attachable, backedEntry, publicAxis } from './Petition';
import { FINES, clueKey, findingOf, gather, hang, presentedWeight } from './Tribunal';

/**
 * The Final Night's end trial (round 10, B6d; GDD 3.8, `phases.md` 5; seams.md 3 row 35). It replaces the forced vote:
 * when the hunt ends, the town gathers (A30, as for the Tribunal), then every living seat at the gathering may file
 * one case for `finalNight.trialS` (`trial.file`; a second filing replaces the first), one accused and a charge with
 * up to `meeting.presentPerPlayer` of its own entries. Filings against one accused join into one case. The cases are
 * read strongest first (more matches, fewer exclusions, filed earliest), each on the Tribunal's row for
 * `phases.revealS` with B6a's verdict; a death sentence hangs the accused. The first murder conviction of a Killer ends
 * the trial for the Village (route 3); with none, the match ends at the close and the Killer is Unseen
 * (`Winner.cabal`, `gameOver.unseen`). In Paint The Town Red every case is read and the close decides (GDD 3.8).
 */

interface Filing {
  seat: string;
  accused: string;
  charge: string;
  seq: number;
  entries: {
    key: string;
    clueKind: number;
    value: number;
    sceneId: number;
    backed: boolean;
    weight: number;
  }[];
}

interface Case {
  accused: string;
  charge: string;
  seq: number;
  filers: number;
  keys: Set<string>;
  entries: {
    clueKind: number;
    value: number;
    sceneId: number;
    backed: boolean;
    presenter: string;
    weight: number;
  }[];
  matches: number;
  exclusions: number;
}

interface EndTrialMemory {
  active: boolean;
  filings: Map<string, Filing>;
  seq: number;
  cases: Case[];
  reading: number;
  convicted: boolean;
}

const memories = new WeakMap<PartyRoom, EndTrialMemory>();
function memoryOf(room: PartyRoom): EndTrialMemory {
  let m = memories.get(room);
  if (!m) memories.set(room, (m = fresh()));
  return m;
}
const fresh = (): EndTrialMemory => ({
  active: false,
  filings: new Map(),
  seq: 0,
  cases: [],
  reading: -1,
  convicted: false,
});

const GATHER_S = 3;
const S = (s: number): number => Math.round(s * TICK_RATE);
const isKiller = (room: PartyRoom, seat: string): boolean =>
  roles.roles[room.state.players.get(seat)?.priv.role.roleId ?? '']?.abilities.includes('kill') === true;

/** The hunt is over (`FinalNight.endHunt`): the gathering, then the filing. */
export function openEndTrial(room: PartyRoom): void {
  const m = fresh();
  m.active = true;
  memories.set(room, m);
  gather(room);
  setPhase(room, Phase.tribunal, 3600); // ended here, never by the phase clock
  const t = room.state.tribunal;
  clearRow(room);
  t.step = TribunalStep.gathering;
  t.untilTick = room.state.tick + S(GATHER_S);
  room.state.endTrial.cases.clear();
  emitSim(room, { tick: room.state.tick, kind: 'endTrial.open' });
}

function clearRow(room: PartyRoom): void {
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
}

/** The cases from the filings: one per accused, its cards joined in filing order, no clue twice. */
function rebuild(room: PartyRoom, m: EndTrialMemory): void {
  const byAccused = new Map<string, Case>();
  for (const f of [...m.filings.values()].sort((a, b) => a.seq - b.seq)) {
    let c = byAccused.get(f.accused);
    if (!c) {
      c = {
        accused: f.accused,
        charge: f.charge,
        seq: f.seq,
        filers: 0,
        keys: new Set(),
        entries: [],
        matches: 0,
        exclusions: 0,
      };
      byAccused.set(f.accused, c);
    }
    c.filers++;
    if (f.charge === 'murder') c.charge = 'murder'; // the first filer's charge, unless a later one charges murder
    for (const e of f.entries) {
      if (c.keys.has(e.key)) continue;
      c.keys.add(e.key);
      const { clueKind, value, sceneId, backed, weight } = e;
      c.entries.push({ clueKind, value, sceneId, backed, presenter: f.seat, weight });
      if (weight === EntryWeight.match) c.matches++;
      if (weight === EntryWeight.exclusion) c.exclusions++;
    }
  }
  m.cases = [...byAccused.values()];
  const rows = room.state.endTrial.cases;
  rows.clear();
  for (const c of m.cases) {
    const row = new EndTrialCase();
    row.accused = c.accused;
    row.charge = c.charge;
    row.filers = c.filers;
    row.matches = c.matches;
    row.exclusions = c.exclusions;
    for (const e of c.entries) row.entries.push(Object.assign(new TribunalEntry(), e));
    rows.push(row);
  }
}

/** `trial.file {accused, charge, entries}` (queued, consumed in `step()`): one case per seat, a refile replaces it. */
export function handleFile(room: PartyRoom, seat: string, payload: Record<string, unknown>): void {
  const m = memoryOf(room);
  if (!m.active || room.state.tribunal.step !== TribunalStep.filing)
    return reject(room, seat, 'PHASE_CLOSED');
  const p = simOf(room).players.get(seat);
  const player = room.state.players.get(seat);
  if (!p || !player || p.dead || isOnLine(room, seat)) return reject(room, seat, 'NOT_IN_PLAY');
  // A jailed seat files nothing: its filing would tie the figure in the cell to a seat (row 35).
  if (isJailed(room, seat)) return reject(room, seat, 'IN_JAIL', { untilDawn: untilDawnS(room, seat) });
  const accused = typeof payload.accused === 'string' ? payload.accused : '';
  const charge = typeof payload.charge === 'string' ? payload.charge : '';
  const ids = Array.isArray(payload.entries) ? payload.entries.filter((e) => typeof e === 'string') : [];
  const target = simOf(room).players.get(accused);
  if (accused === seat || !room.state.players.has(accused) || !target || target.dead)
    return reject(room, seat, 'NO_TARGET');
  if (!laws.crimes?.[charge] || ids.length > balance.meeting.presentPerPlayer)
    return reject(room, seat, 'BAD_REQUEST');
  const entries: Filing['entries'] = [];
  for (const id of new Set(ids)) {
    const e = player.priv.notebook.find((x) => x.id === id);
    if (!e || !attachable(e)) return reject(room, seat, 'BAD_REQUEST');
    entries.push({
      key: clueKey(e.clueKind, e.sceneId, e.value),
      clueKind: e.clueKind,
      value: publicAxis(e.clueKind) === undefined ? 0 : e.value,
      sceneId: e.sceneId,
      backed: backedEntry(e),
      weight: presentedWeight(room, seat, e, accused),
    });
  }
  m.filings.set(seat, { seat, accused, charge, seq: ++m.seq, entries });
  rebuild(room, m);
}

/** Reads case `i` onto the Tribunal's row as a verdict, and sentences the accused itself. */
function read(room: PartyRoom, m: EndTrialMemory, c: Case): void {
  const t = room.state.tribunal;
  t.accused = c.accused;
  t.charge = c.charge;
  t.entries.clear();
  for (const e of c.entries) t.entries.push(Object.assign(new TribunalEntry(), e));
  t.matches = c.matches;
  t.exclusions = c.exclusions;
  t.step = TribunalStep.verdict;
  t.untilTick = room.state.tick + S(balance.phases.revealS);
  t.finding = findingOf(room);
  if (t.finding === TribunalFinding.dismissed) t.sentence = TribunalSentence.release;
  else if (t.finding === TribunalFinding.murder) {
    t.sentence = TribunalSentence.death;
    if (isKiller(room, c.accused)) m.convicted = true;
    hang(room, c.accused);
  } else t.sentence = FINES[c.charge] ? TribunalSentence.fine : TribunalSentence.jail; // read out: the match ends
  emitSim(room, {
    tick: room.state.tick,
    kind: 'endTrial.verdict',
    seat: c.accused,
    data: { charge: c.charge, finding: t.finding, sentence: t.sentence },
  });
}

/** The close: a parity or a Paint The Town Red outcome first, then route 3 or the Killer's Unseen victory. */
function close(room: PartyRoom, m: EndTrialMemory): void {
  m.active = false;
  const winner = evaluateWin(room) ?? (m.convicted && !isPaintTown(room) ? 'village' : 'cabal');
  endMatch(room, winner, { unseen: winner === 'cabal' && !m.convicted && !isPaintTown(room) });
}

/** The end trial's tick (inside `runLaw`): the gathering, the filing, then one reading per case. */
export function runEndTrial(room: PartyRoom): void {
  const m = memoryOf(room);
  if (!m.active) return;
  const state = room.state;
  if (state.phase !== Phase.tribunal) {
    memories.set(room, fresh()); // the match ended under it, or the lobby
    return;
  }
  const t = state.tribunal;
  if (state.tick < t.untilTick) return;
  if (t.step === TribunalStep.gathering) {
    t.step = TribunalStep.filing;
    t.untilTick = state.tick + S(balance.finalNight.trialS);
    return;
  }
  if (t.step === TribunalStep.filing) {
    m.cases.sort((a, b) => b.matches - a.matches || a.exclusions - b.exclusions || a.seq - b.seq);
    m.reading = 0;
  } else {
    if (m.convicted && !isPaintTown(room)) return close(room, m); // the first murder conviction of the Killer
    m.reading++;
  }
  const next = m.cases[m.reading];
  if (next) return read(room, m, next);
  if (t.step === TribunalStep.filing) {
    // No case: "The Killer walks free", read for `phases.revealS`.
    clearRow(room);
    t.step = TribunalStep.verdict;
    t.untilTick = state.tick + S(balance.phases.revealS);
    return;
  }
  close(room, m);
}

/** White-box (tests): whether the end trial runs. */
export const endTrialOpen = (room: PartyRoom): boolean => memoryOf(room).active;
