import { balance, clues as clueDefs, laws, scenes, traits } from '@wdi/content';
import { ClueKind, ManhuntState, NotebookStatus, Phase, PetitionEntry, TICK_RATE } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { nearProp } from '../economy/reach';
import { emitSim } from '../events/bus';
import { isNpcSeat } from '../Npc';
import { simOf } from '../RoomSim';
import { figuresOf } from '../townsfolk/figures';
import { isPaintTown } from '../paintTown';
import { isOnLine } from '../Train';
import { isVerbPhase, reject, sceneIndex } from '../World';
import { briefingsOf } from './Briefing';
import { isJailed, untilDawnS } from './Jail';
import { warrantsWaiting } from './Manhunt';

/**
 * Petitions (round 10, B3a; GDD 3.31, `world-mode.md` 3.1 and 5, `followup-4.md` 2.1; seams.md 3 row 13). A living,
 * free human opens one at a notice board against a roster seat, with a charge and up to `petition.maxEntries` of its
 * own clue entries. One is open in the whole town at a time. It needs ceil(`petition.othersPct` x the living, free
 * humans, the opener and the accused counted, fixed at open) other signatures within `petition.openS`; then it passes (a warrant for B4's
 * manhunt), else it lapses and the accused and the opener wait `petition.cooldownS`. At `petition.constableAtHumans`
 * humans or fewer a Constable signs once, as one signature, when the public entries hold `petition.constableMatches`
 * backed matches against the accused's public traits. The public row names the accused, the charge, the counts and
 * the entries as anyone may read them; never the opener or a signer. NPC seats do not sign (6Z: deferred), so a
 * petition never waits on an NPC.
 *
 * B3c (world-mode 1.6 and 12 R3; A329): in Paint The Town Red, where no human is on the town side, the Constables file
 * their own petition on their posted briefings when exactly one roster figure's public traits fit them.
 */

interface Open {
  id: string;
  accused: string;
  charge: string;
  opener: string;
  signers: Set<string>;
  constable: boolean;
  /** Fixed at open: a bar that moved at a death would say the dead seat was human (6Z). */
  needed: number;
  /** Fixed at open, like the bar: a gate that opened mid-petition would say the seat that fell was human (6Z). */
  constableMay: boolean;
  untilTick: number;
}

/** A passed petition: B4's manhunt reads it. */
export interface Warrant {
  accused: string;
  charge: string;
  tick: number;
  /** The opener and the signers: room memory only, the manhunt's `huntScene` goes to them (B4, row 14). */
  watchers: readonly string[];
}

interface PetitionMemory {
  open: Open | null;
  /** Seat id -> the tick its grace as an accused ends (after a lapse against it). */
  accusedGrace: Map<string, number>;
  /** Seat id -> the tick it may open again (after its own petition lapsed). */
  openerGrace: Map<string, number>;
  warrants: Warrant[];
  /** The tick the Constables may next file their own petition (B3c). */
  fileAfter: number;
  /** No petition opens before this tick: a manhunt ran out, and the case stays on the board (B4). */
  heldUntil: number;
  seq: number;
}

const memories = new WeakMap<PartyRoom, PetitionMemory>();
function memoryOf(room: PartyRoom): PetitionMemory {
  let m = memories.get(room);
  if (!m)
    memories.set(
      room,
      (m = {
        open: null,
        accusedGrace: new Map(),
        openerGrace: new Map(),
        warrants: [],
        fileAfter: 0,
        heldUntil: 0,
        seq: 0,
      }),
    );
  return m;
}

/** The passed petitions of the match, oldest first (B4's manhunt). */
export const warrantsOf = (room: PartyRoom): readonly Warrant[] => memoryOf(room).warrants;

/** A manhunt ran out (B4): no new petition opens for `petition.cooldownS`. */
export function holdPetitions(room: PartyRoom): void {
  memoryOf(room).heldUntil = room.state.tick + Math.round(balance.petition.cooldownS * TICK_RATE);
}

/** Every notice board of every scene: the police boards a petition opens at. */
const BOARDS: readonly string[] = Object.values(scenes).flatMap((s) =>
  s.props.filter((p) => p.kind === 'noticeBoard').map((p) => p.id),
);

/** A living, free human: placed, alive, not on the line (C1), not jailed (B5). */
function freeHuman(room: PartyRoom, seat: string): boolean {
  if (isNpcSeat(room, seat)) return false;
  const p = simOf(room).players.get(seat);
  return !!p && !p.dead && p.placed && !isOnLine(room, seat) && !isJailed(room, seat);
}

/** The living, free humans, every seat counted: the bar never tells whether the accused is a person (R6). */
function freeHumans(room: PartyRoom): number {
  let humans = 0;
  for (const id of room.state.players.keys()) if (freeHuman(room, id)) humans++;
  return humans;
}

const KIND_KEY = new Map<number, string>(Object.entries(ClueKind).map(([k, v]) => [v, k]));
/** The trait axis a clue kind shows to anyone (GDD 3.4 Reader "anyone"), or undefined. */
function publicAxis(kind: number): keyof typeof traits.axes | undefined {
  const key = KIND_KEY.get(kind) ?? '';
  if (clueDefs.clues[key]?.reader !== 'anyone') return undefined;
  return (Object.keys(traits.axes) as (keyof typeof traits.axes)[]).find((a) => traits.axes[a].clue === key);
}

/** Whether the public row's entries hold `constableMatches` backed matches against the accused's public traits. */
function constableSigns(room: PartyRoom, accused: string): boolean {
  const t = room.state.players.get(accused)?.traits;
  if (!t) return false;
  let matches = 0;
  room.state.petition.entries.forEach((e) => {
    const axis = publicAxis(e.clueKind);
    if (e.backed && axis !== undefined && t[axis] === e.value) matches++;
  });
  const constable = [...figuresOf(room).values()].some((f) => f.kind === 'constable' && !f.dead);
  return constable && matches >= balance.petition.constableMatches;
}

const readyInS = (until: number, tick: number): number => Math.max(1, Math.ceil((until - tick) / TICK_RATE));

/** `petition.open {accused, charge, entries}` (queued, consumed in `step()`). */
export function handlePetitionOpen(room: PartyRoom, seat: string, payload: Record<string, unknown>): void {
  const m = memoryOf(room);
  const tick = room.state.tick;
  if (!isVerbPhase(room.state.phase)) return reject(room, seat, 'PHASE_CLOSED');
  if (isJailed(room, seat)) return reject(room, seat, 'IN_JAIL', { untilDawn: untilDawnS(room, seat) });
  if (!freeHuman(room, seat)) return reject(room, seat, 'NOT_IN_PLAY');
  const accused = typeof payload.accused === 'string' ? payload.accused : '';
  const charge = typeof payload.charge === 'string' ? payload.charge : '';
  const ids = Array.isArray(payload.entries) ? payload.entries.filter((e) => typeof e === 'string') : [];
  const target = simOf(room).players.get(accused);
  if (accused === seat || !room.state.players.has(accused) || !target || target.dead)
    return reject(room, seat, 'NO_TARGET');
  if (!laws.crimes?.[charge] || ids.length > balance.petition.maxEntries)
    return reject(room, seat, 'BAD_REQUEST');
  if (m.open) return reject(room, seat, 'PETITION_OPEN');
  const grace = Math.max(m.accusedGrace.get(accused) ?? 0, m.openerGrace.get(seat) ?? 0, m.heldUntil);
  if (tick < grace) return reject(room, seat, 'PETITION_GRACE', { readyInS: readyInS(grace, tick) });
  if (!nearProp(room, seat, BOARDS)) return reject(room, seat, 'TOO_FAR');
  // Only the opener's own clue entries attach: never a night-power entry, a Forged or a teaching one (6Z, row 13).
  const notebook = room.state.players.get(seat)!.priv.notebook;
  const entries: InstanceType<typeof PetitionEntry>[] = [];
  for (const id of new Set(ids)) {
    const e = notebook.find((x) => x.id === id);
    if (!e || e.note !== 0 || e.status === NotebookStatus.forged || e.status === NotebookStatus.teaching)
      return reject(room, seat, 'BAD_REQUEST');
    const row = new PetitionEntry();
    row.clueKind = e.clueKind;
    row.value = publicAxis(e.clueKind) === undefined ? 0 : e.value;
    row.sceneId = e.sceneId;
    row.backed = e.status === NotebookStatus.verified || e.status === NotebookStatus.corroborated;
    entries.push(row);
  }
  const id = `petition_${++m.seq}`;
  m.open = {
    id,
    accused,
    charge,
    opener: seat,
    signers: new Set(),
    constable: false,
    needed: Math.ceil(balance.petition.othersPct * freeHumans(room)),
    constableMay: freeHumans(room) <= balance.petition.constableAtHumans,
    untilTick: tick + Math.round(balance.petition.openS * TICK_RATE),
  };
  const row = room.state.petition;
  row.id = id;
  row.accused = accused;
  row.charge = charge;
  row.untilTick = m.open.untilTick;
  row.entries.clear();
  for (const e of entries) row.entries.push(e);
  emitSim(room, { tick, kind: 'petition.open', data: { id, accused, charge } });
  write(room, m);
}

/** `petition.sign {id}`: a living, free human other than the opener and the accused, once. */
export function handlePetitionSign(room: PartyRoom, seat: string, payload: Record<string, unknown>): void {
  const open = memoryOf(room).open;
  if (!open || payload.id !== open.id) return reject(room, seat, 'NOTHING_THERE');
  if (isJailed(room, seat)) return reject(room, seat, 'IN_JAIL', { untilDawn: untilDawnS(room, seat) });
  if (!freeHuman(room, seat)) return reject(room, seat, 'NOT_IN_PLAY');
  if (seat === open.opener || seat === open.accused || open.signers.has(seat))
    return reject(room, seat, 'BUSY');
  open.signers.add(seat);
  write(room, memoryOf(room));
}

/** Clears the public row and every seat's own mark. */
function close(room: PartyRoom, m: PetitionMemory): void {
  m.open = null;
  const row = room.state.petition;
  if (row.id !== '') {
    row.id = '';
    row.accused = '';
    row.charge = '';
    row.needed = 0;
    row.signed = 0;
    row.untilTick = 0;
    row.entries.clear();
  }
  write(room, m);
}

/** The public counts and each seat's `petitionSigned`. */
function write(room: PartyRoom, m: PetitionMemory): void {
  const open = m.open;
  if (open) {
    const row = room.state.petition;
    // A signature stands once given: a count that fell at a death would name the signer (row 13).
    const signed = open.signers.size + (open.constable ? 1 : 0);
    if (row.needed !== open.needed) row.needed = open.needed;
    if (row.signed !== signed) row.signed = signed;
  }
  for (const [id, player] of room.state.players) {
    const mine = open?.signers.has(id) === true;
    if (player.priv && player.priv.petitionSigned !== mine) player.priv.petitionSigned = mine;
  }
}

/** The petitions' tick (inside `runLaw`): the Constable's signature, a pass, a lapse; the lobby clears all. */
export function runPetition(room: PartyRoom): void {
  const m = memoryOf(room);
  const tick = room.state.tick;
  if (room.state.phase === Phase.lobby) {
    if (m.open) close(room, m);
    m.accusedGrace.clear();
    m.openerGrace.clear();
    m.warrants = [];
    m.fileAfter = 0;
    m.heldUntil = 0;
    m.seq = 0;
    return;
  }
  const open = m.open;
  if (!open) {
    if (isPaintTown(room)) fileByConstables(room); // Paint The Town Red: no human on the town side
    return;
  }
  if (!simOf(room).players.get(open.accused) || simOf(room).players.get(open.accused)!.dead)
    return close(room, m);
  if (!open.constable) {
    if (open.constableMay && constableSigns(room, open.accused)) open.constable = true;
  }
  write(room, m);
  const row = room.state.petition;
  if (row.signed >= row.needed) {
    m.warrants.push({
      accused: open.accused,
      charge: open.charge,
      tick,
      watchers: [open.opener, ...open.signers].filter((s) => s !== ''),
    });
    emitSim(room, {
      tick,
      kind: 'petition.passed',
      data: { id: open.id, accused: open.accused, charge: open.charge },
    });
    return close(room, m);
  }
  if (tick < open.untilTick) return;
  const until = tick + Math.round(balance.petition.cooldownS * TICK_RATE);
  m.accusedGrace.set(open.accused, until);
  m.openerGrace.set(open.opener, until);
  emitSim(room, { tick, kind: 'petition.lapsed', data: { id: open.id, accused: open.accused } });
  close(room, m);
}

type Entry = InstanceType<typeof PetitionEntry>;

const livingConstable = (room: PartyRoom): boolean =>
  [...figuresOf(room).values()].some((f) => f.kind === 'constable' && !f.dead);

/**
 * The seat the Constables' briefings fit (B3c), or null: within `law.fileWindowS`, the trait axes their posted
 * briefings named; a living roster seat whose public traits match at least `petition.constableMatches` distinct axes
 * is a candidate, and only a single candidate is named (none or a tie files nothing). It reads the posted briefings
 * and the public traits only, never a card, a cover or a private view. Exported for the tests.
 */
export function constableCandidate(room: PartyRoom): { seat: string; entries: Entry[] } | null {
  const m = memoryOf(room);
  const tick = room.state.tick;
  const since = tick - Math.round(balance.law.fileWindowS * TICK_RATE);
  const briefed = briefingsOf(room).filter((b) => b.tick >= since && b.axis !== undefined);
  const fits: { seat: string; entries: Entry[] }[] = [];
  for (const [id, player] of room.state.players) {
    const p = simOf(room).players.get(id);
    if (!p || p.dead || !p.placed || tick < (m.accusedGrace.get(id) ?? 0)) continue;
    const byAxis = new Map<string, Entry>();
    for (const b of [...briefed].reverse()) {
      if (byAxis.has(b.axis!) || player.traits[b.axis!] !== b.value) continue;
      const e = new PetitionEntry();
      e.clueKind = b.kind;
      e.value = b.value!;
      e.sceneId = sceneIndex(b.sceneId);
      e.backed = true;
      byAxis.set(b.axis!, e);
    }
    if (byAxis.size >= balance.petition.constableMatches)
      fits.push({ seat: id, entries: [...byAxis.values()] });
  }
  return fits.length === 1 ? fits[0]! : null;
}

/** The Constables file their own petition (B3c): no opener, `needed` 0, so it passes into a warrant next tick. */
export function fileByConstables(room: PartyRoom): void {
  const m = memoryOf(room);
  const tick = room.state.tick;
  if (m.open || tick < m.fileAfter || tick < m.heldUntil || !livingConstable(room)) return;
  if (room.state.manhunt.state !== ManhuntState.none || warrantsWaiting(room) > 0) return;
  const fit = constableCandidate(room);
  if (!fit) return;
  m.fileAfter = tick + Math.round(balance.petition.cooldownS * TICK_RATE);
  const id = `petition_${++m.seq}`;
  m.open = {
    id,
    accused: fit.seat,
    charge: 'murder',
    opener: '',
    signers: new Set(),
    constable: false,
    needed: 0,
    constableMay: false,
    untilTick: tick + Math.round(balance.petition.openS * TICK_RATE),
  };
  const row = room.state.petition;
  row.id = id;
  row.accused = fit.seat;
  row.charge = 'murder';
  row.untilTick = m.open.untilTick;
  row.entries.clear();
  for (const e of fit.entries.slice(0, balance.petition.maxEntries)) row.entries.push(e);
  emitSim(room, {
    tick,
    kind: 'petition.open',
    data: { id, accused: fit.seat, charge: 'murder', by: 'constables' },
  });
  write(room, m);
}
