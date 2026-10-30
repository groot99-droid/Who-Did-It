import type { ColyseusTestServer } from '@colyseus/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { quests } from '@wdi/content';
import { ItemStack, Phase, type PlayerState } from '@wdi/shared';
import {
  advance,
  allTownsfolk,
  bootNpcServer,
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

// Mother Moll stands at (40, 7) in the Fenwood.
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

describe('quest chains (D9, GDD 3.16)', () => {
  it('offers a chain step only after the step before it was turned in', async () => {
    const { party, h, me } = await world();
    stand(party, h, MOLL);
    expect(quests.quests.mollsBrew!.after).toBe('mollsMushrooms');
    await say(party, h, 'quest.accept', 'mollsBrew'); // step 2 first: refused
    expect(me.priv.quests).toHaveLength(0);
    await say(party, h, 'quest.accept', 'mollsMushrooms');
    await new Promise((r) => setTimeout(r, 600));
    give(me, 'mushroom', 3);
    await say(party, h, 'quest.turnIn', 'mollsMushrooms');
    expect(me.priv.quests.map((q) => [q.id, q.done])).toEqual([['mollsMushrooms', true]]);
    await new Promise((r) => setTimeout(r, 600));
    await say(party, h, 'quest.accept', 'mollsBrew');
    expect(me.priv.quests.map((q) => q.id)).toEqual(['mollsMushrooms', 'mollsBrew']);
    give(me, 'herb', 2);
    give(me, 'mushroom', 2);
    await say(party, h, 'quest.turnIn', 'mollsBrew');
    expect(qty(me, 'bandage')).toBe(2);
    expect(qty(me, 'herb') + qty(me, 'mushroom')).toBe(0);
  });
});
