import { onubBalance, onubRoles } from '@wdi/content';
import {
  ErrorCode,
  type NightRevealEntry,
  OnubPile,
  type OnubCommit,
  type OnubPrepStreams,
  Phase,
  type PlayerState,
  S2C,
  NightReveal,
  prepCommitProblem,
  resolvePrep,
  tableAtNight,
  timeoutCommit,
} from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { refuse, setPhase } from '../Flow';
import { onubOf } from './state';

// Evening Prep (GDD 3.11 "Evening Prep", ARCHITECTURE 5.14): the `onub.prep` commit, the prep clock and the end
// of prep. Session 5A owns this file; the pre-seed holds the signatures of contract 4.3 with stub bodies.

/**
 * `act.ability {abilityId: 'onub.prep', targets: [stationId, cardId]}`, from `handleOnubAbility`: once per seat
 * in `Phase.dusk` (425 outside it; 422 for a second commit, `prepCommitProblem` or malformed `targets`).
 */
export function handlePrep(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): void {
  const o = onubOf(room);
  if (!o || room.state.phase !== Phase.dusk) return refuse(room, sessionId, ErrorCode.wrongPhase, 'not now');
  const dealt = o.dealt.get(sessionId);
  const targets = payload.targets;
  if (
    dealt === undefined ||
    o.commits.has(sessionId) ||
    !Array.isArray(targets) ||
    targets.length !== 2 ||
    !targets.every((t): t is string => typeof t === 'string')
  ) {
    return refuse(room, sessionId, ErrorCode.cannot, 'cannot do that');
  }
  const [station, card] = targets as [string, string];
  const sabotages = onubRoles.roles[dealt as keyof typeof onubRoles.roles]?.sabotages ?? false;
  if (prepCommitProblem({ station, card }, onubBalance.stations, sabotages) !== null) {
    return refuse(room, sessionId, ErrorCode.cannot, 'cannot do that');
  }
  // Nothing public changes: no ready tick, no count (GDD 3.11). Only the seat's own private view learns it.
  setCommit(room, sessionId, { station, card });
}

/** Records a seat's prep (its own, or the server's at timeout) in room memory and in that seat's private view. */
function setCommit(room: PartyRoom, seatId: string, commit: OnubCommit): void {
  const o = onubOf(room);
  if (!o) return;
  o.commits.set(seatId, commit);
  const priv = room.state.players.get(seatId)?.priv;
  if (priv) {
    priv.onubLoc = commit.station;
    priv.onubCard = commit.card;
  }
}

/**
 * Each tick in `Phase.dusk` (`runOnubPhases`): ends prep at `phaseEndsTick`, or early when every seat has
 * committed and `prep.endsWhenAllCommitted`.
 */
export function runPrep(room: PartyRoom): void {
  const o = onubOf(room);
  if (!o || o.prep || room.state.phase !== Phase.dusk) return;
  const everyoneIn =
    onubBalance.prep.endsWhenAllCommitted &&
    o.seats.some((id) => room.state.players.has(id)) &&
    o.seats.every((id) => o.commits.has(id) || !room.state.players.has(id));
  if (room.state.tick >= room.state.phaseEndsTick || everyoneIn) endPrep(room);
}

/**
 * The three match streams `resolvePrep` draws from (contract 4.1, `deck/wire.md` 2.2): `piles` the public order
 * of each pile, `thaw` the card each Thermostat Flip discards (secret until game over), `perk` the Pantry Location
 * the proofing visitors see (private to them). Pre-seeded and implemented; `endPrep` passes it to `resolvePrep`.
 */
export function prepStreams(room: PartyRoom): OnubPrepStreams {
  return { piles: room.seeds.get('piles'), thaw: room.seeds.get('thaw'), perk: room.seeds.get('perk') };
}

/**
 * The end of prep (`runPrep`, `onubClock`): timeout commits (`prepTimeout` stream), `resolvePrep(commits, seats,
 * onubBalance.stations, onubBalance.cards, onubBalance.ruin, onubBalance.pantry.locations, prepStreams(room))`,
 * `o.cards = tableAtNight(...)`, the board's piles, ruin and perk, the perk's `nightReveal` to each proofing
 * visitor, then `Phase.prepReveal` for `prepRevealS`.
 */
export function endPrep(room: PartyRoom): void {
  const o = onubOf(room);
  if (!o || o.prep) return;
  // Every seat of the deal order commits, a seat that left included: its Location card must exist at night.
  for (const id of o.seats) {
    if (o.commits.has(id)) continue;
    setCommit(room, id, timeoutCommit(onubBalance.stations, room.seeds.get('prepTimeout')));
    o.prepAuto.add(id);
  }
  const prep = resolvePrep(
    o.commits,
    o.seats,
    onubBalance.stations,
    onubBalance.cards,
    onubBalance.ruin,
    onubBalance.pantry.locations,
    prepStreams(room),
  );
  o.prep = prep;
  o.cards = tableAtNight(
    o.seats.map((id) => o.dealt.get(id) as string),
    o.seats.map((id) => (o.commits.get(id) as OnubCommit).station),
    o.pantryRolesDealt,
    o.pantryLocsDealt,
  );

  const board = room.state.onub;
  board.piles.clear();
  for (const st of onubBalance.stations) {
    const pile = prep.piles[st.id];
    if (!pile) continue;
    const row = new OnubPile();
    for (const card of pile.cards) row.cards.push(card);
    row.lost = pile.lost.length;
    row.net = pile.net;
    row.underMixed = pile.underMixed;
    board.piles.set(st.id, row);
  }
  board.ruinWeight = prep.ruinWeight;
  board.ruined = prep.ruined;
  board.perk = prep.perk !== null;

  // The proofing perk is private to the seats that proofed (the only messages of this step, O3).
  if (prep.perk) {
    const k = Number(prep.perk.slot.split('.')[2]);
    const entry: NightRevealEntry = {
      slot: prep.perk.slot,
      kind: 'loc',
      value: o.pantryLocsDealt[k] as string,
      of: '',
    };
    for (const id of o.seats) {
      if (o.commits.get(id)?.station !== prep.perk.station) continue;
      const player = room.state.players.get(id) as PlayerState | undefined;
      if (!player) continue;
      const row = new NightReveal();
      row.slot = entry.slot;
      row.kind = entry.kind;
      row.value = entry.value;
      row.of = entry.of;
      player.priv.nightReveal.push(row);
      room.clients.getById(id)?.send(S2C.nightReveal, { entries: [entry] });
    }
  }
  setPhase(room, Phase.prepReveal, onubBalance.timers.prepRevealS);
}
