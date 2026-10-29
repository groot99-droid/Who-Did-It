import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { interactions, items, type Interaction } from '@wdi/content';
import { C2S, PropState, REFUSAL_REASONS, TICK_RATE, type RefusalFrame } from '@wdi/shared';
import { handleHold } from '../src/sim/Hold';
import { addStack, count } from '../src/sim/Inventory';
import { wornOf } from '../src/sim/interact/resolve';
import { simOf } from '../src/sim/RoomSim';
import { advance, bootNpcServer, pauseClock, placeSeat, send, standardParty, type Party } from './npcHelpers';
import { sleep } from './simHelpers';

// Round 10 (A10; docs/round9/logic-table.md 4, GDD 3.14): the logic table's resolver behind `act.hold {action:
// 'interact'}`. interactions.json holds no interaction until A11, so the test registers a fixture wall: a test axe
// that chops the Gallows Wood woodpile.

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

const PILE = 'fo.woodpile';
const RESPAWN_S = 10;
const HOLD_S = 1;
const LINE = 'You tug at the timber. An axe would.';
const chop: Interaction = {
  verb: 'chop',
  label: 'Chop',
  target: 'testLumber',
  handler: 'stock',
  status: 'live',
  phases: ['day', 'night'],
  modes: [
    {
      tool: { tag: 'cut', tier: 1 },
      holdS: HOLD_S,
      drops: [{ item: 'timber', qty: [2, 2] }],
      wear: 1,
      noise: 'crowbar',
    },
  ],
  after: { state: 'cut', respawnS: RESPAWN_S },
  ownership: 'wild',
  fail: { NEED_TOOL: LINE },
  ships: 'V1',
};

beforeEach(() => {
  interactions.classes.testLumber = { name: 'Test lumber', match: { stems: ['woodpile'] } };
  interactions.interactions.testChop = chop;
  items.items.testAxe = { ...items.items.spade!, id: 'testAxe', name: 'Test axe', tool: { cut: 1 }, uses: 2 };
});
afterEach(() => {
  delete interactions.classes.testLumber;
  delete interactions.interactions.testChop;
  delete items.items.testAxe;
});

const ticks = (s: number) => Math.round(s * TICK_RATE);

async function atPile(): Promise<Party> {
  const p = await standardParty(colyseus, 'S1');
  pauseClock(p.room);
  const human = p.humans[0]!;
  placeSeat(p, human.id, 'forest', 23, 23);
  p.room.state.players.get(human.id)!.priv.inventory.slots.clear();
  advance(p, 1);
  return p;
}

async function hold(p: Party, on = true): Promise<void> {
  await send(p.humans[0]!, C2S.hold, { action: 'interact', targetId: PILE, on }, 60);
  advance(p, 1);
  await sleep(80);
}

const refusals = (p: Party): RefusalFrame[] =>
  p.humans[0]!.log.filter((m) => m.type === 'error').map((m) => m.payload as RefusalFrame);
const stateOf = (p: Party) => p.room.state.scenes.get('forest')!.propStates.get(PILE);

describe('the resolver', () => {
  it('refuses a seat without the tool NEED_TOOL, with the line and the tool it needs', async () => {
    const p = await atPile();
    await hold(p);
    expect(refusals(p).at(-1)).toMatchObject({
      reason: 'NEED_TOOL',
      args: { need: 'testAxe', tier: 1 },
      msg: LINE,
      interaction: 'testChop',
    });
    expect(simOf(p.room).players.get(p.humans[0]!.id)?.hold).toBeNull();
  });

  it('with the tool, lands the drops, wears the tool and breaks it when its uses run out', async () => {
    const p = await atPile();
    const seat = p.room.state.players.get(p.humans[0]!.id)!;
    addStack(seat, 'testAxe', 1);
    await hold(p);
    advance(p, ticks(HOLD_S) - 3);
    expect(count(seat, 'timber')).toBe(0);
    advance(p, 3);
    expect(count(seat, 'timber')).toBe(2);
    expect(wornOf(p.room, p.humans[0]!.id, 'testAxe')).toBe(1);
    advance(p, ticks(RESPAWN_S));
    await hold(p);
    advance(p, ticks(HOLD_S));
    expect(count(seat, 'timber')).toBe(4);
    expect(count(seat, 'testAxe')).toBe(0);
  });

  it('leaves public state that says nothing of who, refuses the cut pile, and respawns it', async () => {
    const p = await atPile();
    addStack(p.room.state.players.get(p.humans[0]!.id)!, 'testAxe', 1);
    await hold(p);
    advance(p, ticks(HOLD_S));
    const state = stateOf(p)!;
    expect(Object.keys(state.toJSON()).sort()).toEqual(['id', 'state', 'untilTick']);
    expect(Object.keys(new PropState().toJSON()).sort()).toEqual(['id', 'state', 'untilTick']);
    expect(state.state).toBe('cut');
    await hold(p);
    expect(refusals(p).at(-1)?.reason).toBe('NOTHING_THERE');
    advance(p, ticks(RESPAWN_S));
    expect(stateOf(p)).toBeUndefined();
  });

  it('is cancelled by movement and does nothing', async () => {
    const p = await atPile();
    const human = p.humans[0]!;
    const seat = p.room.state.players.get(human.id)!;
    addStack(seat, 'testAxe', 1);
    await hold(p);
    await send(human, C2S.move, { seq: 1, dx: 1, dy: 0, sprint: false, sneak: false }, 100);
    advance(p, ticks(HOLD_S) + 5);
    expect(count(seat, 'timber')).toBe(0);
    expect(stateOf(p)).toBeUndefined();
  });

  it('runs an NPC seat hold through the same resolver', async () => {
    const p = await atPile();
    const npc = [...p.room.state.players.keys()].find((id) => id !== p.humans[0]!.id)!;
    placeSeat(p, npc, 'forest', 23, 23);
    const seat = p.room.state.players.get(npc)!;
    seat.priv.inventory.slots.clear();
    handleHold(p.room, npc, { action: 'interact', targetId: PILE, on: true });
    expect(simOf(p.room).players.get(npc)?.hold).toBeNull();
    addStack(seat, 'testAxe', 1);
    handleHold(p.room, npc, { action: 'interact', targetId: PILE, on: true });
    expect(simOf(p.room).players.get(npc)?.hold?.action).toBe('interact');
    advance(p, ticks(HOLD_S));
    expect(count(seat, 'timber')).toBe(2);
    expect(stateOf(p)?.state).toBe('cut');
  });
});

describe('interactions.json fail keys', () => {
  it('are refusal reasons', () => {
    for (const [id, it] of Object.entries(interactions.interactions))
      for (const key of Object.keys(it.fail)) expect(REFUSAL_REASONS, `${id}.${key}`).toContain(key);
  });
});
