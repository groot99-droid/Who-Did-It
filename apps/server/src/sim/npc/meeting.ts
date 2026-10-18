import { balance, roles } from '@wdi/content';
import { SKIP_VOTE, TICK_RATE, npcDelayTicks, pickSuspect, pluralityOf, type PlayerState } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { markCardReady } from '../Covers';
import { handleVote } from '../Meeting';
import type { PlayerSim } from '../RoomSim';
import { simOf } from '../RoomSim';
import { difficultyRow } from './difficulty';
import type { Brain, NpcMemory } from './memory';

/** On the role card an NPC readies after a delay from the `npc.ready` range, so its tick looks human. */
export function readyOnRoleCard(room: PartyRoom, mem: NpcMemory, brain: Brain, player: PlayerState): void {
  const tick = room.state.tick;
  const d = balance.npc.ready.delayS;
  if (brain.readyAtTick < 0) {
    brain.readyAtTick = tick + npcDelayTicks(mem.rng, d.min, d.max, TICK_RATE);
  }
  // 5F's `markCardReady` (locked call site, both modes): the public tick until 5F makes card Ready private.
  if (!player.ready && tick >= brain.readyAtTick) markCardReady(room, player.id);
}

/**
 * The seat an NPC votes for, or null for Skip (GDD 3.12): a Cabal confession first, then its suspicion; 5G's NPC
 * Last Shot aims here, holding its fire on null. Session 5H fills it (npc/data.md 7). Pre-seed stub: null.
 */
export function npcVoteTarget(room: PartyRoom, id: string): string | null {
  void room;
  void id;
  return null;
}

/** Living seats other than `selfId`, in roster order. */
function livingOthers(room: PartyRoom, selfId: string): string[] {
  const sim = simOf(room);
  return [...room.state.players.keys()].filter((id) => id !== selfId && sim.players.get(id)?.dead === false);
}

const holdsKnife = (player: PlayerState): boolean =>
  roles.roles[player.priv.role.roleId]?.abilities.includes('kill') ?? false;

/**
 * An NPC casts its vote at an `npc.vote.windowFrac` fraction of the discussion plus the vote time, from the
 * discussion's first tick (GDD 3.12). Main mode:
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
  if (brain.voteAtTick < 0) {
    const f = balance.npc.vote.windowFrac;
    const span = Math.max(0, room.state.phaseEndsTick - tick) + balance.phases.voteS * TICK_RATE;
    brain.voteAtTick = tick + Math.round(span * (f.min + mem.rng() * (f.max - f.min)));
  }
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
