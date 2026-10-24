import { balance, roles } from '@wdi/content';
import {
  NoteKind,
  SKIP_VOTE,
  TICK_RATE,
  Team,
  npcDelayTicks,
  pickSuspect,
  pluralityOf,
  type PlayerState,
} from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { runNpcNotes } from '../../services/talk/npcNotes';
import { markCardReady } from '../Covers';
import { flowOf } from '../Flow';
import { handleVote } from '../Meeting';
import type { PlayerSim } from '../RoomSim';
import { simOf } from '../RoomSim';
import { difficultyRow } from './difficulty';
import { type Brain, type NpcMemory, npcMemory, playRng, timingRng } from './memory';

/** On the role card an NPC readies after a delay from the `npc.ready` range, so its tick looks human. */
export function readyOnRoleCard(room: PartyRoom, mem: NpcMemory, brain: Brain, player: PlayerState): void {
  void mem;
  const tick = room.state.tick;
  const d = balance.npc.ready.delayS;
  if (brain.readyAtTick < 0) {
    brain.readyAtTick = tick + npcDelayTicks(timingRng(room, player.id), d.min, d.max, TICK_RATE);
  }
  // 5F's `markCardReady` (locked call site, both modes): the public tick until 5F makes card Ready private.
  if (!player.ready && tick >= brain.readyAtTick) markCardReady(room, player.id);
}

/** Living seats other than `selfId`, in roster order. */
function livingOthers(room: PartyRoom, selfId: string): string[] {
  const sim = simOf(room);
  return [...room.state.players.keys()].filter((id) => id !== selfId && sim.players.get(id)?.dead === false);
}

const holdsKnife = (player: PlayerState): boolean =>
  roles.roles[player.priv.role.roleId]?.abilities.includes('kill') ?? false;

/** Whether the vote in progress refuses Skip: the setting, or the Final Night's forced vote (GDD 3.8). */
function skipDisabled(room: PartyRoom): boolean {
  if (!balance.meeting.skipAllowed) return true;
  return flowOf(room).current?.reason === 'final' && !balance.finalNight.skipAllowed;
}

const pickOf = <T>(items: readonly T[], u: number): T | null =>
  items.length === 0 ? null : (items[Math.min(items.length - 1, Math.floor(u * items.length))] as T);

/**
 * The seat an NPC votes for, or null for Skip (GDD 3.12), in order: a Cabal confession in its Notebook (the
 * confessed seat while it lives); a Killer NPC the plurality of the votes already cast; with `suspectVoteChance`
 * the suspect of its suspicion memory; a random living other seat when Skip is disabled; else null. 5G's NPC Last
 * Shot aims here, holding its fire on null. The uniforms are the ones drawn at the vote tick (`brain.voteRolls`;
 * before that the seat's night-power pick, which every NPC draws), so no call draws from a stream.
 */
export function npcVoteTarget(room: PartyRoom, id: string, tieRoll?: number): string | null {
  const player = room.state.players.get(id);
  if (!player) return null;
  const mem = npcMemory(room);
  const brain = mem.brain(id);
  const [uSuspect, uTie, uFallback] = brain.voteRolls ?? [
    brain.nightPowerPick,
    brain.nightPowerPick,
    brain.nightPowerPick,
  ];
  const others = livingOthers(room, id);

  for (const entry of player.priv.notebook) {
    if (entry.note === NoteKind.confession && entry.value === Team.cabal && others.includes(entry.of))
      return entry.of;
  }

  if (holdsKnife(player)) {
    const cast: string[] = [];
    for (const other of others) {
      const vote = room.state.players.get(other)?.priv?.myVote ?? '';
      if (vote !== '' && vote !== SKIP_VOTE) cast.push(vote);
    }
    const top = pluralityOf(cast, () => tieRoll ?? uTie);
    if (top !== null && top !== id) return top;
    return skipDisabled(room) ? pickOf(others, uFallback) : null;
  }

  const suspect =
    uSuspect < difficultyRow(room).suspectVoteChance
      ? pickSuspect(brain.suspicion, others, () => uTie)
      : null;
  if (suspect !== null) return suspect;
  return skipDisabled(room) ? pickOf(others, uFallback) : null;
}

/**
 * An NPC casts its vote at an `npc.vote.windowFrac` fraction of the discussion plus the vote time, from the
 * discussion's first tick (GDD 3.12), the tick drawn from its `npcTiming` stream; the vote's other uniforms come
 * from `npcPlay`, all drawn by every NPC whatever its card (npc.md 6). A Killer NPC follows the plurality of the
 * votes already cast and re-reads it every second, so it ends with the majority.
 */
export function runMeetingVotes(
  room: PartyRoom,
  mem: NpcMemory,
  brain: Brain,
  player: PlayerState,
  p: PlayerSim,
): void {
  void mem;
  if (p.dead) return;
  runNpcNotes(room, player); // round 8, 8T (6Z's grant): the meeting notes (GDD 3.8)
  const tick = room.state.tick;
  const id = player.id;
  if (brain.voteAtTick < 0) {
    const f = balance.npc.vote.windowFrac;
    const span = Math.max(0, room.state.phaseEndsTick - tick) + balance.phases.voteS * TICK_RATE;
    brain.voteAtTick = tick + Math.round(span * (f.min + timingRng(room, id)() * (f.max - f.min)));
  }
  if (tick < brain.voteAtTick) return;

  let tie: number;
  let recheck: boolean;
  if (brain.voteRolls === null) {
    const rng = playRng(room, id);
    brain.voteRolls = [rng(), rng(), rng()];
    tie = rng();
    brain.nextRevoteTick = tick + TICK_RATE;
    recheck = true;
  } else if (tick >= brain.nextRevoteTick) {
    tie = playRng(room, id)();
    brain.nextRevoteTick = tick + TICK_RATE;
    recheck = true;
  } else {
    tie = 0;
    recheck = false;
  }
  if (!recheck) return;

  if (holdsKnife(player)) {
    const target = npcVoteTarget(room, id, tie) ?? SKIP_VOTE;
    if (!player.hasVoted || player.priv.myVote !== target) handleVote(room, id, { targetId: target });
    return;
  }
  if (player.hasVoted) return;
  handleVote(room, id, { targetId: npcVoteTarget(room, id, tie) ?? SKIP_VOTE });
}
