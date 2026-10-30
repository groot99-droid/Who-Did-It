import { balance, economy } from '@wdi/content';
import { ManhuntState, Phase, type RefusalReason, TICK_RATE, TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { avatarMemory, avatarOf, resolveHandle } from '../Avatars';
import { emitSim, onSim } from '../events/bus';
import { isNpcSeat } from '../Npc';
import { type PlayerSim, simOf } from '../RoomSim';
import { isOnLine } from '../Train';
import { isVerbPhase, reject, sceneKey } from '../World';
import { isJailed, jailSeat, untilDawnS } from './Jail';
import { type Warrant, holdPetitions, warrantsOf } from './Petition';

/**
 * The manhunt (round 10, B4; GDD 3.31, `world-mode.md` 3.1; seams.md 3 row 14). A passed petition's warrant waits its
 * turn, one manhunt at a time, and hunts its accused for `manhunt.durationS`, public as `GameState.manhunt`. Any free
 * seat cuffs with `act.hold {action: 'cuff', targetId: <handle>}`, a hold of `law.cuffHoldS` next to a figure drawn as
 * the accused (`Avatar.lookOf`, never the seat behind it: `NOT_HUNTED` otherwise), stopped by moving, by the target
 * leaving reach, by the target striking or by the cuffer being struck. The cuff lands on the seat behind the figure
 * (`resolveHandle`), so an impersonator drawn as the accused is cuffed as the accused would be, and nothing public
 * says which seat is held. The Constables cuff by the same test within their leash (`Guards.ts`). The opener and the
 * signers see, in `Private.huntScene`, where the face was last seen by the rumour ledger's rule. At the timeout, with
 * no living human but the accused out of jail and off the line, the accused is cuffed where it stands; else the case
 * stays on the board and no petition opens for `petition.cooldownS`. The cuffed seat goes to the county jail (B5,
 * `Jail.ts`), in the face it was cuffed in; the hunt stays cuffed until the seat leaves jail or dies.
 */

interface Hunt {
  accused: string;
  charge: string;
  watchers: readonly string[];
  untilTick: number;
  warrant: Warrant;
}

/** A cuff the manhunt made: the seat held, for B5's cell and Tribunal. Room memory only. */
export interface Cuffed {
  seat: string;
  accused: string;
  charge: string;
  tick: number;
  /** The warrant hunted: B6a's Tribunal tries it. */
  warrant: Warrant;
}

interface ManhuntMemory {
  hunt: Hunt | null;
  /** The next warrant (`warrantsOf`) to hunt. */
  next: number;
  /** Set once a night passes while a seat is held: the next day releases it. */
  cuffed: Cuffed[];
  nextSampleTick: number;
  /** Seat -> the last tick it struck someone, and the last tick it was struck. */
  struck: Map<string, number>;
  strikes: Map<string, number>;
}

const memories = new WeakMap<PartyRoom, ManhuntMemory>();
function memoryOf(room: PartyRoom): ManhuntMemory {
  const memory = memories.get(room);
  if (memory) return memory;
  const m: ManhuntMemory = {
    hunt: null,
    next: 0,
    cuffed: [],
    nextSampleTick: 0,
    struck: new Map(),
    strikes: new Map(),
  };
  memories.set(room, m);
  onSim(room, 'body.hit', (e) => {
    const target = e.data?.target;
    const by = e.data?.by;
    if (typeof target === 'string') m.struck.set(target, e.tick);
    if (typeof by === 'string') m.strikes.set(by, e.tick);
  });
  return m;
}

/** The seats the manhunt has cuffed this match, oldest first (B5). */
export const cuffedOf = (room: PartyRoom): readonly Cuffed[] => memoryOf(room).cuffed;

const hunting = (room: PartyRoom): boolean => room.state.manhunt.state === ManhuntState.hunting;

/** The face a seat's avatar shows (`Avatar.lookOf`), or '' when it has none. */
function drawnAs(room: PartyRoom, seat: string): string {
  const handle = avatarMemory(room).handleOf.get(seat);
  return (handle === undefined ? undefined : avatarOf(room, handle)?.lookOf) ?? '';
}

/** The living, placed seats in `sceneIdx` drawn as the hunted accused: the Constables' quarry. */
export function quarryIn(room: PartyRoom, sceneIdx: number): string[] {
  if (!hunting(room)) return [];
  const accused = room.state.manhunt.accused;
  const out: string[] = [];
  for (const [id, p] of simOf(room).players)
    if (p.placed && !p.dead && p.sceneIdx === sceneIdx && drawnAs(room, id) === accused) out.push(id);
  return out;
}

const inReach = (a: PlayerSim, b: PlayerSim): boolean =>
  a.sceneIdx === b.sceneIdx && Math.hypot(a.x - b.x, a.y - b.y) <= balance.doors.reachTiles * TILE_PX;

/** Why `seat` cannot cuff the figure under `handle` now, or null; the seat behind it on success. */
function cuffProblem(
  room: PartyRoom,
  seat: string,
  handle: unknown,
): { reason: RefusalReason } | { target: string } {
  const p = simOf(room).players.get(seat);
  if (!isVerbPhase(room.state.phase)) return { reason: 'PHASE_CLOSED' };
  if (p && isJailed(room, seat)) return { reason: 'IN_JAIL' };
  if (!p || p.dead || !p.placed || isOnLine(room, seat)) return { reason: 'NOT_IN_PLAY' };
  if (room.state.tick < p.busyUntilTick) return { reason: 'BUSY' };
  const avatar =
    typeof handle === 'string' ? room.state.scenes.get(sceneKey(p.sceneIdx))?.avatars.get(handle) : undefined;
  if (!avatar) return { reason: 'NO_TARGET' };
  // The face, never the seat: a refusal that read the seat would tell an impersonator from the accused (row 14).
  if (!hunting(room) || avatar.lookOf !== room.state.manhunt.accused) return { reason: 'NOT_HUNTED' };
  const target = resolveHandle(room, seat, handle);
  const t = target === null ? undefined : simOf(room).players.get(target);
  if (target === null || !t || t.dead) return { reason: 'NO_TARGET' };
  if (!inReach(p, t)) return { reason: 'TOO_FAR' };
  return { target };
}

/** `act.hold {action: 'cuff', targetId, on: true}` (`Hold.ts`): the hold starts, or the refusal goes out. */
export function handleCuffHold(room: PartyRoom, seat: string, handle: unknown): void {
  const p = simOf(room).players.get(seat);
  if (!p) return;
  memoryOf(room);
  const r = cuffProblem(room, seat, handle);
  if ('reason' in r) {
    if (r.reason === 'TOO_FAR') return reject(room, seat, 'TOO_FAR', { of: 'person' });
    if (r.reason === 'IN_JAIL') return reject(room, seat, 'IN_JAIL', { untilDawn: untilDawnS(room, seat) });
    return reject(room, seat, r.reason);
  }
  if (p.hold?.action === 'cuff' && p.hold.targetId === handle) return;
  p.hold = { action: 'cuff', targetId: handle as string, startTick: room.state.tick };
}

/** The cuff hold's tick (`runHolds`): re-validated, stopped by a move or a strike, done at `law.cuffHoldS`. */
export function tickCuff(room: PartyRoom, seat: string, p: PlayerSim): void {
  const hold = p.hold;
  if (!hold) return;
  const m = memoryOf(room);
  const r = cuffProblem(room, seat, hold.targetId);
  const since = (map: Map<string, number>, id: string) => (map.get(id) ?? -1) >= hold.startTick;
  if ('reason' in r || p.vx !== 0 || p.vy !== 0 || since(m.struck, seat) || since(m.strikes, r.target)) {
    p.hold = null;
    return;
  }
  if (room.state.tick - hold.startTick < Math.round(balance.law.cuffHoldS * TICK_RATE)) return;
  p.hold = null;
  cuffSeat(room, r.target);
}

/** A cuff lands (a seat's hold, a Constable's, or the timeout): the seat goes to jail in its face; the hunt is over. */
export function cuffSeat(room: PartyRoom, seat: string): void {
  const m = memoryOf(room);
  const hunt = m.hunt;
  const p = simOf(room).players.get(seat);
  if (!hunt || !p || !hunting(room)) return;
  const tick = room.state.tick;
  m.cuffed.push({ seat, accused: hunt.accused, charge: hunt.charge, tick, warrant: hunt.warrant });
  jailSeat(room, seat, drawnAs(room, seat) || seat);
  room.state.manhunt.state = ManhuntState.cuffed;
  // Every hold on the hunt stops: the figure is held.
  for (const other of simOf(room).players.values()) if (other.hold?.action === 'cuff') other.hold = null;
  emitSim(room, { tick, kind: 'manhunt.cuffed', data: { accused: hunt.accused, charge: hunt.charge } });
  watch(room, hunt, '');
}

/** Writes `huntScene` for the hunt's watchers. */
function watch(room: PartyRoom, hunt: Hunt, scene: string): void {
  for (const id of hunt.watchers) {
    const priv = room.state.players.get(id)?.priv;
    if (priv && priv.huntScene !== scene) priv.huntScene = scene;
  }
}

function end(room: PartyRoom, m: ManhuntMemory): void {
  if (m.hunt) watch(room, m.hunt, '');
  m.hunt = null;
  const row = room.state.manhunt;
  row.state = ManhuntState.none;
  row.accused = '';
  row.untilTick = 0;
  for (const p of simOf(room).players.values()) if (p.hold?.action === 'cuff') p.hold = null;
}

/**
 * The rumour ledger's rule (`economy/rumours.ts`): every `notices.sampleS`, a figure drawn as the accused in a scene
 * that holds at least two drawn figures is seen there; two such scenes in one sample keep the lower index.
 */
function sample(room: PartyRoom, m: ManhuntMemory, hunt: Hunt): void {
  const tick = room.state.tick;
  if (tick < m.nextSampleTick) return;
  m.nextSampleTick = tick + Math.max(1, Math.round(economy.notices.sampleS * TICK_RATE));
  const scenes = new Set<number>();
  for (const p of simOf(room).players.values()) if (p.placed && !p.dead) scenes.add(p.sceneIdx);
  for (const idx of [...scenes].sort((a, b) => a - b)) {
    let figures = 0;
    let seen = false;
    room.state.scenes.get(sceneKey(idx))?.avatars.forEach((a) => {
      if (!room.state.players.has(a.lookOf)) return;
      figures++;
      if (a.lookOf === hunt.accused) seen = true;
    });
    if (figures >= 2 && seen) return watch(room, hunt, sceneKey(idx));
  }
}

/** No living human but the accused is out of jail and off the line (asleep or knocked out still counts as free). */
function noHunterLeft(room: PartyRoom, accused: string): boolean {
  for (const [id, p] of simOf(room).players) {
    if (id === accused || isNpcSeat(room, id) || p.dead || !p.placed) continue;
    if (!isOnLine(room, id) && !isJailed(room, id)) return false;
  }
  return true;
}

/** The manhunt's tick (inside `runLaw`, after the petitions): a warrant's turn, the sightings, the timeout, dawn. */
export function runManhunt(room: PartyRoom): void {
  const m = memoryOf(room);
  const row = room.state.manhunt;
  const tick = room.state.tick;
  if (room.state.phase === Phase.lobby) {
    if (m.hunt || row.state !== ManhuntState.none) end(room, m);
    m.next = 0;
    m.cuffed = [];
    m.nextSampleTick = 0;
    m.struck.clear();
    m.strikes.clear();
    return;
  }
  if (row.state === ManhuntState.cuffed) {
    // The hunt is over once the cuffed seat leaves jail (the morning train) or dies there.
    const held = m.cuffed.at(-1);
    if (!held || !isJailed(room, held.seat)) end(room, m);
    return;
  }
  if (!m.hunt) {
    const warrant = warrantsOf(room)[m.next];
    if (!warrant) return;
    m.next++;
    const until = tick + Math.round(balance.manhunt.durationS * TICK_RATE);
    m.hunt = {
      accused: warrant.accused,
      charge: warrant.charge,
      watchers: warrant.watchers,
      untilTick: until,
      warrant,
    };
    m.nextSampleTick = tick;
    row.accused = warrant.accused;
    row.untilTick = until;
    row.state = ManhuntState.hunting;
    emitSim(room, { tick, kind: 'manhunt.open', data: { accused: warrant.accused, charge: warrant.charge } });
  }
  const hunt = m.hunt;
  const accused = simOf(room).players.get(hunt.accused);
  if (!accused || accused.dead) return end(room, m);
  sample(room, m, hunt);
  if (tick < hunt.untilTick) return;
  if (noHunterLeft(room, hunt.accused)) return cuffSeat(room, hunt.accused);
  emitSim(room, { tick, kind: 'manhunt.lapsed', data: { accused: hunt.accused } });
  holdPetitions(room);
  end(room, m);
}

/** A seat on the running manhunt: its accused, its opener or a signer (Exhaustion spares them, F4 c8). */
export function onManhunt(room: PartyRoom, seat: string): boolean {
  const hunt = memoryOf(room).hunt;
  return !!hunt && hunting(room) && (hunt.accused === seat || hunt.watchers.includes(seat));
}

/** Passed warrants not yet hunted (B3c: the Constables file only when none waits). */
export const warrantsWaiting = (room: PartyRoom): number => warrantsOf(room).length - memoryOf(room).next;
