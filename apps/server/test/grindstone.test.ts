import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { interactions } from '@wdi/content';
import { C2S, TICK_RATE, type RefusalFrame } from '@wdi/shared';
import { addStack, count } from '../src/sim/Inventory';
import { wornOf } from '../src/sim/interact/resolve';
import { simOf } from '../src/sim/RoomSim';
import { advance, bootNpcServer, pauseClock, placeSeat, standardParty, type Party } from './npcHelpers';
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
