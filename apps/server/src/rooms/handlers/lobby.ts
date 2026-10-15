import { randomInt } from 'node:crypto';
import { abilities, balance, items, roles } from '@wdi/content';
import {
  ABILITY_KEYS,
  C2S,
  ErrorCode,
  ItemStack,
  Phase,
  type PlayerState,
  S2C,
  Team,
  TICK_RATE,
  TRAIT_IDS,
  assignRoles,
  dealTraits,
  mulberry32,
  type Roster,
  type RoleRevealPayload,
  type TeamId,
} from '@wdi/shared';
import type { PartyRoom } from '../PartyRoom';

/** Messages that belong to the lobby and role-card flow; everything else goes to `sim/Commands`. */
const LOBBY_TYPES: readonly string[] = [C2S.lobbyStart, C2S.lobbyReady, C2S.roleReady];
export const isLobbyCommand = (type: string): boolean => LOBBY_TYPES.includes(type);

const secondsToTicks = (s: number): number => Math.round(s * TICK_RATE);

function refuse(room: PartyRoom, sessionId: string, code: ErrorCode, msg: string): void {
  room.clients.getById(sessionId)?.send(S2C.error, { code, msg });
}

/**
 * Roster for a party of `count`. Rows exist for 4 to 10; a smaller party (NPC fill, GDD 3.12, is M3c)
 * deals the first `count` roles of the 4-player row so the Killer and Detective stay in the game.
 */
export function rosterFor(count: number): Roster {
  const row = count < balance.players.min ? roles.rosters[String(balance.players.min) as '4'] : undefined;
  if (!row) return roles.rosters;
  return { [String(count)]: { deal: row.deal.slice(0, count) } };
}

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
  room.state.players.forEach((p: PlayerState) => {
    if (p.connected) humans++;
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
    }
  }
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

function setPhase(room: PartyRoom, phase: number, seconds: number): void {
  room.state.phase = phase;
  room.state.phaseEndsTick = room.state.tick + secondsToTicks(seconds);
  room.broadcast(S2C.phaseChange, { phase, endsTick: room.state.phaseEndsTick });
}

/** lobby -> roleReveal: deal roles and traits, write the private state, send each card to its owner. */
export function startMatch(room: PartyRoom): void {
  const ids = [...room.state.players.keys()];
  room.matchSeed = randomInt(2 ** 32);
  const rng = mulberry32(room.matchSeed);
  const dealt = assignRoles(ids, room.state.settings, rng, rosterFor(ids.length));
  const looks = dealTraits(ids, rng);
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
  setPhase(room, Phase.grace, balance.phases.graceS);
  room.state.players.forEach((player: PlayerState) => {
    player.ready = false;
  });
}
