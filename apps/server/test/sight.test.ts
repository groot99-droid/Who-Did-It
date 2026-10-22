import type { ColyseusTestServer } from '@colyseus/testing';
import { ItemStack, Phase } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { avatarMemory } from '../src/sim/Avatars';
import { StatusBit } from '../src/sim/constants';
import { setLight } from '../src/sim/mobs/light';
import { simOf } from '../src/sim/RoomSim';
import { canSee } from '../src/sim/Sight';
import { avatarsHeld } from './avatarHelpers';
import { bootFlowServer, idOf, murder, sim, startParty, until } from './flowHelpers';
import { setPhase, teleport } from './killHelpers';
import { type Match, sleep } from './simHelpers';

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootFlowServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

const giveLantern = (m: Match, i: number): void => {
  const slots = m.room.state.players.get(idOf(m, i))!.priv.inventory.slots;
  const lantern = new ItemStack();
  lantern.defId = 'lantern';
  lantern.qty = 1;
  slots.push(lantern);
  expect(setLight(m.room, idOf(m, i), true)).toBe(true);
};

/** The seats whose avatar bot `i` holds, its own excluded. */
const seen = (m: Match, i: number): string[] =>
  avatarsHeld(m.bots[i]!)
    .map((a) => avatarMemory(m.room).seatOf.get(a.handle) as string)
    .filter((id) => id !== idOf(m, i))
    .sort();

// cave_entry (dark; 20 x 14): moss pools of 2 tiles at (3, 2), (16, 5) and (4, 11); the mouth's daylight shaft at
// (10, 12) burns by day and dusk only; a wall block at (7..8, 4..5).
describe('sight in a dark scene (GDD 3.15)', () => {
  it('within the night radius and in line of sight only; a wall hides; a lit light widens both ways', async () => {
    const m = await startParty(colyseus, 4);
    setPhase(m, Phase.night);
    teleport(m, m.bots[0]!, 'cave_entry', 10, 2);
    teleport(m, m.bots[1]!, 'cave_entry', 12, 2); // 2 tiles
    teleport(m, m.bots[2]!, 'cave_entry', 15, 2); // 5 tiles
    teleport(m, m.bots[3]!, 'cave_entry', 12, 9); // about 7.3 tiles, in no pool
    const s = (i: number) => sim(m, i);
    expect(canSee(m.room, s(0), s(0))).toBe(true);
    expect(canSee(m.room, s(0), s(1))).toBe(true);
    expect(canSee(m.room, s(0), s(2))).toBe(false);
    expect(canSee(m.room, s(0), s(3))).toBe(false);
    giveLantern(m, 2); // 3.5 + 2 tiles: the carrier is seen from further away
    expect(canSee(m.room, s(0), s(2))).toBe(true);
    expect(canSee(m.room, s(2), s(0))).toBe(true); // and sees further
    expect(canSee(m.room, s(2), s(3))).toBe(false);
    setLight(m.room, idOf(m, 2), false);
    expect(canSee(m.room, s(0), s(2))).toBe(false);

    teleport(m, m.bots[0]!, 'cave_entry', 6, 4);
    teleport(m, m.bots[1]!, 'cave_entry', 9, 4); // 3 tiles, behind the wall block
    expect(canSee(m.room, s(0), s(1))).toBe(false);
  });

  it('a seat standing in a burning scene light is seen across the dark; the shaft is out at night', async () => {
    const m = await startParty(colyseus, 4);
    setPhase(m, Phase.night);
    teleport(m, m.bots[0]!, 'cave_entry', 10, 2);
    teleport(m, m.bots[1]!, 'cave_entry', 16, 5); // in the moss pool, about 6.7 tiles
    teleport(m, m.bots[2]!, 'cave_entry', 10, 11); // under the shaft, 9 tiles
    expect(canSee(m.room, sim(m, 0), sim(m, 1))).toBe(true);
    expect(canSee(m.room, sim(m, 0), sim(m, 2))).toBe(false);
    setPhase(m, Phase.day);
    expect(canSee(m.room, sim(m, 0), sim(m, 2))).toBe(true);
  });

  it('a scene that is not dark is seen whole, by day and by night', async () => {
    const m = await startParty(colyseus, 4);
    setPhase(m, Phase.night);
    teleport(m, m.bots[0]!, 'forest', 3, 3);
    teleport(m, m.bots[1]!, 'forest', 30, 20);
    expect(canSee(m.room, sim(m, 0), sim(m, 1))).toBe(true);
  });

  it('on the wire: a living client holds no avatar it cannot see, a ghost holds all, and the lantern bit is public', async () => {
    const m = await startParty(colyseus, 4);
    setPhase(m, Phase.night);
    teleport(m, m.bots[0]!, 'cave_entry', 10, 2);
    teleport(m, m.bots[1]!, 'cave_entry', 12, 2);
    teleport(m, m.bots[2]!, 'cave_entry', 15, 2);
    teleport(m, m.bots[3]!, 'cave_entry', 6, 9);
    const ids = (...idx: number[]) => idx.map((i) => idOf(m, i)).sort();
    expect(await until(() => seen(m, 0).join() === ids(1).join())).toBe(true);
    await sleep(300);
    expect(seen(m, 0)).toEqual(ids(1));
    expect(seen(m, 3)).toEqual([]);

    giveLantern(m, 2);
    expect(await until(() => seen(m, 0).join() === ids(1, 2).join())).toBe(true);
    const lit = avatarsHeld(m.bots[0]!).find(
      (a) => avatarMemory(m.room).seatOf.get(a.handle) === idOf(m, 2),
    )!;
    expect(lit.avatar.statusBits & StatusBit.lantern).toBe(StatusBit.lantern);
    const plain = avatarsHeld(m.bots[0]!).find(
      (a) => avatarMemory(m.room).seatOf.get(a.handle) === idOf(m, 1),
    )!;
    expect(plain.avatar.statusBits & StatusBit.lantern).toBe(0);

    murder(m, 3); // bot 3 is a ghost now: it sees every avatar of its scene, however dark
    expect(await until(() => seen(m, 3).join() === ids(0, 1, 2).join())).toBe(true);
    expect(simOf(m.room).players.get(idOf(m, 3))?.dead).toBe(true);
  });
});
