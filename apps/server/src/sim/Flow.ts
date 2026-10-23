import { balance, roles } from '@wdi/content';
import {
  type ErrorCode,
  Phase,
  type PlayerState,
  S2C,
  TICK_RATE,
  type TeamId,
  type WinFaction,
} from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';

/** Shared plumbing of the match flow (phases, meetings, win): room-memory state and small helpers. */

export const secondsToTicks = (s: number): number => Math.round(s * TICK_RATE);

/** One entry of the match log's `meetings` list (ROADMAP 7.5). */
export interface MeetingStat {
  round: number;
  reason: string;
  /** Votes cast, and how many of them named a Cabal member (Skip never does). */
  votes: number;
  correctVotes: number;
  ejectedId?: string;
  ejectedRole?: string;
  ejectionCorrect?: boolean;
}

/** A queued WDI_DEBUG command: the message callback only pushes, the step runs it (ARCHITECTURE 5.6). */
export interface DebugCommand {
  sessionId: string;
  type: 'deal' | 'clock';
  payload: unknown;
}

/** Server memory of the flow stages. Never on the wire; `resetToLobby` replaces it. */
export class FlowState {
  /** The next deal's fixed seats (`debug.deal`), consumed by `startMatch`. */
  fixedDeal: Record<string, string> | null = null;
  readonly debug: DebugCommand[] = [];
  /** The ejection waiting for the end of the reveal, whose win check runs then. */
  pendingEjection: string | null = null;
  kills = 0;
  vanished = 0;
  readonly meetings: MeetingStat[] = [];
  current: MeetingStat | null = null;
  /** Main mode: the match's deck, card role ids in deck order (`deckFor(n).cards`); Session 5G writes it. */
  deck: string[] = [];
  /** Main mode: the cards nobody holds, in the deal's shuffled order; Session 5G writes it. */
  undealt: string[] = [];
  /** Both modes: the seats that dismissed their role card (private Ready, GDD 3.17); Session 5F fills it. */
  readonly cardReady = new Set<string>();
  /** Main mode: the seats Nightshade will kill when it resolves (GDD 3.2); Session 5G fills it. */
  readonly poisoned = new Set<string>();
  /** Main mode: the Vicar seat whose memorial played last (GDD 3.20); kept across `resetFlow`. Round 7, 7I sets it. */
  ascendedVicarCandidate: string | null = null;
}

const flows = new WeakMap<PartyRoom, FlowState>();
export function flowOf(room: PartyRoom): FlowState {
  let flow = flows.get(room);
  if (!flow) {
    flow = new FlowState();
    flows.set(room, flow);
  }
  return flow;
}

export function resetFlow(room: PartyRoom): void {
  const old = flowOf(room);
  const fresh = new FlowState();
  fresh.debug.push(...old.debug);
  fresh.ascendedVicarCandidate = old.ascendedVicarCandidate; // round 8 reads it in the room's next match
  flows.set(room, fresh);
}

const MEETING_PHASES: readonly number[] = [Phase.meetingDiscussion, Phase.meetingVote, Phase.reveal];
export const isMeetingPhase = (phase: number): boolean => MEETING_PHASES.includes(phase);

/**
 * Switches the phase, stamps its end and tells everyone. `MeetingState.phase` mirrors the phase id for
 * the three meeting phases and is 0 outside them; `endsTick` mirrors `phaseEndsTick` (A30).
 */
export function setPhase(room: PartyRoom, phase: number, seconds: number): void {
  const state = room.state;
  state.phase = phase;
  state.phaseEndsTick = state.tick + secondsToTicks(seconds);
  state.meeting.phase = isMeetingPhase(phase) ? phase : 0;
  state.meeting.endsTick = isMeetingPhase(phase) ? state.phaseEndsTick : 0;
  room.broadcast(S2C.phaseChange, { phase, endsTick: state.phaseEndsTick });
}

export function refuse(room: PartyRoom, sessionId: string, code: ErrorCode, msg: string): void {
  room.clients.getById(sessionId)?.send(S2C.error, { code, msg });
}

/** Rows of `balance.byCount` exist for 4 to 10; a smaller or larger party reads the nearest row. */
export const countRow = (seats: number) => balance.byCount[String(Math.min(10, Math.max(4, seats))) as '4'];

export const roleIdOf = (player: PlayerState): string => player.priv?.role.roleId ?? '';

/** A seat with no role (a debug start without a deal) counts as Village so no win fires by accident. */
export function factionOf(player: PlayerState): WinFaction {
  return (roles.roles[roleIdOf(player)]?.faction ?? 'village') as TeamId;
}

/** Every seat's role id; ghosts and the game-over screen see all roles (GDD 3.7). */
export function rolesOf(room: PartyRoom): Record<string, string> {
  const out: Record<string, string> = {};
  room.state.players.forEach((p: PlayerState, id: string) => {
    out[id] = roleIdOf(p);
  });
  return out;
}
