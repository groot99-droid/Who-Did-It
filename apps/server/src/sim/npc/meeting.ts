import { balance, roles } from '@wdi/content';
import { SKIP_VOTE, TICK_RATE, npcDelayTicks, pickSuspect, pluralityOf, type PlayerState } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { handleVote } from '../Meeting';
import type { PlayerSim } from '../RoomSim';
import { simOf } from '../RoomSim';
import { difficultyRow } from './difficulty';
import type { Brain, NpcMemory } from './memory';

/** On the role card an NPC readies after a delay from the `npc.vote` range, so its tick looks human. */
export function readyOnRoleCard(room: PartyRoom, mem: NpcMemory, brain: Brain, player: PlayerState): void {
  const tick = room.state.tick;
  const v = balance.npc.vote;
  if (brain.readyAtTick < 0) {
    brain.readyAtTick = tick + npcDelayTicks(mem.rng, v.delayMinS, v.delayMaxS, TICK_RATE);
  }
  if (!player.ready && tick >= brain.readyAtTick) player.ready = true;
}

/** Living seats other than `selfId`, in roster order. */
function livingOthers(room: PartyRoom, selfId: string): string[] {
  const sim = simOf(room);
  return [...room.state.players.keys()].filter((id) => id !== selfId && sim.players.get(id)?.dead === false);
}

const holdsKnife = (player: PlayerState): boolean =>
  roles.roles[player.priv.role.roleId]?.abilities.includes('kill') ?? false;

/**
 * An NPC casts its vote `npc.vote.delayMinS..delayMaxS` after the discussion opens (GDD 3.12). Main mode:
 * with `suspectVoteChance` the seat that was most often in its sight at a body (A41), else Skip. A Killer
 * follows the plurality of the votes already cast and re-reads it every second, so it ends with the
 * majority. Quick mode: a random living other seat, never itself, never Skip.
 */
export function runMeetingVotes(
  room: PartyRoom,
  mem: NpcMemory,
  brain: Brain,
  player: PlayerState,
  p: PlayerSim,
  quick: boolean,
): void {
  if (p.dead) return;
  const tick = room.state.tick;
  const v = balance.npc.vote;
  if (brain.voteAtTick < 0)
    brain.voteAtTick = tick + npcDelayTicks(mem.rng, v.delayMinS, v.delayMaxS, TICK_RATE);
  if (tick < brain.voteAtTick) return;
  const others = livingOthers(room, player.id);

  if (quick) {
    if (player.hasVoted) return;
    const target = others[Math.floor(mem.rng() * others.length)];
    if (target !== undefined) handleVote(room, player.id, { targetId: target });
    return;
  }

  if (holdsKnife(player)) {
    if (player.hasVoted && tick < brain.nextRevoteTick) return;
    brain.nextRevoteTick = tick + TICK_RATE;
    const cast: string[] = [];
    for (const id of others) {
      const vote = room.state.players.get(id)?.priv?.myVote ?? '';
      if (vote !== '' && vote !== SKIP_VOTE) cast.push(vote);
    }
    const top = pluralityOf(cast, mem.rng);
    const target = top === null || top === player.id ? SKIP_VOTE : top;
    if (!player.hasVoted || player.priv.myVote !== target) handleVote(room, player.id, { targetId: target });
    return;
  }

  if (player.hasVoted) return;
  const suspect =
    mem.rng() < difficultyRow(room).suspectVoteChance ? pickSuspect(brain.suspicion, others, mem.rng) : null;
  handleVote(room, player.id, { targetId: suspect ?? SKIP_VOTE });
}
