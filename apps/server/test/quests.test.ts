import type { ColyseusTestServer } from '@colyseus/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { quests } from '@wdi/content';
import { ErrorCode, ItemStack, Phase, type PlayerState } from '@wdi/shared';
import {
  advance,
  allTownsfolk,
  bootNpcServer,
  errors,
  lobbyOf,
  pauseClock,
  placeSeat,
  send,
  start,
  toWorld,
  type Human,
  type Party,
} from './npcHelpers';

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => {
  ({ colyseus, release } = await bootNpcServer());
});
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

// The harbourmaster stands at (55, 40) on the overworld, Mother Moll at (40, 7) in the Fenwood.
const PELL = { scene: 'overworld', x: 55, y: 40 } as const;
const MOLL = { scene: 'forest_deep', x: 40, y: 7 } as const;

async function world(): Promise<{ party: Party; h: Human; me: PlayerState }> {
  const party = await lobbyOf(colyseus, 4);
  await start(party);
  await toWorld(party);
  allTownsfolk(party.room);
  pauseClock(party.room);
  party.room.state.phase = Phase.day;
  party.room.state.phaseEndsTick = party.room.state.tick + 1e6;
  const h = party.humans[1]!;
  const me = party.room.state.players.get(h.id)!;
  me.priv.inventory.slots.clear();
  return { party, h, me };
}

function give(me: PlayerState, defId: string, qty: number): void {
  const s = new ItemStack();
  s.defId = defId;
  s.qty = qty;
  me.priv.inventory.slots.push(s);
}
const qty = (me: PlayerState, defId: string): number =>
  me.priv.inventory.slots.reduce((n, s) => (s.defId === defId ? n + s.qty : n), 0);
const stand = (party: Party, h: Human, at: { scene: string; x: number; y: number }) =>
  placeSeat(party, h.id, at.scene as 'overworld', at.x, at.y);
async function say(party: Party, h: Human, type: string, questId: string): Promise<void> {
  await send(h, type, { questId }, 80);
  advance(party, 3);
  await new Promise((r) => setTimeout(r, 80)); // the refusal travels back over the socket
}

describe('quest.accept', () => {
  it('writes the quest into the own view at its giver and refuses elsewhere', async () => {
    const { party, h, me } = await world();
    stand(party, h, { scene: 'overworld', x: 10, y: 10 });
    await say(party, h, 'quest.accept', 'caulkTheSkiff');
    expect(errors(h)).toContain(ErrorCode.outOfRange);
    expect(me.priv.quests).toHaveLength(0);
    stand(party, h, PELL);
    await say(party, h, 'quest.accept', 'caulkTheSkiff');
    expect(me.priv.quests.map((q) => [q.id, q.progress, q.done])).toEqual([['caulkTheSkiff', 0, false]]);
  });

  it('refuses another giver quest, an unknown id, a repeat and a third active quest', async () => {
    const { party, h, me } = await world();
    stand(party, h, PELL);
    await say(party, h, 'quest.accept', 'mollsHerbs'); // Moll is not here
    await say(party, h, 'quest.accept', 'noSuchQuest');
    expect(me.priv.quests).toHaveLength(0);
    await say(party, h, 'quest.accept', 'caulkTheSkiff');
    await new Promise((r) => setTimeout(r, 600));
    await say(party, h, 'quest.accept', 'caulkTheSkiff');
    expect(me.priv.quests).toHaveLength(1);
    stand(party, h, MOLL);
    await say(party, h, 'quest.accept', 'mollsHerbs');
    await new Promise((r) => setTimeout(r, 600));
    await say(party, h, 'quest.accept', 'mollsMushrooms');
    expect(me.priv.quests.map((q) => q.id)).toEqual(['caulkTheSkiff', 'mollsHerbs']);
  });

  it('refuses a contract quest in round 6', async () => {
    const { party, h, me } = await world();
    const rows = quests.quests as Record<string, unknown>;
    rows.testContract = { ...quests.quests.caulkTheSkiff, id: 'testContract', kind: 'contract' };
    try {
      stand(party, h, PELL);
      await say(party, h, 'quest.accept', 'testContract');
      expect(me.priv.quests).toHaveLength(0);
      expect(errors(h)).toContain(ErrorCode.cannot);
    } finally {
      delete rows.testContract;
    }
  });

  it('refuses in a meeting', async () => {
    const { party, h, me } = await world();
    stand(party, h, PELL);
    party.room.state.phase = Phase.meetingDiscussion;
    await say(party, h, 'quest.accept', 'caulkTheSkiff');
    expect(me.priv.quests).toHaveLength(0);
    expect(errors(h)).toContain(ErrorCode.wrongPhase);
  });
});

describe('quest progress and turn-in', () => {
  it('follows the inventory, and a turn-in takes the wants and gives the reward through it', async () => {
    const { party, h, me } = await world();
    stand(party, h, PELL);
    await say(party, h, 'quest.accept', 'caulkTheSkiff');
    give(me, 'resin', 2);
    advance(party, 2);
    expect(me.priv.quests[0]?.progress).toBe(2);
    give(me, 'timber', 3);
    advance(party, 2);
    expect(me.priv.quests[0]?.progress).toBe(3); // 2 resin + 1 timber, capped at what is wanted
    await say(party, h, 'quest.turnIn', 'caulkTheSkiff');
    expect(me.priv.quests[0]).toMatchObject({ done: true, progress: 3 });
    expect([qty(me, 'resin'), qty(me, 'timber'), qty(me, 'lantern')]).toEqual([0, 2, 1]);
  });

  it('refuses a turn-in without the wants or off the quest list, and takes nothing', async () => {
    const { party, h, me } = await world();
    stand(party, h, PELL);
    give(me, 'resin', 2);
    give(me, 'timber', 1);
    await say(party, h, 'quest.turnIn', 'caulkTheSkiff'); // not accepted
    await say(party, h, 'quest.accept', 'caulkTheSkiff');
    me.priv.inventory.slots.splice(1, 1); // the timber is gone
    await new Promise((r) => setTimeout(r, 600));
    await say(party, h, 'quest.turnIn', 'caulkTheSkiff');
    expect(me.priv.quests[0]?.done).toBe(false);
    expect([qty(me, 'resin'), qty(me, 'lantern')]).toEqual([2, 0]);
  });

  it('refuses a turn-in with no room for the reward and leaves the inventory as it was', async () => {
    const { party, h, me } = await world();
    stand(party, h, { scene: 'bp_woods', x: 24, y: 30 });
    give(me, 'stone', 5); // 3 are wanted, so the stack stays
    for (const id of ['knife', 'bandage', 'salts', 'crowbar']) give(me, id, 1);
    await say(party, h, 'quest.accept', 'colliersStone');
    await new Promise((r) => setTimeout(r, 600));
    await say(party, h, 'quest.turnIn', 'colliersStone');
    expect(me.priv.quests[0]?.done).toBe(false);
    expect(me.priv.inventory.slots.map((s) => [s.defId, s.qty])).toEqual([
      ['stone', 5],
      ['knife', 1],
      ['bandage', 1],
      ['salts', 1],
      ['crowbar', 1],
    ]);
    expect(errors(h)).toContain(ErrorCode.cannot);
  });

  it('does a quest once per match and lets a done one free its slot of the limit', async () => {
    const { party, h, me } = await world();
    stand(party, h, { scene: 'bp_woods', x: 24, y: 30 });
    give(me, 'stone', 3);
    await say(party, h, 'quest.accept', 'colliersStone');
    await new Promise((r) => setTimeout(r, 600));
    await say(party, h, 'quest.turnIn', 'colliersStone');
    expect(qty(me, 'torch')).toBe(1);
    give(me, 'stone', 3);
    await new Promise((r) => setTimeout(r, 600));
    await say(party, h, 'quest.accept', 'colliersStone'); // already done this match
    await say(party, h, 'quest.turnIn', 'colliersStone');
    expect(me.priv.quests).toHaveLength(1);
    expect(qty(me, 'torch')).toBe(1);
    expect(qty(me, 'stone')).toBe(3);
  });

  it('starts every match with no quest', async () => {
    const { party, h, me } = await world();
    stand(party, h, PELL);
    await say(party, h, 'quest.accept', 'caulkTheSkiff');
    party.room.state.phase = Phase.lobby;
    advance(party, 2);
    expect(me.priv.quests).toHaveLength(0);
  });
});
