import { balance, onubBalance, onubFor, onubRoles } from '@wdi/content';
import {
  Claim,
  ErrorCode,
  Phase,
  type PlayerState,
  S2C,
  SKIP_VOTE,
  resolveDawn,
  resolveVotes,
} from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { enterScene } from './Portals';
import { countRow, factionOf, flowOf, refuse, roleIdOf, rolesOf, setPhase } from './Flow';
import { finalRoleOf, isOnub, onubOf } from './Onub';
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
  m.traces.clear();
  for (const line of onubOf(room)?.traces ?? []) m.traces.push(line);
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
    isOnub(room) ? onubFor(state.players.size).discussionS : countRow(state.players.size).discussionS,
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
 * Quick mode (GDD 3.11): `resolveDawn` turns out everyone at the top, ties included; the turned-out are marked
 * dead with no `killed` message (`voteResult.outs` is the cue) and their final roles are named.
 */
function startOnubReveal(room: PartyRoom): void {
  const state = room.state;
  const sim = simOf(room);
  const flow = flowOf(room);
  const o = onubOf(room);
  const living = livingIds(room);
  const cast: Record<string, string> = {};
  for (const id of living) {
    const vote = state.players.get(id)?.priv?.myVote ?? '';
    if (vote !== '') cast[id] = vote;
  }
  const { tally, outs, abstained } = resolveDawn(cast, living, onubBalance.vote);
  const counted = living.filter((id) => !abstained.includes(id));
  const roles: Record<string, string> = {};
  for (const id of outs) roles[id] = finalRoleOf(room, id);
  if (o) {
    o.votes = Object.fromEntries(counted.map((id) => [id, cast[id] as string]));
    o.outs = outs;
  }
  const stat = flow.current;
  if (stat) {
    stat.votes = counted.length;
    stat.correctVotes = counted.filter(
      (id) => onubRoles.roles[finalRoleOf(room, cast[id] as string)]?.faction === 'cabal',
    ).length;
    const [first] = outs;
    if (first !== undefined) {
      stat.ejectedId = first;
      stat.ejectedRole = roles[first] ?? '';
      stat.ejectionCorrect = onubRoles.roles[roles[first] ?? '']?.faction === 'cabal';
    }
  }
  setPhase(room, Phase.reveal, onubBalance.timers.revealS);
  room.broadcast(S2C.voteResult, { tally, outs, roles, abstained });
  for (const id of outs) {
    const ps = sim.players.get(id);
    if (ps) ps.dead = true;
    const seat = state.players.get(id);
    if (seat) seat.alive = false;
  }
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
 * Quick mode (GDD 3.11): `meeting.claim` from a living seat in the discussion or the vote replaces the
 * seat's row on the meeting board. 422 in the main mode and for a claim naming an unknown role or seat,
 * 425 in any other phase (the reveal included).
 */
export function handleClaim(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): void {
  if (!isOnub(room)) return refuse(room, sessionId, ErrorCode.cannot, 'cannot claim');
  const phase = room.state.phase;
  if (phase !== Phase.meetingDiscussion && phase !== Phase.meetingVote) {
    return refuse(room, sessionId, ErrorCode.wrongPhase, 'not now');
  }
  const { roleId, targetId = '', sawRoleId = '' } = payload;
  const known = (id: unknown): id is string => typeof id === 'string' && onubRoles.roles[id] !== undefined;
  const valid =
    isLiving(room, sessionId) &&
    known(roleId) &&
    typeof targetId === 'string' &&
    (targetId === '' || room.state.players.has(targetId)) &&
    (sawRoleId === '' || known(sawRoleId));
  if (!valid) return refuse(room, sessionId, ErrorCode.cannot, 'bad claim');
  const claim = new Claim();
  claim.from = sessionId;
  claim.roleId = roleId;
  claim.targetId = targetId;
  claim.sawRoleId = sawRoleId as string;
  const claims = room.state.meeting.claims;
  const at = claims.findIndex((c) => c.from === sessionId);
  if (at >= 0) claims[at] = claim;
  else claims.push(claim);
}
