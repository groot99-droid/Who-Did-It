import { randomInt } from 'node:crypto';
import { MAP_IDS, abilities, balance, cutscenes, items, roles } from '@wdi/content';
import {
  ABILITY_KEYS,
  C2S,
  type ErrorCode,
  Inventory,
  ItemStack,
  NpcLevel,
  Phase,
  Player,
  type PlayerState,
  Presence,
  Private,
  REASON_CODE,
  Role,
  Traits,
  S2C,
  Team,
  TRAIT_IDS,
  dealTraits,
  openingFor,
  type RefusalReason,
  type RoleRevealPayload,
  type TeamId,
} from '@wdi/shared';
import type { PartyRoom } from '../PartyRoom';
import {
  allCardReady,
  assignCovers,
  handleCoverPick,
  mainRevealFields,
  markCardReady,
  publishLooks,
} from '../../sim/Covers';
import { dealMainDeck } from '../../sim/Deck';
import { spawnTownsfolk } from '../../sim/townsfolk/figures';
import { dealTasks } from '../../sim/Tasks';
import { refuse, setPhase } from '../../sim/Flow';
import { handleNote, handleSay } from '../../sim/Chat';
import { handleVote } from '../../sim/Meeting';
import { newestNpcSeat, isNpcSeat, releaseNpcSeat } from '../../sim/Npc';
import { addNpcSeat, fillNpcSeats } from '../../sim/npc/seats';
import { MatchSeeds } from '../../sim/seeds';
import { simOf } from '../../sim/RoomSim';
import { mapIdOfRoom } from '../../sim/MapSites';
import { dealPurses } from '../../sim/economy/purse';
import { settle } from '../../sim/Inventory';
import { clientOf, rekeySeats } from '../../sim/seatIds';

/**
 * Flow messages: the lobby and role-card flow plus the meeting vote and chat (consumed by the phase
 * stage's owner, Session K). Everything else is a world verb and goes to `sim/Commands`. Round 5: the role
 * card's cover pick (`role.cover`, 5F) is a lobby command too.
 *
 * Round 5 (DECISIONS X5): every call in this file to `sim/Covers.ts` (5F), `sim/Deck.ts` (5G) and
 * `sim/npc/seats.ts` (5H) is a locked call site; the sessions fill the bodies in their own files.
 */
const LOBBY_TYPES: readonly string[] = [
  C2S.lobbyStart,
  C2S.lobbyReady,
  C2S.roleReady,
  C2S.coverPick,
  C2S.vote,
  C2S.say,
  C2S.note, // round 8, 8T (6Z's grant)
  C2S.lobbySettings,
  C2S.lobbyAddNpc,
  C2S.lobbyRemoveNpc,
];
export const isLobbyCommand = (type: string): boolean => LOBBY_TYPES.includes(type);

/** The private card for one player, built from `roles.json`, `abilities.json` and `items.json`. */
export function buildRoleReveal(
  roleId: string,
  traitIdx: { height: number; scarf: number; hat: number },
  partySize: number,
  teammates: { id: string; name: string }[],
): RoleRevealPayload {
  const role = roles.roles[roleId];
  if (!role) throw new Error(`unknown role ${roleId}`);
  const row = balance.byCount[String(Math.min(10, Math.max(4, partySize))) as '4'];
  const abilityRows = role.abilities
    .map((id) => abilities.abilities[id])
    .filter((a): a is NonNullable<typeof a> => !!a && (a.minPlayers ?? 0) <= partySize)
    .map((a, i) => ({
      id: a.id,
      name: a.name,
      key: ABILITY_KEYS[i] ?? '',
      cooldown: a.id === 'kill' ? row.killCooldownS : (a.cooldownS ?? 0),
      uses: a.usesPerMatch ?? null,
    }));
  return {
    roleId: role.id,
    team: role.faction,
    goal: role.goal,
    abilities: abilityRows,
    inventory: role.startKit.map((k) => {
      const item = items.items[k.item];
      return { defId: k.item, name: item?.name ?? k.item, qty: k.qty, tooltip: item?.tooltip ?? '' };
    }),
    cardText: role.cardText,
    beware: role.beware,
    teammates,
    traits: {
      height: TRAIT_IDS.height[traitIdx.height] ?? TRAIT_IDS.height[1],
      scarf: TRAIT_IDS.scarf[traitIdx.scarf] ?? TRAIT_IDS.scarf[0],
      hat: TRAIT_IDS.hat[traitIdx.hat] ?? TRAIT_IDS.hat[2],
    },
  };
}

/** Why Start is refused, or null. A non-leader always gets `NOT_LEADER`, whatever the phase. */
export function startRefusalReason(room: PartyRoom, sessionId: string): RefusalReason | null {
  if (room.state.leaderId !== sessionId) return 'NOT_LEADER';
  if (room.state.phase !== Phase.lobby) return 'LOBBY_ONLY';
  let humans = 0;
  room.state.players.forEach((p: PlayerState, id: string) => {
    if (p.connected && !isNpcSeat(room, id)) humans++;
  });
  // Round 6 (docs/round6/auto-admin.md 3, locked): an auto match has no human and needs none.
  if (simOf(room).auto === null && humans < balance.lobby.startMinHumans) return 'LOBBY_RULE';
  return null;
}

/** The legacy code of `startRefusalReason`, or null. */
export function startRefusal(room: PartyRoom, sessionId: string): ErrorCode | null {
  const reason = startRefusalReason(room, sessionId);
  return reason === null ? null : REASON_CODE[reason];
}

/** Consumed inside the fixed step; nothing here runs in a message callback. */
export function runLobbyCommands(room: PartyRoom): void {
  for (const cmd of room.lobbyCommands.drain()) {
    const player = room.state.players.get(cmd.sessionId);
    if (!player) continue;
    const payload = (cmd.payload ?? {}) as Record<string, unknown>;
    switch (cmd.type) {
      case C2S.lobbyStart: {
        const refusal = startRefusalReason(room, cmd.sessionId);
        if (refusal === 'LOBBY_RULE')
          refuse(room, cmd.sessionId, refusal, { rule: 'tooFewHumans' }, { msg: 'cannot start' });
        else if (refusal !== null) refuse(room, cmd.sessionId, refusal, undefined, { msg: 'cannot start' });
        else startMatch(room);
        break;
      }
      case C2S.lobbyReady:
        // On the role card Ready only dismisses the card, privately once 5F lands (`markCardReady`, GDD 3.17).
        if (room.state.phase === Phase.roleReveal) {
          if (payload.ready === true) markCardReady(room, cmd.sessionId);
        } else if (typeof payload.ready === 'boolean' && room.state.phase === Phase.lobby) {
          player.ready = payload.ready;
        }
        break;
      case C2S.roleReady:
        if (room.state.phase === Phase.roleReveal) markCardReady(room, cmd.sessionId);
        else if (room.state.phase === Phase.lobby) player.ready = true;
        break;
      case C2S.coverPick:
        handleCoverPick(room, cmd.sessionId, payload);
        break;
      case C2S.vote:
        handleVote(room, cmd.sessionId, payload);
        break;
      case C2S.say:
        handleSay(room, cmd.sessionId, payload);
        break;
      case C2S.note: // round 8, 8T (6Z's grant): the meeting notes (GDD 3.8)
        handleNote(room, cmd.sessionId, payload);
        break;
      case C2S.lobbySettings:
        handleSettings(room, cmd.sessionId, payload);
        break;
      case C2S.lobbyAddNpc:
        handleAddNpc(room, cmd.sessionId);
        break;
      case C2S.lobbyRemoveNpc:
        handleRemoveNpc(room, cmd.sessionId);
        break;
    }
  }
}

/** The seat constructor shared by `PartyRoom.onJoin` and the NPC seats: a connected, empty lobby seat. */
export function newSeat(room: PartyRoom, id: string, name: string): PlayerState {
  const player = new Player();
  player.id = id;
  player.name = name;
  player.connected = true;
  player.traits = new Traits();
  player.presence = new Presence();
  player.priv = new Private();
  player.priv.role = new Role();
  player.priv.inventory = new Inventory();
  room.state.players.set(id, player);
  return player;
}

/** Drops the most recently added NPC seat; false when there is none. */
export function removeNewestNpcSeat(room: PartyRoom): boolean {
  const id = newestNpcSeat(room);
  if (id === undefined) return false;
  room.state.players.delete(id);
  releaseNpcSeat(room, id);
  return true;
}

/**
 * `lobby.settings {npcDifficulty?, map?}`: leader, lobby; every field is checked before any is written, all or
 * nothing (GDD 3.12, 3.13, A39, A41). `map` is a map id of `MAP_IDS`.
 */
function handleSettings(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): void {
  if (room.state.leaderId !== sessionId)
    return refuse(room, sessionId, 'NOT_LEADER', undefined, { msg: 'cannot change settings' });
  if (room.state.phase !== Phase.lobby)
    return refuse(room, sessionId, 'LOBBY_ONLY', undefined, { msg: 'not now' });
  const { npcDifficulty, map } = payload;
  const settings = room.state.settings;
  const levels: unknown[] = Object.values(NpcLevel);
  const badLevel =
    npcDifficulty !== undefined &&
    (!levels.includes(npcDifficulty) || settings.npcSeats < balance.npc.difficultyMinNpcs);
  const badMap = map !== undefined && !(MAP_IDS as readonly unknown[]).includes(map);
  if (badLevel || badMap) return refuse(room, sessionId, 'BAD_REQUEST', undefined, { msg: 'bad setting' });
  if (typeof npcDifficulty === 'number') settings.npcDifficulty = npcDifficulty;
  if (typeof map === 'string') settings.map = map;
}

/** `lobby.addNpc`: leader, lobby, below `players.max`. */
function handleAddNpc(room: PartyRoom, sessionId: string): void {
  if (room.state.leaderId !== sessionId)
    return refuse(room, sessionId, 'NOT_LEADER', undefined, { msg: 'cannot add' });
  if (room.state.phase !== Phase.lobby)
    return refuse(room, sessionId, 'LOBBY_ONLY', undefined, { msg: 'not now' });
  if (addNpcSeat(room, room.seeds.get('npcNames')) === null) {
    refuse(room, sessionId, 'LOBBY_RULE', { rule: 'full' }, { msg: 'party is full' });
  }
}

/** `lobby.removeNpc`: leader, lobby; removes the most recently added NPC seat (it never names one). */
function handleRemoveNpc(room: PartyRoom, sessionId: string): void {
  if (room.state.leaderId !== sessionId)
    return refuse(room, sessionId, 'NOT_LEADER', undefined, { msg: 'cannot remove' });
  if (room.state.phase !== Phase.lobby)
    return refuse(room, sessionId, 'LOBBY_ONLY', undefined, { msg: 'not now' });
  if (!removeNewestNpcSeat(room))
    refuse(room, sessionId, 'LOBBY_RULE', { rule: 'noNpcSeats' }, { msg: 'no NPC seats' });
}

/** Phase timers owned by the lobby flow: the role card ends when all are Ready or the card time elapses. */
export function runLobbyPhase(room: PartyRoom): void {
  if (room.state.phase !== Phase.roleReveal) return;
  if (allCardReady(room) || room.state.tick >= room.state.phaseEndsTick) beginPlay(room);
}

/** lobby -> roleReveal: deal roles and traits, write the private state, send each card to its owner. */
export function startMatch(room: PartyRoom): void {
  // Every draw gets its own crypto-seeded stream, so the public traits and NPC names say nothing about the
  // deal (round-4 review, DECISIONS A49).
  room.seeds = new MatchSeeds(room.fixedSeeds); // `fixedSeeds` is undefined outside tests (`fixSeeds`)
  room.matchSeed = randomInt(2 ** 32);
  // The party fills to `players.min` with NPC seats, named from a stream apart from the deal's (GDD 3.12).
  fillNpcSeats(room, room.seeds.get('npcNames'));
  rekeySeats(room); // round 10, W1a: a world match's seats under fresh ids, before anything is dealt (row 25)
  const ids = [...room.state.players.keys()];
  // The deal from the public deck (GDD 3.1).
  const dealt = dealMainDeck(room, ids);
  spawnTownsfolk(room); // round 8, 8E: the ambient figures take their stations (locked call site)
  const looks = dealTraits(ids, room.seeds.get('traits'));
  const factionOf = (id: string) => roles.roles[dealt.get(id) as string]?.faction;

  for (const id of ids) {
    const player = room.state.players.get(id) as PlayerState;
    const roleId = dealt.get(id) as string;
    const look = looks.get(id) as { height: number; scarf: number; hat: number };
    const faction = factionOf(id) as TeamId;
    const priv = player.priv;
    if (!priv) continue;

    player.traits.height = look.height;
    player.traits.scarf = look.scarf;
    player.traits.hat = look.hat;
    player.alive = true;
    player.ready = false;

    priv.role.roleId = roleId;
    priv.role.team = Team[faction];
    const mates = roles.factions[faction].membersKnowEachOther
      ? ids.filter((o) => o !== id && factionOf(o) === faction)
      : [];
    priv.cabalMates.clear();
    for (const mate of mates) priv.cabalMates.push(mate);
    priv.inventory.slots.clear();
    for (const k of roles.roles[roleId]?.startKit ?? []) {
      const stack = new ItemStack();
      stack.defId = k.item;
      stack.qty = k.qty;
      priv.inventory.slots.push(stack);
    }
    settle(player); // round 10, A12: each kit stack in a slot of its own
  }
  // Round 5, 5F: the cover hints, each cover seat's preset `coverLook` and the Cabal mates' `mateLooks`.
  assignCovers(room, dealt);
  dealTasks(room, dealt); // round 7, 7M: every seat's task list, real or fake, on its own stream (GDD 3.5)
  dealPurses(room); // round 8, 8C: purses and banks emptied; the stakes follow the public looks (GDD 3.23)

  void room.lock();
  setPhase(room, Phase.roleReveal, balance.phases.roleRevealS);

  for (const id of ids) {
    const mates = (room.state.players.get(id)?.priv?.cabalMates ?? []).map((m: string) => ({
      id: m,
      name: room.state.players.get(m)?.name ?? '',
    }));
    const look = looks.get(id) as { height: number; scarf: number; hat: number };
    // Round 5, 5F: the main-mode card fields (deck, look, portrait, cover hints) beside the card.
    clientOf(room, id)?.send(S2C.roleReveal, {
      ...buildRoleReveal(dealt.get(id) as string, look, ids.length, mates),
      ...mainRevealFields(room, id),
    });
  }
}

/**
 * roleReveal -> first play phase. Placement is the sim's job: once the phase is a world phase,
 * `placeNewPlayers` (sim/Portals.ts) spreads everyone over the map's start spawns inside the next
 * step and sends the one `sceneEnter`; nothing here touches positions or scenes.
 */
export function beginPlay(room: PartyRoom): void {
  room.state.round = 0;
  room.state.startTick = room.state.tick;
  publishLooks(room); // round 5, 5F: every seat's public look in one tick, before grace
  // Round 6, 6J (locked call site): the map's opening cutscene plays inside grace, which `openingS` lengthens for
  // it; no new phase, and the server never waits for a client (docs/round6/cutscene-music.md 1.2).
  const opening = openingFor(cutscenes, mapIdOfRoom(room));
  if (opening !== null) room.broadcast(S2C.cutscene, { id: opening });
  // Round 7, 7A (A101): grace grows by the opening's own length, its track's (`phases.openingS` is the cap).
  const openingS = opening === null ? 0 : (cutscenes.cutscenes[opening]?.maxS ?? 0);
  setPhase(room, Phase.grace, balance.phases.graceS + openingS);
  room.state.players.forEach((player: PlayerState) => {
    player.ready = false;
  });
}
