import { ErrorCode, type PlayerState, type RoleRevealPayload } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { resetAvatarsForLobby } from './Avatars';
import { refuse } from './Flow';

// The role card in both modes, the cover pick and the public look (GDD 3.17, round-5 `deck/wire.md` 4.4).
// Session 5F owns this file; the round-5 pre-seed holds the hooks below with stub bodies, called from their locked
// sites in `rooms/handlers/lobby.ts`, `sim/Win.ts` and `sim/npc/meeting.ts` (wire.md 8.1). Ready on the card
// becomes private (`flow.cardReady`) when 5F fills `markCardReady` and `allCardReady`.

/** The main-mode card fields `roleReveal` gains: the deck, the look, the portrait and a cover role's hints. */
export type MainRevealFields = Pick<RoleRevealPayload, 'deck' | 'look' | 'portrait' | 'coverHints'>;

/**
 * `role.cover {lookId}` (`runLobbyCommands`): a cover role picks the look it walks as, during the role card only.
 * Pre-seed stub: refused 425, since no cover role exists until 5F lands.
 */
export function handleCoverPick(room: PartyRoom, seat: string, payload: Record<string, unknown>): void {
  void payload;
  refuse(room, seat, ErrorCode.wrongPhase, 'not now');
}

/**
 * The seat dismissed its role card (`lobby.ready {ready: true}` or `role.ready` during `roleReveal`, both modes;
 * the NPC card-ready of `readyOnRoleCard`). Pre-seed stub: writes `player.ready = true`, as today.
 */
export function markCardReady(room: PartyRoom, seat: string): void {
  const player = room.state.players.get(seat);
  if (player) player.ready = true;
}

/**
 * Whether every living, connected seat has dismissed its card (`runLobbyPhase`). Pre-seed stub: every living,
 * connected seat's `player.ready` is true, as today.
 */
export function allCardReady(room: PartyRoom): boolean {
  let everyoneReady = true;
  room.state.players.forEach((p: PlayerState) => {
    if (p.alive && p.connected && !p.ready) everyoneReady = false;
  });
  return everyoneReady;
}

/**
 * After the main-mode deal (`startMatch`): the cover hints (`coverHints` of `rules/deck.ts`) from `flow.deck` and
 * `flow.undealt`, each cover seat's `priv.coverLook` and the Cabal cover seats' `priv.mateLooks`. Pre-seed stub:
 * no-op (until 5G's `dealMainDeck` lands there is no deck to read).
 */
export function assignCovers(room: PartyRoom, dealt: ReadonlyMap<string, string>): void {
  void room;
  void dealt;
}

/** The main-mode fields of `seat`'s role card (`startMatch`, beside `buildRoleReveal`). Pre-seed stub: `{}`. */
export function mainRevealFields(room: PartyRoom, seat: string): MainRevealFields {
  void room;
  void seat;
  return {};
}

/**
 * `beginPlay` (main mode), before grace: every seat's `Player.look` in one loop (a cover role's pick, else its
 * card's look). Pre-seed stub: no-op, every look stays ''.
 */
export function publishLooks(room: PartyRoom): void {
  void room;
}

/**
 * `resetToLobby`: the looks, the private round-5 fields (`sceneId`, `avatar`, `coverLook`, `mateLooks`), every
 * avatar and disguise, the hints and `flow.cardReady`. Pre-seed stub: no-op.
 */
export function resetCoversForLobby(room: PartyRoom): void {
  resetAvatarsForLobby(room);
}
