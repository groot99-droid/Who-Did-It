import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import type { Client } from 'colyseus';
import { balance } from '@wdi/content';
import { C2S, Phase, Winner } from '@wdi/shared';
import { markDead } from '../src/sim/Death';
import { flowOf } from '../src/sim/Flow';
import { deckFor } from '@wdi/content';
import { mulberry32 } from '@wdi/shared';
import { isCaught, isPaintTown, paintDeal, paintDeck, paintGameOver } from '../src/sim/paintTown';
import { addNpcSeat } from '../src/sim/npc/seats';
import { isNpcSeat } from '../src/sim/Npc';
import { simOf } from '../src/sim/RoomSim';
import { townsfolkMemory } from '../src/sim/townsfolk/figures';
import { isOnLine } from '../src/sim/Train';
import { endMatch, evaluateWin } from '../src/sim/Win';
import { type Party, advance, bootNpcServer, lobbyOf, pauseClock } from './npcHelpers';
import { sleep } from './simHelpers';

/** Round 10, C5 (GDD 3.8; world-mode.md 1.6, followup-4 2.2; seams.md row 18): Paint The Town Red. */

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());
vi.setConfig({ testTimeout: 60_000 });

/** Two humans and `npcs` NPC seats, started and placed in the world. */
async function paintParty(npcs = 4): Promise<{ party: Party; killers: string[]; npcIds: string[] }> {
  const party = await lobbyOf(colyseus, 2);
  pauseClock(party.room);
  for (let i = 0; i < npcs; i++) addNpcSeat(party.room, party.room.seeds.get('npcNames'));
  party.room.lobbyCommands.push({ sessionId: party.humans[0]!.id } as Client, C2S.lobbyStart, {});
  advance(party, 1);
  party.room.state.phaseEndsTick = party.room.state.tick;
  for (let i = 0; i < 40; i++) advance(party, 1);
  const killers = party.humans.map((h) => h.id);
  const npcIds = [...party.room.state.players.keys()].filter((id) => isNpcSeat(party.room, id));
  return { party, killers, npcIds };
}

const roleOf = (party: Party, id: string) => party.room.state.players.get(id)!.priv.role.roleId;

describe('the deal (world-mode.md 1.6)', () => {
  it('deals both humans the Killer card and marks only their private views', async () => {
    const { party, killers, npcIds } = await paintParty();
    const room = party.room;
    expect(isPaintTown(room)).toBe(true);
    for (const k of killers)
      expect([roleOf(party, k), room.state.players.get(k)!.priv.paintTown]).toEqual(['killer', true]);
    expect(npcIds.map((n) => roleOf(party, n))).toContain('vicar'); // a pillar is always dealt
    for (const n of npcIds) {
      expect(roleOf(party, n)).not.toBe('killer');
      expect(room.state.players.get(n)!.priv.paintTown).toBe(false);
    }
    expect(flowOf(room).deck.filter((c) => c === 'killer')).toHaveLength(2);
  });

  it('swaps the Accomplice, else the Drifter, else a profession for the second Killer; never the Vicar', () => {
    const rng = () => 0;
    expect(paintDeck(['killer', 'accomplice', 'vicar', 'baker'], rng)).toEqual([
      'killer',
      'killer',
      'vicar',
      'baker',
    ]);
    expect(paintDeck(['killer', 'drifter', 'vicar', 'baker'], rng)).toEqual([
      'killer',
      'killer',
      'vicar',
      'baker',
    ]);
    expect(paintDeck(['killer', 'detective', 'vicar', 'baker'], rng)).toEqual([
      'killer',
      'detective',
      'vicar',
      'killer',
    ]);
    expect(paintDeck(['killer', 'killer', 'vicar'], rng)).toEqual(['killer', 'killer', 'vicar']);
  });
});

describe('the Paint deal over many seeds (6Z: the Vicar is always dealt)', () => {
  it('deals both humans the Killer card and an NPC seat the Vicar, at every seat count and 200 seeds', () => {
    for (let n = 3; n <= 10; n++) {
      const humans = ['h1', 'h2'];
      const npcs = Array.from({ length: n - 2 }, (_, i) => `n${i}`);
      const deck = [...deckFor(Math.max(4, n)).cards];
      for (let seed = 1; seed <= 200; seed++) {
        const { dealt } = paintDeal(humans, npcs, deck, mulberry32(seed * 7919 + n));
        expect([dealt.get('h1'), dealt.get('h2')], `${n} seats, seed ${seed}`).toEqual(['killer', 'killer']);
        expect(
          npcs.some((id) => dealt.get(id) === 'vicar'),
          `${n} seats, seed ${seed}`,
        ).toBe(true);
        expect(npcs.every((id) => dealt.get(id) !== 'killer')).toBe(true);
      }
    }
  });
});

describe('the counts and the returns', () => {
  it('returns every NPC seat on the train, Knife and night too; counts unique and total; sends no count', async () => {
    const { party, killers, npcIds } = await paintParty();
    const room = party.room;
    const [k1, k2] = killers as [string, string];
    const [a, b] = npcIds as [string, string];
    room.state.phase = Phase.night;
    markDead(room, a, 'knife', k1);
    expect(isOnLine(room, a)).toBe(true);
    simOf(room).players.get(a)!.dead = false; // the train brought it back
    markDead(room, a, 'knife', k1);
    markDead(room, b, 'knife', k2);
    await sleep(150);
    expect(paintGameOver(room)).toEqual({
      target: Math.ceil(balance.paintTown.winUnique * npcIds.length),
      killers: [
        { seatId: k1, unique: 1, total: 2 },
        { seatId: k2, unique: 1, total: 1 },
      ],
    });
    // Nothing before game over carries a count (seams.md row 18).
    for (const h of party.humans)
      for (const e of h.log)
        expect(JSON.stringify(e.payload ?? '')).not.toMatch(/"(unique|total|paintTown)"/);
  });
});

describe('the outcome (GDD 3.8)', () => {
  it('wins Paint The Town Red at the unique target, and sends the counts in the game-over frame only', async () => {
    const { party, killers, npcIds } = await paintParty();
    const room = party.room;
    const target = Math.ceil(balance.paintTown.winUnique * npcIds.length);
    for (const n of npcIds.slice(0, target - 1)) markDead(room, n, 'knife', killers[0]);
    expect(evaluateWin(room)).toBeNull();
    markDead(room, npcIds[target - 1]!, 'knife', killers[1]);
    expect(evaluateWin(room)).toBe('paintTown');
    endMatch(room, 'paintTown');
    await sleep(150);
    const over = party.humans[0]!.log.find((e) => e.type === 'gameOver')?.payload as {
      winner: number;
      paintTown?: { target: number };
    };
    expect(over.winner).toBe(Winner.paintTown);
    expect(over.paintTown?.target).toBe(target);
  });

  it('wins when the Vicar, the Clerk and both Constables are dead at once', async () => {
    const { party } = await paintParty();
    const room = party.room;
    const vicar = [...room.state.players.keys()].find((id) => roleOf(party, id) === 'vicar');
    expect(vicar).toBeDefined();
    simOf(room).players.get(vicar!)!.dead = true;
    const guards = [...townsfolkMemory(room).figures.values()].filter(
      (f) => f.kind === 'clerk' || f.kind === 'constable',
    );
    expect(guards.length).toBeGreaterThanOrEqual(3);
    for (const g of guards.slice(1)) g.dead = true;
    expect(evaluateWin(room)).toBeNull(); // one pillar still stands
    guards[0]!.dead = true;
    expect(evaluateWin(room)).toBe('paintTown');
  });

  it('loses to the Village when both Killers are caught; one caught plays on; the end trial is the Village’s', async () => {
    const { party, killers } = await paintParty();
    const room = party.room;
    room.state.phase = Phase.night;
    markDead(room, killers[0]!, 'knife', killers[1]);
    expect(isCaught(room, killers[0]!)).toBe(true);
    expect(evaluateWin(room)).toBeNull();
    markDead(room, killers[1]!, 'wolf');
    expect(evaluateWin(room)).toBe('village');
    endMatch(room, 'cabal'); // the Final Night's Cabal verdict, with the town not painted
    expect(room.state.winner).toBe(Winner.village);
  });
});
