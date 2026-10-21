import { onubBalance, onubFor, onubRoles } from '@wdi/content';
import {
  ErrorCode,
  LOFT_SCENE_INDEX,
  ONUB_PREP,
  Phase,
  type PlayerState,
  type RoleRevealPayload,
  S2C,
  TRAIT_IDS,
  Team,
  type TeamId,
  dealOnub,
  dealPantryLocs,
  dealTraits,
  onubDeckProblem,
} from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { flowOf, refuse, setPhase } from './Flow';
import { handleOnubAct } from './onub/Acts';
import { handlePrep } from './onub/Prep';
import { clearOnub, createOnubState, isOnub, onubOf, setOnub } from './onub/state';
import { simOf } from './RoomSim';

// Quick mode, ONUB v2 (GDD 3.11, ARCHITECTURE 5.14): the deal, the role cards and the hooks the lobby flow and
// the verbs call. Session 5A owns this file; the pre-seed holds the hooks of contract 4.3 with stub bodies, except
// the `handleOnubAbility` dispatcher, which is locked. The match memory is `sim/onub/state.ts`; every random draw
// comes from the match's streams (`room.seeds`, `sim/seeds.ts`), never from a shared rng.

/** The deck check's view of `roles.onub.json`. */
const deckRoles = onubRoles.roles;

/** The deck in play: the leader's custom deck, or the party size's default (`onubFor(n).deck`). */
export function onubDeckInPlay(room: PartyRoom, partySize: number): string[] {
  const custom = [...room.state.settings.onubDeck];
  return custom.length > 0 ? custom : [...onubFor(partySize).deck];
}

/**
 * The seats `debug.deal` fixes keep their card; the rest of the deck goes to the other seats and the Pantry by the
 * `deal` stream. A fixed id unknown to `roles.onub.json` is dropped; one the deck lacks takes the place of the last
 * card of what is left.
 */
function dealWithFixed(
  room: PartyRoom,
  ids: readonly string[],
  deck: readonly string[],
): { dealt: Map<string, string>; pantry: string[] } {
  const flow = flowOf(room);
  const fixed = flow.fixedDeal;
  flow.fixedDeal = null;
  const rng = room.seeds.get('deal');
  if (!fixed) return dealOnub(ids, deck, rng);
  const rest = [...deck];
  const taken = new Map<string, string>();
  for (const id of ids) {
    const roleId = fixed[id];
    if (roleId === undefined || deckRoles[roleId] === undefined) continue;
    taken.set(id, roleId);
    const at = rest.includes(roleId) ? rest.indexOf(roleId) : rest.length - 1;
    rest.splice(at, 1);
  }
  const free = ids.filter((id) => !taken.has(id));
  const { dealt: dealtRest, pantry } = dealOnub(free, rest, rng);
  const dealt = new Map<string, string>();
  for (const id of ids) dealt.set(id, taken.get(id) ?? (dealtRest.get(id) as string));
  return { dealt, pantry };
}

/** The quick-mode role card, built from `roles.onub.json` (`buildRoleReveal` is main-mode only). */
export function onubRoleReveal(
  roleId: string,
  look: { height: number; scarf: number; hat: number },
): RoleRevealPayload {
  const role = deckRoles[roleId];
  if (!role) throw new Error(`unknown quick-mode role ${roleId}`);
  const team = onubRoles.teams[role.team];
  return {
    roleId: role.id,
    team: (team?.faction ?? 'village') as TeamId,
    goal: team?.goal ?? '',
    abilities: [],
    inventory: [],
    cardText: role.cardText,
    beware: onubRoles.cardLine,
    teammates: [],
    traits: {
      height: TRAIT_IDS.height[look.height] ?? TRAIT_IDS.height[1],
      scarf: TRAIT_IDS.scarf[look.scarf] ?? TRAIT_IDS.scarf[0],
      hat: TRAIT_IDS.hat[look.hat] ?? TRAIT_IDS.hat[2],
    },
    teamName: team?.name ?? '',
  };
}

/**
 * The quick-mode deal and role cards (GDD 3.11): called by `startMatch` before the main deal; returns false
 * outside quick mode so the main deal runs. The only refusal is the deck check (DECISIONS A51): the deck in play
 * must hold the party size, NPC fill included, plus `pantry.roles` cards. Deals from `room.seeds` (`deal`, then
 * `traits`) and honours `debug.deal`.
 */
export function startOnubMatch(room: PartyRoom, ids: readonly string[]): boolean {
  if (!isOnub(room)) return false;
  const deck = onubDeckInPlay(room, ids.length);
  if (onubDeckProblem(deck, deckRoles, ids.length + onubBalance.pantry.roles) !== null) {
    refuse(room, room.state.leaderId, ErrorCode.cannot, 'bad deck');
    return true;
  }
  const { dealt, pantry } = dealWithFixed(room, ids, deck);
  const pantryLocs = dealPantryLocs(
    onubBalance.stations.map((s) => s.id),
    onubBalance.pantry.locations,
    room.seeds.get('deal'),
  );
  const looks = dealTraits(ids, room.seeds.get('traits'));
  setOnub(room, createOnubState(ids, deck, dealt, pantry, pantryLocs));

  const board = room.state.onub;
  board.seats.clear();
  board.deck.clear();
  for (const id of ids) board.seats.push(id);
  for (const card of deck) board.deck.push(card);

  for (const id of ids) {
    const player = room.state.players.get(id) as PlayerState;
    const roleId = dealt.get(id) as string;
    const look = looks.get(id) as { height: number; scarf: number; hat: number };
    player.traits.height = look.height;
    player.traits.scarf = look.scarf;
    player.traits.hat = look.hat;
    player.alive = true;
    player.ready = false;
    const priv = player.priv;
    if (!priv) continue;
    priv.role.roleId = roleId;
    priv.role.team = Team[onubRoleReveal(roleId, look).team];
    priv.cabalMates.clear(); // quick mode learns teammates at night, as `nightReveal` rows
    priv.inventory.slots.clear();
    priv.nightReveal.clear();
    priv.onubLoc = '';
    priv.onubCard = '';
    priv.myVote = '';
  }

  void room.lock();
  setPhase(room, Phase.roleReveal, onubBalance.timers.roleCardS);
  for (const id of ids) {
    const look = looks.get(id) as { height: number; scarf: number; hat: number };
    room.clients.getById(id)?.send(S2C.roleReveal, onubRoleReveal(dealt.get(id) as string, look));
  }
  return true;
}

/**
 * roleReveal -> dusk in quick mode (GDD 3.11): called by `beginPlay` first; false lets the main grace start. Nobody
 * walks: every seat is placed in the loft pseudo-scene for the rest of the match, in the sim and on the wire
 * (`Player.sceneId` until 5F removes it, and `Private.sceneId`).
 */
export function beginOnubPlay(room: PartyRoom): boolean {
  if (!isOnub(room) || !onubOf(room)) return false;
  const state = room.state;
  const sim = simOf(room);
  state.round = 0;
  state.startTick = state.tick;
  state.players.forEach((player: PlayerState, id: string) => {
    player.ready = false;
    const p = sim.ensure(id);
    p.sceneIdx = LOFT_SCENE_INDEX;
    p.placed = true;
    if (player.priv) player.priv.sceneId = LOFT_SCENE_INDEX;
  });
  sim.viewsDirty = true;
  setPhase(room, Phase.dusk, onubBalance.timers.prepS);
  return true;
}

/**
 * `act.ability` with an `onub.*` id (`handleAbility`, `sim/Actions.ts`): the prep commit goes to `handlePrep`,
 * every other id to `handleOnubAct`. Locked for round 5.
 */
export function handleOnubAbility(
  room: PartyRoom,
  sessionId: string,
  payload: Record<string, unknown>,
): void {
  if (!isOnub(room)) return refuse(room, sessionId, ErrorCode.cannot, 'cannot do that');
  if (payload.abilityId === ONUB_PREP) return handlePrep(room, sessionId, payload);
  handleOnubAct(room, sessionId, payload);
}

/**
 * `lobby.settings {onubDeck}`: the deck to store, or null when it is not an array of strings or
 * `onubDeckProblem` (without the size) finds a problem. `[]` stores the default (`onubFor(n).deck`).
 */
export function onubDeckSetting(deck: unknown): string[] | null {
  if (!Array.isArray(deck) || !deck.every((id): id is string => typeof id === 'string')) return null;
  if (deck.length === 0) return [];
  return onubDeckProblem(deck, deckRoles) === null ? [...deck] : null;
}

/**
 * Called by `resetToLobby`: clears the match memory and every field of `GameState.onub`, never
 * `Settings.onubDeck`.
 */
export function resetOnubForLobby(room: PartyRoom): void {
  clearOnub(room);
  const board = room.state.onub;
  board.seats.clear();
  board.deck.clear();
  board.piles.clear();
  board.ruinWeight = 0;
  board.ruined = false;
  board.perk = false;
  board.cloche = '';
  board.window = '';
}
