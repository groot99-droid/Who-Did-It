import { ColyseusTestServer, boot } from '@colyseus/testing';
import { onubBalance, onubFor, onubRoles } from '@wdi/content';
import { C2S, ErrorCode, LOFT_SCENE_INDEX, Phase, S2C, Team, type PlayerState } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { flowOf } from '../src/sim/Flow';
import { onubDeckSetting, resetOnubForLobby } from '../src/sim/Onub';
import { onubOf } from '../src/sim/onub/state';
import { createServer } from '../src/server';
import { fixSeeds } from './seedHelpers';
import {
  cards,
  clientState,
  errorsOf,
  memory,
  onubLobby,
  onubRoleCard,
  phaseOf,
  startOnub,
  toPrep,
  until,
} from './onubPrepHelpers';
import { sleep, type Bot } from './simHelpers';

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  colyseus = await boot(createServer({ ipBurst: 100_000, ipPerMin: 100_000_000, globalPerMin: 100_000_000 }));
});
afterAll(async () => colyseus.shutdown());
beforeEach(async () => colyseus.cleanup());

const rowOf = (roleId: string) => {
  const role = onubRoles.roles[roleId as keyof typeof onubRoles.roles];
  const team = onubRoles.teams[role?.team as keyof typeof onubRoles.teams];
  if (!role || !team) throw new Error(`no role row ${roleId}`);
  return { role, team };
};
const sorted = (xs: Iterable<string>) => [...xs].sort();

describe('onubDeckSetting', () => {
  it('stores nothing for the empty deck, which means the default', () => {
    expect(onubDeckSetting([])).toEqual([]);
  });
  it('accepts a legal custom deck and refuses every kind of bad one', () => {
    const ok = ['champignon', 'chef', 'aboyeur', 'plongeur'];
    expect(onubDeckSetting(ok)).toEqual(ok);
    expect(onubDeckSetting('chef')).toBeNull();
    expect(onubDeckSetting([1, 2])).toBeNull();
    expect(onubDeckSetting(['champignon', 'nobody'])).toBeNull(); // unknownRole
    expect(onubDeckSetting(['chef', 'aboyeur'])).toBeNull(); // missingRequired
    expect(onubDeckSetting(['champignon', 'chef', 'chef'])).toBeNull(); // copies
    expect(onubDeckSetting(['champignon', 'commis'])).toBeNull(); // copies: exactly two Commis
    expect(onubDeckSetting(['champignon', 'commis', 'commis'])).toEqual(['champignon', 'commis', 'commis']);
  });
  it('lets the lobby store, and the editor clear, a custom deck', async () => {
    const m = await onubLobby(colyseus, 4);
    const deck = ['champignon', 'champignon', 'chef', 'aboyeur', 'sousChef', 'plongeur', 'apprenti'];
    m.bots[0]?.room.send(C2S.lobbySettings, { onubDeck: deck });
    await until(() => m.room.state.settings.onubDeck.length === deck.length);
    expect([...m.room.state.settings.onubDeck]).toEqual(deck);
    m.bots[0]?.room.send(C2S.lobbySettings, { onubDeck: [] });
    await until(() => m.room.state.settings.onubDeck.length === 0);
    expect(m.room.state.settings.onubDeck.length).toBe(0);
  });
  it('refuses a bad deck in lobby.settings with 422 and writes nothing (all or nothing)', async () => {
    const m = await onubLobby(colyseus, 4);
    m.bots[0]?.room.send(C2S.lobbySettings, { onubDeck: ['chef'], npcDifficulty: 2 });
    await until(() => errorsOf(m.bots[0] as Bot).length > 0);
    expect(errorsOf(m.bots[0] as Bot)).toContainEqual({ code: ErrorCode.cannot, msg: 'bad setting' });
    expect(m.room.state.settings.onubDeck.length).toBe(0);
  });
});

describe('Start in the quick mode', () => {
  it('deals every seat a Role card from the default deck and the rest to the Pantry', async () => {
    const m = await onubRoleCard(colyseus, 5);
    expect(phaseOf(m)).toBe(Phase.roleReveal);
    const o = memory(m);
    const deck = onubFor(5).deck;
    expect(deck).toHaveLength(5 + onubBalance.pantry.roles);
    expect(o.deck).toEqual(deck);
    expect(sorted([...o.dealt.values(), ...o.pantryRolesDealt])).toEqual(sorted(deck));
    expect(o.pantryRolesDealt).toHaveLength(onubBalance.pantry.roles);
    expect(o.pantryLocsDealt).toHaveLength(onubBalance.pantry.locations);
    const stationIds = onubBalance.stations.map((s) => s.id);
    for (const loc of o.pantryLocsDealt) expect(stationIds).toContain(loc);
    expect(o.seats).toEqual([...m.room.state.players.keys()]);
    expect(o.commits.size).toBe(0);
    expect(o.prep).toBeNull();
  });

  it('sends each seat only its own role card, built from roles.onub.json', async () => {
    const m = await onubRoleCard(colyseus, 5);
    const o = memory(m);
    for (const bot of m.bots) {
      const got = cards(bot);
      expect(got).toHaveLength(1);
      const roleId = o.dealt.get(bot.id) as string;
      const { role, team } = rowOf(roleId);
      expect(got[0]).toMatchObject({
        roleId,
        team: team.faction,
        teamName: team.name,
        goal: team.goal,
        cardText: role.cardText,
        beware: onubRoles.cardLine,
        teammates: [],
        abilities: [],
        inventory: [],
      });
      expect(got[0]?.deck).toBeUndefined();
    }
  });

  it('writes Private.role and the public board, and nothing else about the deal', async () => {
    const m = await onubRoleCard(colyseus, 5);
    const o = memory(m);
    await sleep(100);
    for (const bot of m.bots) {
      const seen = clientState(bot);
      expect([...seen.onub.seats]).toEqual(o.seats);
      expect([...seen.onub.deck]).toEqual(o.deck);
      expect(seen.onub.piles.size).toBe(0);
      expect(seen.onub.cloche).toBe('');
      expect(seen.onub.window).toBe('');
      const mine = seen.players.get(bot.id)?.priv;
      expect(mine?.role.roleId).toBe(o.dealt.get(bot.id));
      expect(mine?.onubLoc).toBe('');
      expect(mine?.onubCard).toBe('');
      expect(mine?.nightReveal.length).toBe(0);
      expect(mine?.cabalMates.length).toBe(0);
      expect(mine?.inventory.slots.length).toBe(0);
    }
    // The wire's Role team is the team's faction, so no team literal lives in code.
    m.room.state.players.forEach((p: PlayerState, id: string) => {
      const faction = rowOf(o.dealt.get(id) as string).team.faction;
      expect(p.priv.role.team).toBe(Team[faction as keyof typeof Team]);
      expect(p.alive).toBe(true);
    });
  });

  it('fills a single human to the 4-seat deck with NPC seats and never refuses for size (A51)', async () => {
    const m = await onubLobby(colyseus, 1);
    await startOnub(m);
    expect(phaseOf(m)).toBe(Phase.roleReveal);
    expect(m.room.state.players.size).toBe(4);
    expect(memory(m).deck).toEqual(onubFor(4).deck);
    // The phase is read from the server room; the card is a message, which may still be on its way.
    await until(() => cards(m.bots[0] as Bot).length === 1, 2000);
    expect(cards(m.bots[0] as Bot)).toHaveLength(1);
  });

  it('deals every party size 4 to 10 a legal deck of seats plus three', async () => {
    for (const n of [4, 7, 10]) {
      const m = await onubRoleCard(colyseus, n);
      expect(memory(m).deck).toHaveLength(n + onubBalance.pantry.roles);
      expect(memory(m).dealt.size).toBe(n);
      await colyseus.cleanup();
    }
  });

  it('plays a custom deck of the right size, and refuses one of the wrong size with 422', async () => {
    // Four humans, so seven cards; the legal deck of five seats is accepted by the lobby but not at Start.
    const five = onubFor(5).deck;
    const wrong = await onubLobby(colyseus, 4, [...five]);
    await startOnub(wrong);
    await until(() => errorsOf(wrong.bots[0] as Bot).length > 0);
    expect(phaseOf(wrong)).toBe(Phase.lobby);
    expect(errorsOf(wrong.bots[0] as Bot)).toContainEqual({ code: ErrorCode.cannot, msg: 'bad deck' });
    expect(errorsOf(wrong.bots[1] as Bot)).toHaveLength(0);
    expect(onubOf(wrong.room)).toBeUndefined();
    await colyseus.cleanup();

    const custom = ['champignon', 'champignon', 'chef', 'aboyeur', 'apprenti', 'critique', 'plongeur'];
    const right = await onubLobby(colyseus, 4, custom);
    await startOnub(right);
    expect(phaseOf(right)).toBe(Phase.roleReveal);
    expect(memory(right).deck).toEqual(custom);
    expect(sorted([...memory(right).dealt.values(), ...memory(right).pantryRolesDealt])).toEqual(
      sorted(custom),
    );
  });

  it('honours debug.deal, drops unknown ids and fills the rest from the deck', async () => {
    const m = await onubLobby(colyseus, 5);
    const ids = m.bots.map((b) => b.id);
    flowOf(m.room).fixedDeal = { [ids[0] as string]: 'croissant', [ids[1] as string]: 'not-a-role' };
    await startOnub(m);
    const o = memory(m);
    expect(o.dealt.get(ids[0] as string)).toBe('croissant');
    expect(sorted([...o.dealt.values(), ...o.pantryRolesDealt])).toEqual(sorted(onubFor(5).deck));
    expect(flowOf(m.room).fixedDeal).toBeNull();
  });

  it('replaces the last card when debug.deal fixes a role the deck lacks', async () => {
    const m = await onubLobby(colyseus, 4);
    const id = m.bots[0]?.id as string;
    flowOf(m.room).fixedDeal = { [id]: 'tourrier' }; // not in the 4-seat deck
    await startOnub(m);
    const o = memory(m);
    expect(o.dealt.get(id)).toBe('tourrier');
    expect([...o.dealt.values(), ...o.pantryRolesDealt]).toHaveLength(7);
  });
});

describe('the deal streams', () => {
  const WORDS = [11, 22, 33, 44] as const;
  it('reproduces the whole deal from the deal stream and ignores the traits stream', async () => {
    const a = await onubLobby(colyseus, 5);
    fixSeeds(a.room, { deal: WORDS, traits: [1, 2, 3, 4] });
    await startOnub(a);
    const first = memory(a);
    const dealtA = [...first.dealt.values()];
    const traitsA = [...a.room.state.players.values()].map(
      (p) => `${p.traits.height}${p.traits.scarf}${p.traits.hat}`,
    );
    await colyseus.cleanup();

    const b = await onubLobby(colyseus, 5);
    fixSeeds(b.room, { deal: WORDS, traits: [9, 9, 9, 9] });
    await startOnub(b);
    expect([...memory(b).dealt.values()]).toEqual(dealtA);
    expect(memory(b).pantryLocsDealt).toEqual(first.pantryLocsDealt);
    const traitsB = [...b.room.state.players.values()].map(
      (p) => `${p.traits.height}${p.traits.scarf}${p.traits.hat}`,
    );
    expect(traitsB).not.toEqual(traitsA);
  });

  it('gives different deals on different crypto words', async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const m = await onubRoleCard(colyseus, 5);
      seen.add([...memory(m).dealt.values()].join());
      await colyseus.cleanup();
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('role card to Evening Prep', () => {
  it('starts prep when every seat is Ready, with every seat in the loft and the prep timer set', async () => {
    const m = await onubRoleCard(colyseus, 5);
    await toPrep(m);
    expect(phaseOf(m)).toBe(Phase.dusk);
    const timer = m.room.state.phaseEndsTick - m.room.state.tick;
    expect(timer).toBeGreaterThan(0);
    expect(timer).toBeLessThanOrEqual(onubBalance.timers.prepS * 20);
    m.room.state.players.forEach((p: PlayerState) => {
      expect(p.priv.sceneId).toBe(LOFT_SCENE_INDEX);
      expect(p.ready).toBe(false);
    });
  });

  it('starts prep when the card time elapses, and not before', async () => {
    const m = await onubRoleCard(colyseus, 5);
    m.bots[0]?.room.send(C2S.lobbyReady, { ready: true });
    await sleep(250);
    expect(phaseOf(m)).toBe(Phase.roleReveal);
    m.room.state.phaseEndsTick = m.room.state.tick + 1;
    await until(() => phaseOf(m) === Phase.dusk);
    expect(phaseOf(m)).toBe(Phase.dusk);
  });

  it('never grants a scene or presence to anyone', async () => {
    const m = await onubRoleCard(colyseus, 4);
    await toPrep(m);
    await sleep(200);
    for (const bot of m.bots) {
      expect(bot.events.filter((e) => e.type === S2C.sceneEnter)).toHaveLength(0);
    }
  });
});

describe('resetOnubForLobby', () => {
  it('clears the match memory and the board but keeps the custom deck', async () => {
    const custom = ['champignon', 'champignon', 'chef', 'aboyeur', 'apprenti', 'critique', 'plongeur'];
    const m = await onubRoleCard(colyseus, 4, custom);
    expect(m.room.state.onub.deck.length).toBe(7);
    resetOnubForLobby(m.room);
    expect(onubOf(m.room)).toBeUndefined();
    const board = m.room.state.onub;
    expect([board.seats.length, board.deck.length, board.piles.size]).toEqual([0, 0, 0]);
    expect(board.ruinWeight).toBe(0);
    expect(board.ruined).toBe(false);
    expect(board.perk).toBe(false);
    expect(board.cloche).toBe('');
    expect(board.window).toBe('');
    expect([...m.room.state.settings.onubDeck]).toEqual(custom);
  });
});
