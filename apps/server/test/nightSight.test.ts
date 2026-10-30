import type { ColyseusTestServer } from '@colyseus/testing';
import { balance } from '@wdi/content';
import { Phase } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { avatarMemory } from '../src/sim/Avatars';
import { canSee } from '../src/sim/Sight';
import { seatAvatarsHeld } from './avatarHelpers';
import { bootFlowServer, idOf, murder, sim, startParty, until } from './flowHelpers';
import { setPhase, teleport } from './killHelpers';
import { type Match, sleep } from './simHelpers';

// Round 8, 8L (docs/round8/teardown.md 1.2, GDD 3.7 and 3.15): at night every scene is dark on the server, not only
// the `"dark": true` ones; by day, at dusk and at dawn an ordinary scene is still seen whole. Ghosts see everything.

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootFlowServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

const NIGHT = balance.vision.nightTiles;

/** The seats whose avatar bot `i` holds, its own excluded (round 10, x5: the figures of the scene left out). */
const seen = (m: Match, i: number): string[] =>
  seatAvatarsHeld(m, m.bots[i]!)
    .map((a) => avatarMemory(m.room).seatOf.get(a.handle) as string)
    .filter((id) => id !== idOf(m, i))
    .sort();

/** Four seats along the forest's open top row (y 1): one within the night radius, two well beyond it. */
function lineUp(m: Match): void {
  teleport(m, m.bots[0]!, 'forest', 7, 1);
  teleport(m, m.bots[1]!, 'forest', 7 + Math.floor(NIGHT) - 1, 1);
  teleport(m, m.bots[2]!, 'forest', 7 + Math.ceil(NIGHT) + 6, 1);
  teleport(m, m.bots[3]!, 'forest', 35, 1);
}

describe('night sight in every scene (8L)', () => {
  it('an ordinary scene is seen whole by day, at dusk and at dawn, and only within the night radius at night', async () => {
    const m = await startParty(colyseus, 4);
    lineUp(m);
    const s = (i: number) => sim(m, i);
    for (const phase of [Phase.day, Phase.dusk, Phase.dawn]) {
      setPhase(m, phase);
      expect(canSee(m.room, s(0), s(1))).toBe(true);
      expect(canSee(m.room, s(0), s(2))).toBe(true);
      expect(canSee(m.room, s(0), s(3))).toBe(true);
    }
    for (const phase of [Phase.night, Phase.finalNight]) {
      setPhase(m, phase);
      expect(canSee(m.room, s(0), s(1))).toBe(true);
      expect(canSee(m.room, s(0), s(2))).toBe(false);
      expect(canSee(m.room, s(0), s(3))).toBe(false);
    }
  });

  it('on the wire: a living client at night holds only the avatars it can see; a ghost holds all', async () => {
    const m = await startParty(colyseus, 4);
    setPhase(m, Phase.day);
    lineUp(m);
    const ids = (...idx: number[]) => idx.map((i) => idOf(m, i)).sort();
    expect(await until(() => seen(m, 0).length === 3)).toBe(true);

    setPhase(m, Phase.night);
    expect(await until(() => seen(m, 0).join() === ids(1).join())).toBe(true);
    await sleep(300);
    expect(seen(m, 0)).toEqual(ids(1));
    expect(seen(m, 3)).toEqual([]);

    murder(m, 3, 1);
    expect(await until(() => seen(m, 3).join() === ids(0, 1, 2).join())).toBe(true);

    setPhase(m, Phase.day);
    expect(await until(() => seen(m, 0).join() === ids(1, 2).join())).toBe(true); // the dead are never shown
  });
});
