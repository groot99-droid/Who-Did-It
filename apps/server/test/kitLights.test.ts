import type { ColyseusTestServer } from '@colyseus/testing';
import { balance, roles } from '@wdi/content';
import { C2S, ManhuntState, Phase, TICK_RATE, slotsIn } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { avatarMemory } from '../src/sim/Avatars';
import { LAYOUT, addStack, count, move, select, stackAt } from '../src/sim/Inventory';
import { handleCuffHold } from '../src/sim/law/Manhunt';
import { figuresOf } from '../src/sim/townsfolk/figures';
import { handlePetitionOpen, handlePetitionSign } from '../src/sim/law/Petition';
import { lightBurns } from '../src/sim/mobs/light';
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

/** K3 (round 10; GDD 3.5, 3.15, 3.31): a light in every kit, Handcuffs, and the NPC seats' lighting rule. */

const S = (s: number): number => Math.round(s * TICK_RATE);
let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

async function world(): Promise<Party> {
  const party = await lobbyOf(colyseus, 4);
  await send(party.humans[0]!, C2S.lobbyAddNpc);
  await start(party);
  await toWorld(party);
  pauseClock(party.room);
  allTownsfolk(party.room);
  holdPhase(party, Phase.day, 3600);
  for (const f of figuresOf(party.room).values()) if (f.kind === 'constable') f.dead = true;
  return party;
}

describe('K3: candles for all (GDD 3.5)', () => {
  it('gives every card a light in its start kit', () => {
    const lights = new Set(['lantern', 'torch', 'candle']);
    for (const role of Object.values(roles.roles))
      expect(
        role.startKit.some((k) => lights.has(k.item)),
        role.id,
      ).toBe(true);
  });
});

describe('K3: Handcuffs (GDD 3.31)', () => {
  /** Seat `c` cuffs `d` under an open warrant; returns the ticks the hold took. */
  async function cuff(withCuffs: boolean): Promise<{ party: Party; took: number; left: number }> {
    const party = await world();
    const [a, b, c, d] = party.humans.map((h) => h.id) as [string, string, string, string];
    party.humans.forEach((h, i) => placeSeat(party, h.id, 'overworld', 34 + i, 21));
    handlePetitionOpen(party.room, a, { accused: d, charge: 'robbery', entries: [] });
    for (const id of [b, c]) handlePetitionSign(party.room, id, { id: party.room.state.petition.id });
    advance(party, 1);
    const me = party.room.state.players.get(c)!;
    if (withCuffs) {
      addStack(me, 'handcuffs', 2);
      // A tool lands on the belt first; Handcuffs work from the selected hotbar slot.
      const from = me.priv.inventory.slots.find((s) => s.defId === 'handcuffs')!.slot;
      const to = slotsIn(LAYOUT, 'hotbar').find((i) => stackAt(me, i) === undefined)!;
      expect(move(me, from, to)).toBeNull();
      select(me, to);
    }
    placeSeat(party, c, 'overworld', 36, 22);
    placeSeat(party, d, 'overworld', 37, 22);
    advance(party, 1);
    handleCuffHold(party.room, c, avatarMemory(party.room).handleOf.get(d)!);
    let took = 0;
    while (party.room.state.manhunt.state !== ManhuntState.cuffed && took < S(10)) {
      advance(party, 1);
      took++;
    }
    return { party, took, left: count(me, 'handcuffs') };
  }

  it('halves the hold and is spent by the cuff', async () => {
    const plain = await cuff(false);
    expect(plain.took).toBeGreaterThanOrEqual(S(balance.law.cuffHoldS) - 1);
    const cuffed = await cuff(true);
    expect(cuffed.took).toBeLessThanOrEqual(S(balance.law.cuffHoldS * balance.kit.handcuffsHoldMult) + 1);
    expect(cuffed.took).toBeLessThan(plain.took);
    expect(cuffed.left).toBe(1);
  });
});

describe('K3: an NPC seat lights its light by the rule a person would follow', () => {
  it('lights at dusk, after a delay, and puts it out by day', async () => {
    const party = await world();
    const npc = npcSeats(party.room)[0]!;
    addStack(npc, 'candle', 1);
    party.room.state.phase = Phase.day;
    advance(party, 5);
    expect(lightBurns(party.room, npc.id)).toBe(false);
    party.room.state.phase = Phase.night;
    advance(party, S(balance.kit.npcLightDelayS.max) + 5);
    expect(lightBurns(party.room, npc.id)).toBe(true);
    party.room.state.phase = Phase.day;
    advance(party, 3);
    expect(lightBurns(party.room, npc.id)).toBe(false);
  });
});
