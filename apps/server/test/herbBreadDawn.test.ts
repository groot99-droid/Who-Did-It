import type { ColyseusTestServer } from '@colyseus/testing';
import { balance } from '@wdi/content';
import { Phase, TICK_RATE } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hasEffect } from '../src/sim/body/effects';
import { bodyOf } from '../src/sim/body/state';
import { addStack, count } from '../src/sim/Inventory';
import {
  advance,
  allTownsfolk,
  bootNpcServer,
  holdPhase,
  type Human,
  lobbyOf,
  type Party,
  pauseClock,
  start,
  toWorld,
} from './npcHelpers';
import { sleep } from './simHelpers';

// Round 10, x11 (A413; GDD 3.14): the Herb Bread's Resistant lasts until the next dawn, not a clock. Before the
// fix it ran `effects.json`'s 780 s whatever the phase (`untilTick` set, and off after 15600 ticks of night).

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

/** Two humans in their first world phase, off the room's clock, on cards without a night power. */
async function party(): Promise<Party> {
  const p = await lobbyOf(colyseus, 2);
  await start(p);
  await toWorld(p);
  pauseClock(p.room);
  allTownsfolk(p.room);
  advance(p, 1);
  return p;
}

/** The old clock, in ticks, plus a margin: the buff must outlast it. */
const OLD_CLOCK = 780 * TICK_RATE + 20;

async function eat(p: Party, h: Human): Promise<void> {
  const seat = p.room.state.players.get(h.id)!;
  addStack(seat, 'herbBread', 1);
  h.room.send('act.ability', { abilityId: 'eatHerbBread' });
  await sleep(60);
  advance(p, 1);
  expect(count(seat, 'herbBread')).toBe(0);
  expect(hasEffect(bodyOf(p.room, h.id)!, 'resistant')).toBe(true);
}

const resistant = (p: Party, h: Human) => hasEffect(bodyOf(p.room, h.id)!, 'resistant');

describe('the Herb Bread lasts until the dawn', () => {
  it('a loaf eaten at night outlasts the old clock and ends when the night turns to day', async () => {
    const p = await party();
    const h = p.humans[0]!;
    holdPhase(p, Phase.night, 2000);
    await eat(p, h);
    expect(bodyOf(p.room, h.id)!.effects.get('resistant')!.untilTick).toBe(0); // no clock
    advance(p, OLD_CLOCK);
    expect(p.room.state.phase).toBe(Phase.night);
    expect(resistant(p, h)).toBe(true);
    holdPhase(p, Phase.day, balance.phases.dayS);
    advance(p, 1);
    expect(resistant(p, h)).toBe(false);
  });

  it('a loaf eaten by day lasts through the dusk and the night to the next dawn', async () => {
    const p = await party();
    const h = p.humans[0]!;
    const other = p.humans[1]!;
    holdPhase(p, Phase.day, 2000);
    await eat(p, h);
    advance(p, OLD_CLOCK);
    expect(resistant(p, h)).toBe(true);
    expect(resistant(p, other)).toBe(false); // only the eater's body
    holdPhase(p, Phase.dusk, balance.phases.duskS);
    advance(p, 2);
    expect(resistant(p, h)).toBe(true);
    holdPhase(p, Phase.night, balance.phases.nightS);
    advance(p, 2);
    expect(resistant(p, h)).toBe(true);
    holdPhase(p, Phase.day, balance.phases.dayS);
    advance(p, 1);
    expect(resistant(p, h)).toBe(false);
  });
});
