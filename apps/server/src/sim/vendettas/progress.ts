import type { PartyRoom } from '../../rooms/PartyRoom';
import { emitSim } from '../events/bus';
import { simOf } from '../RoomSim';
import { isLoft } from '../World';
import { vendettaOf } from './state';

/**
 * Each holder's progress toward its vendetta (GDD 3.20), in room memory keyed by the match's `MatchSeeds` like the
 * holding itself, and the match's record of every step sent, by holder, which the invariants read (the bus events
 * name no seat). Session 7H.
 */

export interface Progress {
  /** Conversion: ticks shared with the Vicar's seat; the meeting index whose tally the doubt silences. */
  sharedTicks: number;
  sown: boolean;
  doubtMeeting: number | null;
  doubtNoted: boolean;
  /** Sabotage: the target being held, since how many still ticks, and the targets tampered with. */
  holding: { prop: string; ticks: number } | null;
  tampered: string[];
  /** The position the holder stood at last tick (the stillness of a hold). */
  last: { scene: number; x: number; y: number } | null;
  /** Set when the vendetta fired or lapsed: nothing more happens for it. */
  over: boolean;
}

export interface Step {
  tick: number;
  seat: string;
  vendettaId: string;
  kind: string;
}

interface Match {
  progress: Map<string, Progress>;
  steps: Step[];
}

const matches = new WeakMap<object, Match>();

function matchOf(room: PartyRoom): Match {
  let m = matches.get(room.seeds);
  if (!m) matches.set(room.seeds, (m = { progress: new Map(), steps: [] }));
  return m;
}

export function progressOf(room: PartyRoom, seat: string): Progress {
  const m = matchOf(room);
  let p = m.progress.get(seat);
  if (!p) {
    p = {
      sharedTicks: 0,
      sown: false,
      doubtMeeting: null,
      doubtNoted: false,
      holding: null,
      tampered: [],
      last: null,
      over: false,
    };
    m.progress.set(seat, p);
  }
  return p;
}

/** Every vendetta step of the match, oldest first, with the holder it was for. */
export function vendettaSteps(room: PartyRoom): readonly Step[] {
  return matchOf(room).steps;
}

/** Sends `vendetta.<kind>.<step>` for `seat`'s vendetta: on the bus with no seat, in the record with it. */
export function emitStep(room: PartyRoom, seat: string, kind: string, sceneId?: string): void {
  const v = vendettaOf(room, seat);
  if (!v) return;
  const tick = room.state.tick;
  matchOf(room).steps.push({ tick, seat, vendettaId: v.id, kind });
  emitSim(room, { tick, kind, ...(sceneId !== undefined && { sceneId }) });
  if (kind === v.fires) progressOf(room, seat).over = true;
}

/** The holder's world body when it can act on its goal: alive, placed and out of the loft. */
export function activeBody(room: PartyRoom, seat: string) {
  const p = simOf(room).players.get(seat);
  return p && !p.dead && p.placed && !isLoft(p.sceneIdx) ? p : null;
}
