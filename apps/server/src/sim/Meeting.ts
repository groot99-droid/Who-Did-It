import { balance } from '@wdi/content';
import { ErrorCode, Phase, type PlayerState, S2C, SKIP_VOTE, TICK_RATE, resolveVotes } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { enterScene } from './Portals';
import { emitSim } from './events/bus';
import { countsVote, hasCastDespiteDoubt } from './vendettas/conversion';
import { countRow, factionOf, flowOf, refuse, roleIdOf, rolesOf, setPhase } from './Flow';
import { hubOf, meetingSpawnsOf } from './MapSites';
import { onMeetingOpenDisguise } from './Impersonate';
import { beginAim, holdReveal, onMeetingOpenNight } from './NightPowers';
import { type MeetingRequest, simOf } from './RoomSim';
import { evaluateWin, endMatch } from './Win';

/**
 * Everyone, living or dead, goes to the map's meeting spawns on the hub (`meetingSpawnsOf`) without a
 * `sceneEnter`; the placements come first.
 */
function placeAtSquare(room: PartyRoom, announce: boolean): void {
  const sim = simOf(room);
  const spread = meetingSpawnsOf(room);
  room.state.players.forEach((player: PlayerState, id: string) => {
    const p = sim.players.get(id);
    if (!p?.placed) return;
    const site = spread[p.ordinal % spread.length]!;
    enterScene(room, player, p, site.sceneId, site.spawn, false, announce);
  });
  sim.viewsDirty = true;
}

/** Round 8 (8L, A190): the tick each room's votes open, `meeting.minVoteS` after its meeting opened (GDD 3.8). */
const votesOpenTick = new WeakMap<PartyRoom, number>();

/** White-box (tests): the current meeting's votes open now, as if `meeting.minVoteS` had passed. */
export function openVotesNow(room: PartyRoom): void {
  votesOpenTick.set(room, room.state.tick);
}

/**
 * The first request of the tick opens the meeting (GDD 3.3, A30): every private death becomes public,
 * the votes reset, `MeetingState` fills, `meetingStart` goes out after the placements, then the
 * discussion clock starts.
 */
export function openMeeting(room: PartyRoom, req: MeetingRequest): void {
  const state = room.state;
  const sim = simOf(room);
  // Round 5 (locked call sites): Nightshade resolves before `alive` flips (5G), and every disguise ends before the
  // placements (5F).
  onMeetingOpenNight(room);
  state.players.forEach((player: PlayerState, id: string) => {
    if (sim.players.get(id)?.dead) player.alive = false;
  });
  onMeetingOpenDisguise(room);
  placeAtSquare(room, false);
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
  const flow = flowOf(room);
  flow.current = { round: state.round, reason: req.reason, votes: 0, correctVotes: 0 };
  flow.meetings.push(flow.current);
  emitSim(room, { tick: state.tick, kind: 'meeting', seat: req.callerId, data: { reason: req.reason } }); // 6B
  room.broadcast(S2C.meetingStart, {
    reason: req.reason,
    callerId: req.callerId,
    ...(req.bodyOf !== undefined && { bodyOf: req.bodyOf }),
    missing: [],
  });
  setPhase(room, Phase.meetingDiscussion, countRow(state.players.size).discussionS);
  votesOpenTick.set(room, state.tick + Math.round(balance.meeting.minVoteS * TICK_RATE));
}

/**
 * `meeting.vote`: a living player, in discussion or vote, for a living player or Skip; changeable. A vote before
 * `meeting.minVoteS` of the discussion is refused with the reason (round 8, 8L), so an agreed instant vote cannot land.
 */
export function handleVote(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): void {
  const phase = room.state.phase;
  if (phase !== Phase.meetingDiscussion && phase !== Phase.meetingVote) {
    return refuse(room, sessionId, ErrorCode.wrongPhase, 'no vote open');
  }
  if (room.state.tick < (votesOpenTick.get(room) ?? 0)) {
    return refuse(
      room,
      sessionId,
      ErrorCode.wrongPhase,
      `votes open ${balance.meeting.minVoteS} s into the discussion`,
    );
  }
  const sim = simOf(room);
  const voter = room.state.players.get(sessionId);
  if (!voter?.priv || !sim.players.get(sessionId) || sim.players.get(sessionId)?.dead) {
    return refuse(room, sessionId, ErrorCode.cannot, 'ghosts do not vote');
  }
  const target = payload.targetId;
  const ok =
    typeof target === 'string' &&
    (target === SKIP_VOTE ? balance.meeting.skipAllowed : isLiving(room, target));
  if (!ok) return refuse(room, sessionId, ErrorCode.cannot, 'no such candidate');
  voter.priv.myVote = target;
  voter.hasVoted = countsVote(room, sessionId); // round 7, 7H: a doubted Vicar's vote stays unseen (GDD 3.20)
  emitSim(room, { tick: room.state.tick, kind: 'vote', seat: sessionId, data: { target } }); // round 6, 6B
}

/** A seat in the game: not dead. */
function isLiving(room: PartyRoom, id: string): boolean {
  return room.state.players.has(id) && simOf(room).players.get(id)?.dead === false;
}

function livingIds(room: PartyRoom): string[] {
  return [...room.state.players.keys()].filter((id) => isLiving(room, id));
}

const allVoted = (room: PartyRoom): boolean => {
  const living = livingIds(room);
  return (
    living.length > 0 &&
    living.every(
      (id) => room.state.players.get(id)?.hasVoted === true || hasCastDespiteDoubt(room, id), // round 7, 7H
    )
  );
};

/** Tally, announce, eject: the reveal lasts `revealS`, the win check waits for its end. */
function startReveal(room: PartyRoom): void {
  const state = room.state;
  const sim = simOf(room);
  const flow = flowOf(room);
  const living = livingIds(room);
  const votes: Record<string, string> = {};
  for (const id of living) {
    const vote = state.players.get(id)?.priv?.myVote ?? '';
    if (vote !== '' && countsVote(room, id)) votes[id] = vote; // round 7, 7H: a sown doubt (GDD 3.20)
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
  emitSim(room, { tick: state.tick, kind: 'eject', seat: ejectedId, data: { role: roleIdOf(ejected) } }); // 6B
  if (stat) {
    stat.ejectedId = ejectedId;
    stat.ejectedRole = roleIdOf(ejected);
    stat.ejectionCorrect = factionOf(ejected) === 'cabal';
  }
  // An ejected Gamekeeper aims its Last Shot first (5G, `deck/wire.md` 5): its `killed` waits for the aim to close.
  if (beginAim(room, ejectedId, 'ejected')) return;
  room.clients
    .getById(ejectedId)
    ?.send(S2C.killed, { sceneId: hubOf(room), cause: 'ejected', roles: rolesOf(room) });
}

/** After the reveal: the win check for an ejection, else the announced return to the square, immunity. */
function endReveal(room: PartyRoom): void {
  if (holdReveal(room)) return; // round 5, 5G: an ejected Gamekeeper's shot holds the reveal (locked call site)
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
    setPhase(room, Phase.meetingVote, balance.phases.voteS);
  }
}
