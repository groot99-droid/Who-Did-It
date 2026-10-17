import { randomInt } from 'node:crypto';
import { generateId } from '@colyseus/core';
import { abilities, balance, items, roles } from '@wdi/content';
import { names } from '@wdi/content/server';
import {
  ABILITY_KEYS,
  C2S,
  ErrorCode,
  GameMode,
  Inventory,
  ItemStack,
  MAX_PLAYERS,
  NpcLevel,
  Phase,
  Player,
  type PlayerState,
  Presence,
  Private,
  Role,
  Traits,
  type Rng,
  S2C,
  Team,
  TRAIT_IDS,
  assignRoles,
  dealTraits,
  mulberry32,
  pickNpcNames,
  type Roster,
  type RoleRevealPayload,
  type TeamId,
} from '@wdi/shared';
import type { PartyRoom } from '../PartyRoom';
import { flowOf, refuse, setPhase } from '../../sim/Flow';
import { handleSay } from '../../sim/Chat';
import { handleClaim, handleVote } from '../../sim/Meeting';
import { newestNpcSeat, isNpcSeat, registerNpcSeat, releaseNpcSeat } from '../../sim/Npc';
import { beginOnubPlay, onubDeckSetting, startOnubMatch } from '../../sim/Onub';
import { MatchSeeds } from '../../sim/seeds';

/**
 * Flow messages: the lobby and role-card flow plus the meeting vote and chat (consumed by the phase
 * stage's owner, Session K). Everything else is a world verb and goes to `sim/Commands`.
 */
const LOBBY_TYPES: readonly string[] = [
  C2S.lobbyStart,
  C2S.lobbyReady,
  C2S.roleReady,
  C2S.vote,
  C2S.say,
  C2S.lobbySettings,
  C2S.lobbyAddNpc,
  C2S.lobbyRemoveNpc,
  C2S.claim,
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

/** Why Start is refused, or null. A non-leader always gets the generic 422, whatever the phase. */
export function startRefusal(room: PartyRoom, sessionId: string): ErrorCode | null {
  if (room.state.leaderId !== sessionId) return ErrorCode.cannot;
  if (room.state.phase !== Phase.lobby) return ErrorCode.wrongPhase;
  let humans = 0;
  room.state.players.forEach((p: PlayerState, id: string) => {
    if (p.connected && !isNpcSeat(room, id)) humans++;
  });
  if (humans < balance.lobby.startMinHumans) return ErrorCode.cannot;
  return null;
}

/** Consumed inside the fixed step; nothing here runs in a message callback. */
export function runLobbyCommands(room: PartyRoom): void {
  for (const cmd of room.lobbyCommands.drain()) {
    const player = room.state.players.get(cmd.sessionId);
    if (!player) continue;
    const payload = (cmd.payload ?? {}) as Record<string, unknown>;
    switch (cmd.type) {
      case C2S.lobbyStart: {
        const refusal = startRefusal(room, cmd.sessionId);
        if (refusal !== null) refuse(room, cmd.sessionId, refusal, 'cannot start');
        else startMatch(room);
        break;
      }
      case C2S.lobbyReady:
        if (typeof payload.ready === 'boolean' && isReadyPhase(room)) player.ready = payload.ready;
        break;
      case C2S.roleReady:
        if (isReadyPhase(room)) player.ready = true;
        break;
      case C2S.vote:
        handleVote(room, cmd.sessionId, payload);
        break;
      case C2S.say:
        handleSay(room, cmd.sessionId, payload);
        break;
      case C2S.claim:
        handleClaim(room, cmd.sessionId, payload);
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

/** Adds one NPC seat in the lobby: a session-shaped id, connected, ready, a pool name (GDD 3.12). */
export function addNpcSeat(room: PartyRoom, rng: Rng): string | null {
  if (room.state.players.size >= MAX_PLAYERS) return null;
  const taken = [...room.state.players.values()].map((p: PlayerState) => p.name);
  const [name] = pickNpcNames(names.pool, taken, 1, rng);
  const id = generateId();
  newSeat(room, id, name as string).ready = true;
  registerNpcSeat(room, id);
  return id;
}

/** Drops the most recently added NPC seat; false when there is none. */
export function removeNewestNpcSeat(room: PartyRoom): boolean {
  const id = newestNpcSeat(room);
  if (id === undefined) return false;
  room.state.players.delete(id);
  releaseNpcSeat(room, id);
  return true;
}

/** Fills the party up to `players.min` with NPC seats; called by `startMatch` before the deal. */
function fillNpcSeats(room: PartyRoom, rng: Rng): void {
  while (room.state.players.size < balance.players.min) if (addNpcSeat(room, rng) === null) break;
}

/**
 * `lobby.settings {mode?, npcDifficulty?, onubDeck?}`: leader, lobby; every field is checked before any is
 * written, all or nothing (GDD 3.11, 3.12, A39, A41). A mode change drops a pending `debug.deal`, whose role ids
 * belong to the other mode.
 */
function handleSettings(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): void {
  if (room.state.leaderId !== sessionId)
    return refuse(room, sessionId, ErrorCode.cannot, 'cannot change settings');
  if (room.state.phase !== Phase.lobby) return refuse(room, sessionId, ErrorCode.wrongPhase, 'not now');
  const { mode, npcDifficulty, onubDeck } = payload;
  const settings = room.state.settings;
  const modes: unknown[] = Object.values(GameMode);
  const levels: unknown[] = Object.values(NpcLevel);
  const badMode = mode !== undefined && !modes.includes(mode);
  const badLevel =
    npcDifficulty !== undefined &&
    (!levels.includes(npcDifficulty) || settings.npcSeats < balance.npc.difficultyMinNpcs);
  const deck = onubDeck === undefined ? undefined : onubDeckSetting(onubDeck);
  if (badMode || badLevel || deck === null) return refuse(room, sessionId, ErrorCode.cannot, 'bad setting');
  if (typeof mode === 'number' && mode !== settings.mode) {
    settings.mode = mode;
    flowOf(room).fixedDeal = null;
  }
  if (typeof npcDifficulty === 'number') settings.npcDifficulty = npcDifficulty;
  if (deck !== undefined) {
    settings.onubDeck.clear();
    for (const id of deck) settings.onubDeck.push(id);
  }
}

/** `lobby.addNpc`: leader, lobby, below `players.max`. */
function handleAddNpc(room: PartyRoom, sessionId: string): void {
  if (room.state.leaderId !== sessionId) return refuse(room, sessionId, ErrorCode.cannot, 'cannot add');
  if (room.state.phase !== Phase.lobby) return refuse(room, sessionId, ErrorCode.wrongPhase, 'not now');
  if (addNpcSeat(room, mulberry32(randomInt(2 ** 32))) === null) {
    refuse(room, sessionId, ErrorCode.cannot, 'party is full');
  }
}

/** `lobby.removeNpc`: leader, lobby; removes the most recently added NPC seat (it never names one). */
function handleRemoveNpc(room: PartyRoom, sessionId: string): void {
  if (room.state.leaderId !== sessionId) return refuse(room, sessionId, ErrorCode.cannot, 'cannot remove');
  if (room.state.phase !== Phase.lobby) return refuse(room, sessionId, ErrorCode.wrongPhase, 'not now');
  if (!removeNewestNpcSeat(room)) refuse(room, sessionId, ErrorCode.cannot, 'no NPC seats');
}

const isReadyPhase = (room: PartyRoom): boolean =>
  room.state.phase === Phase.lobby || room.state.phase === Phase.roleReveal;

/** Phase timers owned by the lobby flow: the role card ends when all are Ready or the card time elapses. */
export function runLobbyPhase(room: PartyRoom): void {
  if (room.state.phase !== Phase.roleReveal) return;
  let everyoneReady = true;
  room.state.players.forEach((p: PlayerState) => {
    if (p.alive && p.connected && !p.ready) everyoneReady = false;
  });
  if (everyoneReady || room.state.tick >= room.state.phaseEndsTick) beginPlay(room);
}

/**
 * The deal: `debug.deal` can fix some seats for the next match (WDI_DEBUG only). Each fixed role leaves
 * the roster row once (a role the row lacks takes a Townsfolk's place, else the last card), and the
 * rest is dealt to the remaining seats, so the roster counts hold.
 */
function dealRoles(room: PartyRoom, ids: string[], rng: () => number): Map<string, string> {
  const flow = flowOf(room);
  const fixed = flow.fixedDeal;
  flow.fixedDeal = null;
  const roster: Roster = roles.rosters;
  if (!fixed) return assignRoles(ids, room.state.settings, rng, roster);
  const deck = [...(roster[String(ids.length)]?.deal ?? [])];
  const dealt = new Map<string, string>();
  for (const id of ids) {
    const roleId = fixed[id];
    if (roleId === undefined) continue;
    dealt.set(id, roleId);
    const at = deck.includes(roleId)
      ? deck.indexOf(roleId)
      : deck.includes('townsfolk')
        ? deck.indexOf('townsfolk')
        : deck.length - 1;
    deck.splice(at, 1);
  }
  const rest = ids.filter((id) => !dealt.has(id));
  const dealtRest = assignRoles(rest, room.state.settings, rng, { [String(rest.length)]: { deal: deck } });
  for (const [id, roleId] of dealtRest) dealt.set(id, roleId);
  return dealt;
}

/** lobby -> roleReveal: deal roles and traits, write the private state, send each card to its owner. */
export function startMatch(room: PartyRoom): void {
  // Every draw gets its own crypto-seeded stream, so the public traits and NPC names say nothing about the
  // deal (round-4 review, DECISIONS A49).
  room.seeds = new MatchSeeds();
  room.matchSeed = randomInt(2 ** 32);
  // The party fills to `players.min` with NPC seats, named from a stream apart from the deal's (GDD 3.12).
  fillNpcSeats(room, room.seeds.get('npcNames'));
  const ids = [...room.state.players.keys()];
  if (startOnubMatch(room, ids)) return; // quick mode deals its own cards from `room.seeds` (round 5, 5A)
  const dealt = dealRoles(room, ids, room.seeds.get('deal'));
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
  }

  void room.lock();
  setPhase(room, Phase.roleReveal, balance.phases.roleRevealS);

  for (const id of ids) {
    const mates = (room.state.players.get(id)?.priv?.cabalMates ?? []).map((m: string) => ({
      id: m,
      name: room.state.players.get(m)?.name ?? '',
    }));
    const look = looks.get(id) as { height: number; scarf: number; hat: number };
    room.clients
      .getById(id)
      ?.send(S2C.roleReveal, buildRoleReveal(dealt.get(id) as string, look, ids.length, mates));
  }
}

/**
 * roleReveal -> first play phase. Placement is the sim's job: once the phase is a world phase,
 * `placeNewPlayers` (sim/Portals.ts) spreads everyone over the `square_<n>` spawns inside the next
 * step and sends the one `sceneEnter`; nothing here touches positions or scenes.
 */
export function beginPlay(room: PartyRoom): void {
  if (beginOnubPlay(room)) return; // quick mode starts at Evening Prep (round 5, 5A)
  room.state.round = 0;
  room.state.startTick = room.state.tick;
  setPhase(room, Phase.grace, balance.phases.graceS);
  room.state.players.forEach((player: PlayerState) => {
    player.ready = false;
  });
}
