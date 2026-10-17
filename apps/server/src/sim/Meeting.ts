import { balance, onubBalance } from '@wdi/content';
import { ErrorCode, Phase, type PlayerState, S2C, SKIP_VOTE, resolveVotes } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { enterScene } from './Portals';
import { countRow, factionOf, flowOf, refuse, roleIdOf, rolesOf, setPhase } from './Flow';
import { isOnub } from './onub/state';
import { type MeetingRequest, simOf } from './RoomSim';
import { evaluateWin, endMatch, endOnubMatch } from './Win';

/** Everyone, living or dead, goes to the square without a `sceneEnter`; the placements come first. */
function placeAtSquare(room: PartyRoom, announce: boolean): void {
  const sim = simOf(room);
  room.state.players.forEach((player: PlayerState, id: string) => {
    const p = sim.players.get(id);
    if (!p?.placed) return;
    enterScene(room, player, p, 'overworld', `square_${p.ordinal % 10}`, false, announce);
  });
  sim.viewsDirty = true;
}

/**
 * The first request of the tick opens the meeting (GDD 3.3, A30): every private death becomes public,
 * the votes reset, `MeetingState` fills, `meetingStart` goes out after the placements, then the
 * discussion clock starts.
 */
export function openMeeting(room: PartyRoom, req: MeetingRequest): void {
  const state = room.state;
  const sim = simOf(room);
  state.players.forEach((player: PlayerState, id: string) => {
    if (sim.players.get(id)?.dead) player.alive = false;
  });
  // The dawn meeting moves nobody: everyone is still in the loft (A39).
  if (!isOnub(room)) placeAtSquare(room, false);
  state.players.forEach((player: PlayerState) => {
    player.hasVoted = false;
    if (player.priv) player.priv.myVote = '';
  });
  const m = state.meeting;
  m.reason = req.reason;
  m.callerId = req.callerId;
  m.bodyOf = req.bodyOf ?? '';
  m.missing.clear();
  m.board.clear();
  m.claims.clear();
  const flow = flowOf(room);
  flow.current = { round: state.round, reason: req.reason, votes: 0, correctVotes: 0 };
  flow.meetings.push(flow.current);
  room.broadcast(S2C.meetingStart, {
    reason: req.reason,
    callerId: req.callerId,
    ...(req.bodyOf !== undefined && { bodyOf: req.bodyOf }),
    missing: [],
  });
  setPhase(
    room,
    Phase.meetingDiscussion,
    isOnub(room) ? onubBalance.timers.rushS : countRow(state.players.size).discussionS,
  );
}

/** `meeting.vote`: a living player, in discussion or vote, for a living player or Skip; changeable. */
export function handleVote(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): void {
  const phase = room.state.phase;
  if (phase !== Phase.meetingDiscussion && phase !== Phase.meetingVote) {
    return refuse(room, sessionId, ErrorCode.wrongPhase, 'no vote open');
  }
  const sim = simOf(room);
  const voter = room.state.players.get(sessionId);
  if (!voter?.priv || !sim.players.get(sessionId) || sim.players.get(sessionId)?.dead) {
    return refuse(room, sessionId, ErrorCode.cannot, 'ghosts do not vote');
  }
  const target = payload.targetId;
  const quick = isOnub(room);
  const ok =
    typeof target === 'string' &&
    (target === SKIP_VOTE
      ? quick
        ? onubBalance.vote.skipAllowed
        : balance.meeting.skipAllowed
      : isLiving(room, target) && (!quick || onubBalance.vote.selfVoteAllowed || target !== sessionId));
  if (!ok) return refuse(room, sessionId, ErrorCode.cannot, 'no such candidate');
  voter.priv.myVote = target;
  voter.hasVoted = true;
}

/** A seat in the game: not dead and, in quick mode, still connected (a leaver abstains, never ends the match). */
function isLiving(room: PartyRoom, id: string): boolean {
  const player = room.state.players.get(id);
  if (!player || simOf(room).players.get(id)?.dead !== false) return false;
  return !isOnub(room) || player.connected;
}

function livingIds(room: PartyRoom): string[] {
  return [...room.state.players.keys()].filter((id) => isLiving(room, id));
}

const allVoted = (room: PartyRoom): boolean => {
  const living = livingIds(room);
  return living.length > 0 && living.every((id) => room.state.players.get(id)?.hasVoted === true);
};

/** Tally, announce, eject: the reveal lasts `revealS`, the win check waits for its end. */
function startReveal(room: PartyRoom): void {
  if (isOnub(room)) return startOnubReveal(room);
  const state = room.state;
  const sim = simOf(room);
  const flow = flowOf(room);
  const living = livingIds(room);
  const votes: Record<string, string> = {};
  for (const id of living) {
    const vote = state.players.get(id)?.priv?.myVote ?? '';
    if (vote !== '') votes[id] = vote;
  }
  const { tally, ejectedId } = resolveVotes(votes, living, { skipAllowed: balance.meeting.skipAllowed });
  const stat = flow.current;
  if (stat) {
    for (const target of Object.values(votes)) {
      stat.votes++;
      const seat = state.players.get(target);
      if (seat && factionOf(seat) === 'cabal') stat.correctVotes++;
    }
  }
  setPhase(room, Phase.reveal, balance.phases.revealS);
  const ejected = ejectedId === undefined ? undefined : state.players.get(ejectedId);
  room.broadcast(S2C.voteResult, {
    tally,
    ...(ejected && ejectedId !== undefined && { ejectedId, role: roleIdOf(ejected) }),
  });
  if (!ejected || ejectedId === undefined) return;
  const ps = sim.players.get(ejectedId);
  if (ps) ps.dead = true;
  ejected.alive = false;
  flow.pendingEjection = ejectedId;
  if (stat) {
    stat.ejectedId = ejectedId;
    stat.ejectedRole = roleIdOf(ejected);
    stat.ejectionCorrect = factionOf(ejected) === 'cabal';
  }
  room.clients
    .getById(ejectedId)
    ?.send(S2C.killed, { sceneId: 'overworld', cause: 'ejected', roles: rolesOf(room) });
}

/**
 * Quick mode (GDD 3.11): the CRUST tally, the oven and the Critique's drag, `voteResult` with `outs`, `hop`,
 * `pantryOut`, the final roles of `outs` and `abstained`, then `Phase.reveal` for `revealS` (5B). Stub until 5B
 * lands: straight to the end of the match.
 */
function startOnubReveal(room: PartyRoom): void {
  endOnubMatch(room);
}

/** After the reveal: the win check for an ejection, else the announced return to the square, immunity. */
function endReveal(room: PartyRoom): void {
  if (isOnub(room)) return endOnubMatch(room);
  const flow = flowOf(room);
  if (flow.pendingEjection !== null) {
    flow.pendingEjection = null;
    const winner = evaluateWin(room);
    if (winner) return endMatch(room, winner);
  }
  enterImmunity(room);
}

/** The announced placement is the client's cue to leave the meeting (A30). */
export function enterImmunity(room: PartyRoom): void {
  setPhase(room, Phase.immunity, balance.phases.immunityS);
  placeAtSquare(room, true);
}

/** One tick of the meeting phases: discussion -> vote -> reveal, ending early when everyone has voted. */
export function runMeeting(room: PartyRoom): void {
  const { phase, tick, phaseEndsTick } = room.state;
  if (phase === Phase.reveal) {
    if (tick >= phaseEndsTick) endReveal(room);
    return;
  }
  if (allVoted(room) || (phase === Phase.meetingVote && tick >= phaseEndsTick)) return startReveal(room);
  if (phase === Phase.meetingDiscussion && tick >= phaseEndsTick) {
    setPhase(room, Phase.meetingVote, isOnub(room) ? onubBalance.timers.voteS : balance.phases.voteS);
  }
}

/**
 * Quick mode (GDD 3.11): `meeting.claim` from a seat in play in the Rush or CRUST replaces the seat's claim on
 * the meeting board (5B, contract 4.6). 422 in the main mode. Stub until 5B lands: refused 422 in quick mode too.
 */
export function handleClaim(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): void {
  void payload;
  refuse(room, sessionId, ErrorCode.cannot, 'cannot claim');
}
