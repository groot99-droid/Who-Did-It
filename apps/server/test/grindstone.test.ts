import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { balance, interactions } from '@wdi/content';
import { C2S, Phase, TICK_RATE, type RefusalFrame } from '@wdi/shared';
import { addStack, count } from '../src/sim/Inventory';
import { wear, wornOf } from '../src/sim/interact/resolve';
import { mapScenesOf } from '../src/sim/MapSites';
import { workable } from '../src/sim/npc/chores';
import { npcMemory } from '../src/sim/npc/memory';
import { type Station, stationsOf } from '../src/sim/npc/routine';
import { simOf } from '../src/sim/RoomSim';
import {
  type Party,
  advance,
  allTownsfolk,
  bootNpcServer,
  holdPhase,
  npcIdsOf,
  pauseClock,
  placeSeat,
  standardParty,
} from './npcHelpers';
import { sleep } from './simHelpers';

// Round 10, x9 (A313; GDD 3.14): the grindstone restores a worn tool. A bare-handed hold of `holdS` at the lumber
// camp's grindstone forgets every use worn off the seat's tools; a seat with nothing worn is refused ALREADY_DONE
// with the table's line, and the Lockpicks' charges are not wear. Before x9 the stone had no class, so the hold
// was NO_TARGET.

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

const ticks = (s: number) => Math.round(s * TICK_RATE);
const STONE = 'bc.grindstone';
const PILE = 'fo.woodpile';
const sharpen = interactions.interactions.sharpenTools!;
const chopS = interactions.interactions.chopLumber!.modes[0]!.holdS!;
const sharpenS = sharpen.modes[0]!.holdS!;

async function party(): Promise<Party> {
  const p = await standardParty(colyseus, 'S1');
  pauseClock(p.room);
  p.room.state.players.get(p.humans[0]!.id)!.priv.inventory.slots.clear();
  return p;
}

/** White-box: stands the human beside a prop of any scene, since the resolver reads the seat's scene. */
function beside(p: Party, sceneId: 'forest' | 'bp_camp', tx: number, ty: number): void {
  placeSeat(p, p.humans[0]!.id, sceneId, tx, ty);
  advance(p, 1);
  p.humans[0]!.log.length = 0;
}

/**
 * Sends the hold and steps the paused room a tick at a time until the sim has answered it: the hold is on, or a
 * refusal came back. (A fixed wait before the one step let the message land late under load, and every tick count
 * after it drifted by one.)
 */
async function hold(p: Party, targetId: string): Promise<void> {
  const before = refusals(p).length;
  p.humans[0]!.room.send(C2S.hold, { action: 'interact', targetId, on: true });
  for (let i = 0; i < 40; i++) {
    await sleep(25);
    advance(p, 1);
    if (holdOf(p) !== null || refusals(p).length > before) return;
  }
}

const refusals = (p: Party): RefusalFrame[] =>
  p.humans[0]!.log.filter((m) => m.type === 'error').map((m) => m.payload as RefusalFrame);
const holdOf = (p: Party) => simOf(p.room).players.get(p.humans[0]!.id)?.hold ?? null;

/** Wears one use off the seat's Axe at the Gallows Wood woodpile. */
async function wearAxe(p: Party): Promise<void> {
  const seat = p.room.state.players.get(p.humans[0]!.id)!;
  addStack(seat, 'axe', 1);
  beside(p, 'forest', 23, 23);
  await hold(p, PILE);
  advance(p, ticks(chopS));
  expect(wornOf(p.room, p.humans[0]!.id, 'axe')).toBe(1);
}

describe('the grindstone (x9)', () => {
  it('restores a worn tool at the end of the hold and not before', async () => {
    const p = await party();
    const id = p.humans[0]!.id;
    await wearAxe(p);
    beside(p, 'bp_camp', 37, 12);
    await hold(p, STONE);
    expect(refusals(p)).toHaveLength(0);
    expect(holdOf(p)).toMatchObject({ action: 'interact', targetId: STONE });
    advance(p, ticks(sharpenS) - 1);
    expect(wornOf(p.room, id, 'axe')).toBe(1);
    advance(p, 1);
    expect(wornOf(p.room, id, 'axe')).toBe(0);
    expect(holdOf(p)).toBeNull();
    expect(count(p.room.state.players.get(id)!, 'axe')).toBe(1);
  });

  it('refuses a seat whose tools are whole ALREADY_DONE, with the line, and starts no hold', async () => {
    const p = await party();
    addStack(p.room.state.players.get(p.humans[0]!.id)!, 'axe', 1);
    beside(p, 'bp_camp', 37, 12);
    await hold(p, STONE);
    expect(refusals(p).at(-1)).toMatchObject({
      reason: 'ALREADY_DONE',
      msg: sharpen.fail.ALREADY_DONE,
      interaction: 'sharpenTools',
    });
    expect(holdOf(p)).toBeNull();
  });

  it('counts charges as no wear: a seat with only Lockpicks has nothing to sharpen', async () => {
    const p = await party();
    const seat = p.room.state.players.get(p.humans[0]!.id)!;
    addStack(seat, 'lockpicks', 1);
    beside(p, 'bp_camp', 37, 12);
    await hold(p, STONE);
    expect(refusals(p).at(-1)).toMatchObject({ reason: 'ALREADY_DONE', interaction: 'sharpenTools' });
    expect(count(seat, 'lockpicks')).toBe(1);
  });
});

// Review change (6Z, 2026-10-30; GDD 3.12 "Hidden seats"): a verb a seat can be seen doing is one NPC seats also do,
// or a figure at the wheel would mark a human. The stone is a chore station (`routines.json`: `grindstone` under
// `gather`, hold `interact`): a seat with a worn tool works it by its chores; one with whole tools never walks to it.
describe('the grindstone as an NPC chore (x9 review)', () => {
  const { routine } = balance.npc;
  const weights = routine.weights as { day: { work: number; stroll: number; idle: number } };
  const savedDay = { ...weights.day };
  afterEach(() => void Object.assign(weights.day, savedDay));

  /** One NPC alive on the stone's stand, working only, the stone its favourite; white-box on the BlackPine map. */
  async function npcAtStone(): Promise<{ party: Party; id: string; st: Station }> {
    const party = await standardParty(colyseus, 'S1');
    allTownsfolk(party.room);
    party.room.state.settings.map = 'blackpine';
    const [id] = npcIdsOf('S1') as [string];
    const human = party.humans[0]!.id;
    for (const [seat, p] of simOf(party.room).players) p.dead = seat !== id && seat !== human;
    const st = stationsOf(mapScenesOf(party.room), simOf(party.room).profile).find(
      (s) => s.propId === STONE,
    )!;
    expect(st).toMatchObject({ cls: 'grindstone', activity: 'gather' });
    placeSeat(party, id, st.scene, st.stands[0]!.x, st.stands[0]!.y);
    party.room.state.players.get(id)!.priv.inventory.slots.clear();
    Object.assign(weights.day, { work: 1, stroll: 0, idle: 0 });
    npcMemory(party.room).brain(id).persona = { home: 'bp_smithy', favourites: [STONE] };
    holdPhase(party, Phase.day, 3600);
    return { party, id, st };
  }

  it('sends a seat with a worn Axe to the stone, which it works through the human verb until the Axe is whole', async () => {
    const { party, id, st } = await npcAtStone();
    const seat = party.room.state.players.get(id)!;
    const p = simOf(party.room).players.get(id)!;
    addStack(seat, 'axe', 1);
    wear(party.room, id, seat, 'axe', 1);
    expect(wornOf(party.room, id, 'axe')).toBe(1);
    expect(workable(party.room, seat, st)).toBe(true);
    let held = '';
    for (let i = 0; i < 40 * TICK_RATE && wornOf(party.room, id, 'axe') > 0; i++)
      advance(party, 1, () => void (p.hold && (held = `${p.hold.action}:${p.hold.targetId}`)));
    expect(held).toBe(`interact:${STONE}`);
    expect(wornOf(party.room, id, 'axe')).toBe(0);
    expect(count(seat, 'axe')).toBe(1);
    expect(workable(party.room, seat, st)).toBe(false);
  });

  it('keeps a seat with whole tools away: the stone never qualifies and it starts no hold there', async () => {
    const { party, id, st } = await npcAtStone();
    const seat = party.room.state.players.get(id)!;
    const p = simOf(party.room).players.get(id)!;
    addStack(seat, 'axe', 1);
    expect(workable(party.room, seat, st)).toBe(false);
    let atStone = 0;
    advance(party, 30 * TICK_RATE, () => void (p.hold?.targetId === STONE && atStone++));
    expect(atStone).toBe(0);
    // Its other chores may have worn the Axe by now (a tree takes a use): the stone qualifies exactly then.
    expect(workable(party.room, seat, st)).toBe(wornOf(party.room, id, 'axe') > 0);
  });
});
