import { balance, clues as clueDefs, laws, scenes, traits } from '@wdi/content';
import { ClueKind, NotebookStatus, Phase, PetitionEntry, TICK_RATE } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { nearProp } from '../economy/reach';
import { emitSim } from '../events/bus';
import { isNpcSeat } from '../Npc';
import { simOf } from '../RoomSim';
import { figuresOf } from '../townsfolk/figures';
import { isOnLine } from '../Train';
import { isVerbPhase, reject } from '../World';

/**
 * Petitions (round 10, B3a; GDD 3.31, `world-mode.md` 3.1 and 5, `followup-4.md` 2.1; seams.md 3 row 13). A living,
 * free human opens one at a notice board against a roster seat, with a charge and up to `petition.maxEntries` of its
 * own clue entries. One is open in the whole town at a time. It needs ceil(`petition.othersPct` x the living, free
 * humans, the accused left out) other signatures within `petition.openS`; then it passes (a warrant for B4's
 * manhunt), else it lapses and the accused and the opener wait `petition.cooldownS`. At `petition.constableAtHumans`
 * humans or fewer a Constable signs once, as one signature, when the public entries hold `petition.constableMatches`
 * backed matches against the accused's public traits. The public row names the accused, the charge, the counts and
 * the entries as anyone may read them; never the opener or a signer. NPC seats do not sign (6Z: deferred), so a
 * petition never waits on an NPC.
 */

interface Open {
  id: string;
  accused: string;
  charge: string;
  opener: string;
  signers: Set<string>;
  constable: boolean;
  untilTick: number;
}

/** A passed petition: B4's manhunt reads it. */
export interface Warrant {
  accused: string;
  charge: string;
  tick: number;
}

interface PetitionMemory {
  open: Open | null;
  /** Seat id -> the tick its grace as an accused ends (after a lapse against it). */
  accusedGrace: Map<string, number>;
  /** Seat id -> the tick it may open again (after its own petition lapsed). */
  openerGrace: Map<string, number>;
  warrants: Warrant[];
  seq: number;
}

const memories = new WeakMap<PartyRoom, PetitionMemory>();
function memoryOf(room: PartyRoom): PetitionMemory {
  let m = memories.get(room);
  if (!m)
    memories.set(
      room,
      (m = { open: null, accusedGrace: new Map(), openerGrace: new Map(), warrants: [], seq: 0 }),
    );
  return m;
}

/** The passed petitions of the match, oldest first (B4's manhunt). */
export const warrantsOf = (room: PartyRoom): readonly Warrant[] => memoryOf(room).warrants;

/** Every notice board of every scene: the police boards a petition opens at. */
const BOARDS: readonly string[] = Object.values(scenes).flatMap((s) =>
  s.props.filter((p) => p.kind === 'noticeBoard').map((p) => p.id),
);

/** B5 wires the county jail; until then nobody is jailed. */
const jailed = (_room: PartyRoom, _seat: string): boolean => false;

/** A living, free human: placed, alive, not on the line (C1), not jailed (B5). */
function freeHuman(room: PartyRoom, seat: string): boolean {
  if (isNpcSeat(room, seat)) return false;
  const p = simOf(room).players.get(seat);
  return !!p && !p.dead && p.placed && !isOnLine(room, seat) && !jailed(room, seat);
}

/** The other signatures needed: ceil(othersPct x the living, free humans), the accused left out. */
function neededOf(room: PartyRoom, accused: string): number {
  let humans = 0;
  for (const id of room.state.players.keys()) if (id !== accused && freeHuman(room, id)) humans++;
  return Math.ceil(balance.petition.othersPct * humans);
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
  const grace = Math.max(m.accusedGrace.get(accused) ?? 0, m.openerGrace.get(seat) ?? 0);
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
    const needed = neededOf(room, open.accused);
    const signed = [...open.signers].filter((s) => freeHuman(room, s)).length + (open.constable ? 1 : 0);
    if (row.needed !== needed) row.needed = needed;
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
    m.seq = 0;
    return;
  }
  const open = m.open;
  if (!open) return;
  if (!simOf(room).players.get(open.accused) || simOf(room).players.get(open.accused)!.dead)
    return close(room, m);
  if (!open.constable) {
    let humans = 0;
    for (const id of room.state.players.keys()) if (freeHuman(room, id)) humans++;
    if (humans <= balance.petition.constableAtHumans && constableSigns(room, open.accused))
      open.constable = true;
  }
  write(room, m);
  const row = room.state.petition;
  if (row.signed >= row.needed) {
    m.warrants.push({ accused: open.accused, charge: open.charge, tick });
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
