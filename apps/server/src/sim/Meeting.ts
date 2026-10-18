import { balance, onubBalance, onubRoles } from '@wdi/content';
import {
  Claim,
  ClaimSaw,
  ErrorCode,
  PANTRY_VOTE,
  Phase,
  type PlayerState,
  S2C,
  SKIP_VOTE,
  resolveDawn,
  resolveVotes,
} from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { enterScene } from './Portals';
import { countRow, factionOf, flowOf, refuse, roleIdOf, rolesOf, secondsToTicks, setPhase } from './Flow';
import { hubOf, meetingSpawnsOf } from './MapSites';
import { onMeetingOpenDisguise } from './Impersonate';
import { beginAim, holdReveal, onMeetingOpenNight } from './NightPowers';
import { finalRoles } from './onub/Acts';
import { isOnub, onubOf } from './onub/state';
import { type MeetingRequest, simOf } from './RoomSim';
import { evaluateWin, endMatch, endOnubMatch } from './Win';

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

/**
 * The first request of the tick opens the meeting (GDD 3.3, A30): every private death becomes public,
 * the votes reset, `MeetingState` fills, `meetingStart` goes out after the placements, then the
 * discussion clock starts.
 */
export function openMeeting(room: PartyRoom, req: MeetingRequest): void {
  const state = room.state;
  const sim = simOf(room);
  // Round 5, main mode (locked call sites): Nightshade resolves before `alive` flips (5G), and every disguise ends
  // before the placements (5F).
  if (!isOnub(room)) onMeetingOpenNight(room);
  state.players.forEach((player: PlayerState, id: string) => {
    if (sim.players.get(id)?.dead) player.alive = false;
  });
  // The dawn meeting moves nobody: everyone is still in the loft (A39).
  if (!isOnub(room)) {
    onMeetingOpenDisguise(room);
    placeAtSquare(room, false);
  }
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
      : quick && target === PANTRY_VOTE
        ? onubBalance.vote.pantryTarget
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
  // An ejected Gamekeeper aims its Last Shot first (5G, `deck/wire.md` 5): its `killed` waits for the aim to close.
  if (beginAim(room, ejectedId, 'ejected')) return;
  room.clients
    .getById(ejectedId)
    ?.send(S2C.killed, { sceneId: hubOf(room), cause: 'ejected', roles: rolesOf(room) });
}

/**
 * Quick mode (GDD 3.11): the CRUST tally (`resolveDawn`), the oven and the Critique's drag, `voteResult` with
 * `outs`, `hop`, `pantryOut`, the final roles of `outs` and `abstained`, then `Phase.reveal` for `revealS`.
 * Nothing else about the final cards leaves the server before game over.
 */
function startOnubReveal(room: PartyRoom): void {
  const o = onubOf(room);
  if (!o) return endOnubMatch(room);
  const sim = simOf(room);
  const inPlay = o.seats.filter((id) => isLiving(room, id));
  const cast: Record<string, string> = {};
  for (const id of inPlay) {
    const vote = room.state.players.get(id)?.priv?.myVote ?? '';
    if (vote !== '') cast[id] = vote;
  }
  const finals = finalRoles(o);
  const info = (roleId: string) => {
    const role = onubRoles.roles[roleId];
    if (!role) throw new Error(`unknown quick-mode role ${roleId}`);
    return { team: role.team, spore: role.spore, onOut: role.onOut };
  };
  const dawn = resolveDawn(cast, inPlay, finals, info, onubBalance.vote);
  o.dawn = dawn;
  o.votes = Object.fromEntries(Object.entries(cast).filter(([id]) => !dawn.abstained.includes(id)));
  const stat = flowOf(room).current;
  if (stat) {
    for (const target of Object.values(o.votes)) {
      stat.votes++;
      const role = finals.get(target);
      if (role && onubRoles.roles[role]?.team === 'mold') stat.correctVotes++;
    }
  }
  for (const id of dawn.outs) {
    const p = sim.players.get(id);
    if (p) p.dead = true;
    const player = room.state.players.get(id);
    if (player) player.alive = false;
  }
  setPhase(room, Phase.reveal, onubBalance.timers.revealS);
  room.broadcast(S2C.voteResult, {
    tally: dawn.tally,
    outs: dawn.outs,
    hop: dawn.hop,
    pantryOut: dawn.pantryOut,
    roles: Object.fromEntries(dawn.outs.map((id) => [id, finals.get(id) ?? ''])),
    abstained: dawn.abstained,
  });
}

/** After the reveal: the win check for an ejection, else the announced return to the square, immunity. */
function endReveal(room: PartyRoom): void {
  if (isOnub(room)) return endOnubMatch(room); // nobody aims in the quick mode
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
  if (isOnub(room)) return runOnubMeeting(room);
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

/**
 * Quick mode (GDD 3.11): the Rush runs its whole clock whoever has voted; CRUST opens with the countdown, ends at
 * its clock or, once every seat in play has voted, as soon as the countdown has played.
 */
function runOnubMeeting(room: PartyRoom): void {
  const { phase, tick, phaseEndsTick } = room.state;
  const { voteS, crustCountdownS } = onubBalance.timers;
  if (phase === Phase.reveal) {
    if (tick >= phaseEndsTick) endReveal(room);
  } else if (phase === Phase.meetingDiscussion) {
    if (tick >= phaseEndsTick) setPhase(room, Phase.meetingVote, voteS);
  } else if (phase === Phase.meetingVote) {
    const countdownOver = tick >= phaseEndsTick - secondsToTicks(voteS) + secondsToTicks(crustCountdownS);
    if (tick >= phaseEndsTick || (countdownOver && allVoted(room))) startReveal(room);
  }
}

const isId = (v: unknown): v is string => typeof v === 'string' && v !== '';

/**
 * Quick mode (GDD 3.11): `meeting.claim` from a seat in play in the Rush or CRUST replaces the seat's claim on
 * the meeting board (contract 4.6): 425 outside them, 422 for a seat not in play, a role that is not in the
 * deck, an unknown station or card, a card not of the claimed station, too many sightings, or a sighting whose
 * target is neither a seat nor the Pantry. Claims are claims: the server checks only that the ids exist.
 */
export function handleClaim(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): void {
  const o = onubOf(room);
  if (!isOnub(room) || !o) return refuse(room, sessionId, ErrorCode.cannot, 'cannot claim');
  const phase = room.state.phase;
  if (phase !== Phase.meetingDiscussion && phase !== Phase.meetingVote) {
    return refuse(room, sessionId, ErrorCode.wrongPhase, 'no claim open');
  }
  const cannot = (): void => refuse(room, sessionId, ErrorCode.cannot, 'cannot claim');
  if (!isLiving(room, sessionId) || !o.seats.includes(sessionId)) return cannot();
  const blank = (v: unknown): unknown => (v === '' ? undefined : v); // a part left out may arrive empty
  const { roleId, saw } = payload;
  const stationId = blank(payload.stationId);
  const cardId = blank(payload.cardId);
  const stationIds = onubBalance.stations.map((s) => s.id);
  if (!isId(roleId) || !o.deck.includes(roleId)) return cannot();
  if (stationId !== undefined && (!isId(stationId) || !stationIds.includes(stationId))) return cannot();
  const card = isId(cardId) ? onubBalance.cards[cardId] : undefined;
  if (cardId !== undefined && (!card || (stationId !== undefined && card.station !== stationId)))
    return cannot();
  const sightings = saw === undefined ? [] : saw;
  if (!Array.isArray(sightings) || sightings.length > onubBalance.claims.maxSaw) return cannot();
  const rows: InstanceType<typeof ClaimSaw>[] = [];
  for (const s of sightings as Record<string, unknown>[]) {
    const { targetId } = s ?? {};
    const seenRole = blank(s?.roleId);
    const seenStation = blank(s?.stationId);
    if (!isId(targetId) || (targetId !== PANTRY_VOTE && !o.seats.includes(targetId))) return cannot();
    if (seenRole !== undefined && (!isId(seenRole) || !onubRoles.roles[seenRole])) return cannot();
    if (seenStation !== undefined && (!isId(seenStation) || !stationIds.includes(seenStation)))
      return cannot();
    const row = new ClaimSaw();
    row.targetId = targetId;
    row.roleId = (seenRole as string | undefined) ?? '';
    row.stationId = (seenStation as string | undefined) ?? '';
    rows.push(row);
  }
  const claim = new Claim();
  claim.from = sessionId;
  claim.roleId = roleId;
  claim.stationId = (stationId as string | undefined) ?? '';
  claim.cardId = (cardId as string | undefined) ?? '';
  for (const row of rows) claim.saw.push(row);
  const claims = room.state.meeting.claims;
  const at = claims.findIndex((c) => c.from === sessionId);
  if (at >= 0) claims[at] = claim;
  else claims.push(claim);
}
