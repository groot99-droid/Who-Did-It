import { balance, roles } from '@wdi/content';
import { Phase, type PlayerState, SKIP_VOTE, TICK_RATE } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { flowOf, refuse, setPhase } from './Flow';
import { openEndTrial } from './law/EndTrial';
import { endMatch, evaluateWin } from './Win';

// The Final Night (GDD 3.3, 3.8; round-5 `deck/wire.md` 5). Session 5G owns this file: `Phases.ts` calls it for the
// phase changes, and `holdReveal` (NightPowers.ts) for the end of the forced meeting.

/** The day that would start `round` becomes the Final Night when that round is above `finalNight.afterCycle`. */
export const isFinalNightRound = (round: number): boolean => round > balance.finalNight.afterCycle;

/**
 * Starts the hunt in place of a day: everyone stays where they stand, every Knife's cooldown is cut to at most
 * `finalNight.killCooldownS`, and the night powers wake (NightPowers.ts sees the phase change).
 */
export function beginFinalNight(room: PartyRoom): void {
  const state = room.state;
  state.round++;
  setPhase(room, Phase.finalNight, balance.finalNight.huntS);
  const cap = state.tick + balance.finalNight.killCooldownS * TICK_RATE;
  state.players.forEach((player: PlayerState) => {
    const cooldowns = player.priv?.cooldownEndTick;
    if (!cooldowns || !roles.roles[player.priv.role.roleId]?.abilities.includes('kill')) return;
    cooldowns.set('kill', Math.min(cooldowns.get('kill') ?? 0, cap));
  });
}

/**
 * The hunt is over (time, or a body report): the end trial opens (round 10, B6d; GDD 3.8, seams.md 3 row 35). It
 * replaced the forced meeting with reason `final`; B6c removes the vote code left below.
 */
export function endHunt(room: PartyRoom, callerId = '', bodyOf?: string): void {
  void callerId;
  void bodyOf;
  openEndTrial(room);
}

/** The forced meeting is open and its vote has no Skip: a Skip vote is refused and cleared (GDD 3.3). */
export function enforceFinalVote(room: PartyRoom): void {
  if (room.state.meeting.reason !== 'final' || balance.finalNight.skipAllowed) return;
  room.state.players.forEach((player: PlayerState, id: string) => {
    if (player.priv?.myVote !== SKIP_VOTE) return;
    player.priv.myVote = '';
    player.hasVoted = false;
    refuse(room, id, 'BAD_REQUEST');
  });
}

/**
 * The reveal of the forced meeting is over: the match ends (GDD 3.8). The Village wins when the vote ejected a Cabal
 * member; a tie or a Skip plurality (nobody ejected) or a non-Cabal seat means the Cabal wins.
 */
export function finishFinalNight(room: PartyRoom): void {
  const flow = flowOf(room);
  const ejected = flow.pendingEjection === null ? undefined : room.state.players.get(flow.pendingEjection);
  flow.pendingEjection = null;
  const cabal = ejected !== undefined && roles.roles[ejected.priv.role.roleId]?.faction === 'cabal';
  // A parity win by an earlier death in the same match is judged first, so the verdict is never reversed.
  endMatch(room, evaluateWin(room) ?? (cabal ? 'village' : 'cabal'));
}
