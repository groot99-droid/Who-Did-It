import type { ColyseusTestServer } from '@colyseus/testing';
import { balance, economy } from '@wdi/content';
import { Phase } from '@wdi/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addStack, count } from '../src/sim/Inventory';
import { maybeBuySnare, snareShopAt } from '../src/sim/npc/snares';
import { simOf } from '../src/sim/RoomSim';
import { heldBySnare } from '../src/sim/snares';
import { openRun } from './killHelpers';
import {
  type Party,
  advance,
  allTownsfolk,
  bootNpcServer,
  holdPhase,
  lobbyOf,
  npcSeats,
  pauseClock,
  placeSeat,
  send,
  start,
  toWorld,
} from './npcHelpers';

// Round 10, K6b (GDD 3.5, 3.12 "Hidden seats"): an NPC seat sets the Snare it holds outdoors, buys one at a stall that
// sells it, and frees a held seat it sees with its Rope, through the human verbs and its own play stream, so neither a
// set snare, a purchase nor a freeing marks a human.

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

const npcRow = balance.snare.npc;
const saved = { ...npcRow };
afterEach(() => Object.assign(npcRow, saved));

/** One human and one NPC seat, Townsfolk both, in the day, on the clock of `advance` only. */
async function pair(): Promise<{ party: Party; human: string; npc: string }> {
  const party = await lobbyOf(colyseus, 1);
  await send(party.humans[0]!, 'lobby.addNpc', {}, 40);
  await start(party);
  await toWorld(party);
  pauseClock(party.room);
  allTownsfolk(party.room);
  holdPhase(party, Phase.day, 900);
  return { party, human: party.humans[0]!.id, npc: npcSeats(party.room)[0]!.id };
}

describe('NPC seats and snares (K6b)', () => {
  it('an NPC seat holding a Snare outdoors sets it, as a human would', async () => {
    const { party, npc } = await pair();
    npcRow.setChancePer10s = 1000;
    const { x, y } = openRun('forest', 6);
    placeSeat(party, npc, 'forest', x + 2, y);
    addStack(party.room.state.players.get(npc)!, 'snare', 1);
    advance(party, 20);
    expect(count(party.room.state.players.get(npc)!, 'snare')).toBe(0);
    expect(party.room.state.scenes.get('forest')!.snares.size).toBe(1);
  });

  it('an NPC seat with a Rope walks to a held seat it sees and frees it', async () => {
    const { party, human, npc } = await pair();
    npcRow.ropeChance = 1;
    npcRow.setChancePer10s = 0;
    const { x, y } = openRun('forest', 6);
    placeSeat(party, human, 'forest', x, y);
    addStack(party.room.state.players.get(human)!, 'snare', 1);
    send(party.humans[0]!, 'act.ability', { abilityId: 'snare' }, 0);
    advance(party, 3);
    expect(party.room.state.scenes.get('forest')!.snares.size).toBe(1);
    placeSeat(party, human, 'forest', x + 4, y);
    advance(party, 2);
    placeSeat(party, human, 'forest', x, y);
    advance(party, 2);
    expect(heldBySnare(party.room, human)).toBe(true);
    addStack(party.room.state.players.get(npc)!, 'rope', 1);
    placeSeat(party, npc, 'forest', x + 4, y);
    let freed = false;
    advance(party, 60, () => (freed ||= !heldBySnare(party.room, human)));
    expect(freed).toBe(true);
    expect(
      Math.abs(simOf(party.room).players.get(npc)!.x - simOf(party.room).players.get(human)!.x),
    ).toBeLessThan(3 * 32);
  });

  it('a stall that sells Snares draws an NPC seat that holds none and can pay; it buys one by its roll', async () => {
    const { party, npc } = await pair();
    const player = party.room.state.players.get(npc)!;
    const stall = economy.shops.gamekeeper!.prop;
    player.priv.purse = 0;
    expect(snareShopAt(party.room, player, stall)).toBeUndefined();
    player.priv.purse = 50;
    expect(snareShopAt(party.room, player, stall)).toBe('gamekeeper');
    expect(snareShopAt(party.room, player, economy.shops.store!.prop)).toBeUndefined();
    npcRow.buyChance = 1;
    placeSeat(party, npc, 'forest', 16, 22);
    maybeBuySnare(party.room, npc, player, stall);
    expect(count(player, 'snare')).toBe(1);
    expect(snareShopAt(party.room, player, stall)).toBeUndefined(); // one at a time
  });
});
