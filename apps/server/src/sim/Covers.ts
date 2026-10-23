import { looks, roles } from '@wdi/content';
import { ErrorCode, Phase, type PlayerState, type RoleRevealPayload, coverHints } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { resetAvatarsForLobby } from './Avatars';
import { flowOf, refuse } from './Flow';

// The role card in both modes, the cover pick and the public look (GDD 3.17, round-5 `deck-wire.md` 4.4). Ready on
// the card is private (`flow.cardReady`), the cover roles' hints are computed once at the deal, and every seat's
// `Player.look` goes public in one loop when the card closes.

/** The main-mode card fields `roleReveal` gains: the deck, the look, the portrait and a cover role's hints. */
export type MainRevealFields = Pick<RoleRevealPayload, 'deck' | 'look' | 'portrait' | 'coverHints'>;

/** Room memory (never a schema): each cover seat's hints, first hint first. */
const hintMemory = new WeakMap<PartyRoom, Map<string, string[]>>();
const hintsOf = (room: PartyRoom): Map<string, string[]> => {
  let hints = hintMemory.get(room);
  if (!hints) hintMemory.set(room, (hints = new Map()));
  return hints;
};

const isCover = (card: string): boolean => roles.roles[card]?.cover === true;
const isCabal = (card: string): boolean => roles.roles[card]?.faction === 'cabal';
/** The look id a card walks as, or '' for a card with no character. */
const lookIdOf = (card: string): string => roles.roles[card]?.look ?? '';

/**
 * `role.cover {lookId}` (`runLobbyCommands`): a cover role picks the look it walks as, during the role card only. A
 * pick equal to a dealt seat's look is allowed (a visible counter-claim); only a look a Cabal mate wears is refused,
 * and the Drifter has no mates, so no refusal ever tells one side what the other picked.
 */
export function handleCoverPick(room: PartyRoom, seat: string, payload: Record<string, unknown>): void {
  const priv = room.state.players.get(seat)?.priv;
  if (!priv) return;
  if (room.state.phase !== Phase.roleReveal) return refuse(room, seat, ErrorCode.wrongPhase, 'not now');
  if (!isCover(priv.role.roleId)) return refuse(room, seat, ErrorCode.cannot, 'cannot do that');
  const lookId = payload.lookId;
  const pickable = flowOf(room)
    .deck.filter((card) => !isCover(card))
    .map(lookIdOf);
  if (typeof lookId !== 'string' || !pickable.includes(lookId)) {
    return refuse(room, seat, ErrorCode.cannot, 'cannot do that');
  }
  const mates = [...priv.cabalMates];
  if (mates.some((mate) => room.state.players.get(mate)?.priv.coverLook === lookId)) {
    return refuse(room, seat, ErrorCode.cannot, 'a teammate wears that');
  }
  priv.coverLook = lookId;
  for (const mate of mates) room.state.players.get(mate)?.priv.mateLooks.set(seat, lookId);
}

/**
 * The seat dismissed its role card (`lobby.ready {ready: true}` or `role.ready` during `roleReveal`, both modes; the
 * NPC card-ready of `readyOnRoleCard`). Held in room memory, so a long pick tells nobody anything (GDD 3.17).
 */
export function markCardReady(room: PartyRoom, seat: string): void {
  if (room.state.players.has(seat)) flowOf(room).cardReady.add(seat);
}

/** Whether every living, connected seat has dismissed its card (`runLobbyPhase`). */
export function allCardReady(room: PartyRoom): boolean {
  const ready = flowOf(room).cardReady;
  let everyone = true;
  room.state.players.forEach((p: PlayerState, id: string) => {
    if (p.alive && p.connected && !ready.has(id)) everyone = false;
  });
  return everyone;
}

/**
 * After the main-mode deal (`startMatch`): the cover hints (`coverHints` of `rules/deck.ts`) from `flow.deck` and
 * `flow.undealt`, each cover seat's preset `priv.coverLook` (its first hint's look) and every Cabal cover seat's
 * `priv.mateLooks`. Nothing happens until the deck deal (`dealMainDeck`, 5G) has filled the deck.
 */
export function assignCovers(room: PartyRoom, dealt: ReadonlyMap<string, string>): void {
  const flow = flowOf(room);
  const memory = hintsOf(room);
  memory.clear();
  if (flow.deck.length === 0) return;
  const hints = coverHints(dealt, flow.undealt, flow.deck, isCover, isCabal);
  for (const [seat, list] of hints) {
    memory.set(seat, list);
    const priv = room.state.players.get(seat)?.priv;
    if (priv) priv.coverLook = lookIdOf(list[0] as string);
  }
  for (const seat of hints.keys()) {
    const priv = room.state.players.get(seat)?.priv;
    if (!priv) continue;
    for (const mate of priv.cabalMates) {
      const mateLook = room.state.players.get(mate)?.priv.coverLook;
      if (mateLook) priv.mateLooks.set(mate, mateLook);
    }
  }
}

/** The deck fields of `seat`'s role card (`startMatch`, beside `buildRoleReveal`). */
export function mainRevealFields(room: PartyRoom, seat: string): MainRevealFields {
  const flow = flowOf(room);
  const priv = room.state.players.get(seat)?.priv;
  if (flow.deck.length === 0 || !priv) return {};
  const card = roles.roles[priv.role.roleId];
  const portrait = looks.looks[card?.look ?? '']?.portrait;
  const hints = hintsOf(room).get(seat);
  return {
    deck: [...flow.deck],
    look: isCover(priv.role.roleId) ? priv.coverLook : lookIdOf(priv.role.roleId),
    ...(portrait !== undefined && { portrait }),
    ...(hints !== undefined && { coverHints: [...hints] }),
  };
}

/**
 * `beginPlay` (main mode), before grace: every seat's `Player.look` in one loop (a cover role's pick, else its
 * card's look), the only write of the looks until the lobby. A seat with no character stays ''.
 */
export function publishLooks(room: PartyRoom): void {
  room.state.players.forEach((player: PlayerState) => {
    const priv = player.priv;
    if (!priv) return;
    const role = priv.role.roleId;
    player.look = isCover(role) ? priv.coverLook : lookIdOf(role);
  });
}

/**
 * `resetToLobby`: the looks, the private round-5 fields (`sceneId`, `avatar`, `coverLook`, `mateLooks`), every
 * avatar and disguise, the hints and `flow.cardReady`.
 */
export function resetCoversForLobby(room: PartyRoom): void {
  resetAvatarsForLobby(room);
  hintsOf(room).clear();
  flowOf(room).cardReady.clear();
  room.state.players.forEach((player: PlayerState) => {
    player.look = '';
    const priv = player.priv;
    if (!priv) return;
    priv.sceneId = 0;
    priv.avatar = '';
    priv.coverLook = '';
    priv.mateLooks.clear();
  });
}
