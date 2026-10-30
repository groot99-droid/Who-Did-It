import { balance } from '@wdi/content';
import { NoteKind, QuestState, TICK_RATE } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import type { SimEvent } from '../events/bus';
import { addNote } from '../NightPowers';
import { isNpcSeat } from '../Npc';
import { simOf } from '../RoomSim';
import { reject } from '../World';
import { emitStep, progressOf } from './progress';

/**
 * Contract, the Hitman (GDD 3.20): the Hitman's turning (round 10, C4a, `arrival.ts`) mails it a target drawn
 * from the mail stream (`contract`, keyed by the Hitman's seat) among the living seats other than itself and its Cabal mates,
 * written to its own Notebook (`NoteKind.contract`). It accepts it from anywhere as the quest `contract` of its own
 * `Private.quests` (`quest.accept`, the one line of `sim/Quests.ts`); an NPC Hitman accepts at once. While accepted
 * and the target lives, a Knife kill of anyone else rests the Knife `offTargetRestS` longer; killing the target
 * completes it and readies the Knife; the target dying any other way ends it unpaid. Session 7H. Round 10, C4: the
 * row is an `arrival` row, never drawn at the deal, so the Killer-held path (the first arrival's mail) is retired
 * (C4b). A turned seat holds no Knife: its paying kill is the Derringer's (`dayWeapon.ts`, cause `derringer`), and
 * the Knife's rest and readying (7H) can no longer fire; they stay with GDD 3.20's text and data for 10X to retire.
 */

/** The quest id of an accepted contract; it has no `quests.json` row (a mail, not a giver's work). */
export const CONTRACT_QUEST = 'contract';

interface Contract {
  target: string;
  accepted: boolean;
}

/** Each Hitman's contract, by seat. Room memory keyed by the match's `MatchSeeds`. */
const contracts = new WeakMap<object, Map<string, Contract>>();

function contractsOf(room: PartyRoom): Map<string, Contract> {
  let m = contracts.get(room.seeds);
  if (!m) contracts.set(room.seeds, (m = new Map()));
  return m;
}

/** The seat's contract while it is open (offered, neither done nor lapsed), else null. */
export function openContract(room: PartyRoom, seat: string): Contract | null {
  const c = contractsOf(room).get(seat);
  return c && !progressOf(room, seat).over ? c : null;
}

const living = (room: PartyRoom, seat: string): boolean => {
  const p = simOf(room).players.get(seat);
  return p !== undefined && !p.dead;
};

/**
 * Mails `seat` its mark, once, at the Hitman's turning (round 10, C4a): a living human outside the
 * holder's Cabal when one is free (gdd-map 3.20), else any other living seat, drawn on `contract` keyed by the seat.
 */
export function offerContract(room: PartyRoom, seat: string): void {
  const held = contractsOf(room);
  if (held.has(seat) || progressOf(room, seat).over || !living(room, seat)) return;
  const mates = new Set(room.state.players.get(seat)?.priv?.cabalMates ?? []);
  const pool = [...room.state.players.keys()].filter(
    (id) => id !== seat && !mates.has(id) && living(room, id),
  );
  const humans = pool.filter((id) => !isNpcSeat(room, id));
  const from = humans.length > 0 ? humans : pool;
  if (from.length === 0) {
    emitStep(room, seat, 'vendetta.contract.lapsed');
    progressOf(room, seat).over = true;
    return;
  }
  const target = from[Math.floor(room.seeds.get('contract', seat)() * from.length)]!;
  held.set(seat, { target, accepted: false });
  addNote(room, seat, NoteKind.contract, target);
  emitStep(room, seat, 'vendetta.contract.offered');
  if (isNpcSeat(room, seat)) accept(room, seat);
}

/** Accepts the seat's open contract if it is not yet (the Derringer's shot, C4b); returns whether it is accepted. */
export function acceptOpenContract(room: PartyRoom, seat: string): boolean {
  return openContract(room, seat)?.accepted === true || accept(room, seat);
}

function accept(room: PartyRoom, seat: string): boolean {
  const c = openContract(room, seat);
  const player = room.state.players.get(seat);
  if (!c || c.accepted || !player?.priv || !living(room, seat)) return false;
  c.accepted = true;
  const state = new QuestState();
  state.id = CONTRACT_QUEST;
  state.progress = 0;
  state.done = false;
  player.priv.quests.push(state);
  emitStep(room, seat, 'vendetta.contract.accepted');
  return true;
}

/** The Hitman's contract lapses unpaid (no kill by its last day's Dusk Train, C4b): the quest leaves its list. */
export function lapseContract(room: PartyRoom, seat: string): void {
  if (!openContract(room, seat)) return;
  const priv = room.state.players.get(seat)?.priv;
  const quest = priv?.quests.find((q) => q.id === CONTRACT_QUEST);
  if (quest && priv) priv.quests.splice(priv.quests.indexOf(quest), 1);
  emitStep(room, seat, 'vendetta.contract.lapsed');
  progressOf(room, seat).over = true;
}

/** `quest.accept {questId:'contract'}`: from anywhere, for the holder of an open contract; anyone else is refused. */
export function acceptContract(room: PartyRoom, sessionId: string): void {
  if (!accept(room, sessionId)) reject(room, sessionId, 'BAD_REQUEST');
}

/** The bus's `kill` (a landed strike, `seat` the victim, `data.by` the striker): the rest off the target. */
export function onKillContract(room: PartyRoom, e: SimEvent): void {
  const by = e.data?.by;
  if (typeof by !== 'string') return;
  const c = openContract(room, by);
  if (!c?.accepted || e.seat === c.target || !living(room, c.target)) return;
  const cd = room.state.players.get(by)?.priv?.cooldownEndTick;
  if (cd)
    cd.set(
      'kill',
      (cd.get('kill') ?? room.state.tick) + balance.vendettas.contract.offTargetRestS * TICK_RATE,
    );
}

/** The bus's `death`: a target killed by its accepted Hitman's Knife completes the contract; any other death ends it. */
export function onDeathContract(room: PartyRoom, e: SimEvent): void {
  for (const [seat, c] of contractsOf(room)) {
    if (e.seat !== c.target || !openContract(room, seat)) continue;
    const player = room.state.players.get(seat);
    const quest = player?.priv?.quests.find((q) => q.id === CONTRACT_QUEST);
    if (c.accepted && e.data?.by === seat && (e.data?.cause === 'derringer' || e.data?.cause === 'knife')) {
      if (quest) quest.done = true;
      player?.priv?.cooldownEndTick.set('kill', room.state.tick);
      emitStep(room, seat, 'vendetta.contract.done');
      continue;
    }
    if (quest && player?.priv) player.priv.quests.splice(player.priv.quests.indexOf(quest), 1);
    emitStep(room, seat, 'vendetta.contract.lapsed');
    progressOf(room, seat).over = true;
  }
}
