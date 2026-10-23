import type { ColyseusTestServer } from '@colyseus/testing';
import { clues } from '@wdi/content';
import { Phase } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { StatusBit } from '../src/sim/constants';
import { avatarsHeld } from './avatarHelpers';
import { bootFlowServer, idOf, murder, sim, startParty, until } from './flowHelpers';
import { setPhase, teleport } from './killHelpers';
import { type Match, sleep } from './simHelpers';

// Round 8, 8L (docs/round8/teardown.md 1.1, GDD 3.4): Blood reaches a client only within
// `clues.blood.params.visibleTiles` of the bloodied avatar, or a ghost's; `Avatar.statusBits` never carries it.

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootFlowServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

type Decoded = { triggerChanges?: (changes: Array<{ field: string; value: unknown }>) => void };

const RANGE = clues.clues.blood!.params!.visibleTiles!;

/** What bot `i`'s client holds of seat 0's avatar: its public bits and its near bits. */
const heldOf0 = (m: Match, i: number) => {
  const a = avatarsHeld(m.bots[i]!).find((h) => h.avatar.lookOf === idOf(m, 0))?.avatar;
  return a ? { statusBits: a.statusBits, near: a.nearBits ?? 0 } : undefined;
};
const bloodyFor = (m: Match, i: number) => ((heldOf0(m, i)?.near ?? 0) & StatusBit.bloody) !== 0;

describe('Blood by range (8L)', () => {
  it('only a client within range holds the bit; walking out drops it, walking in brings it', async () => {
    const m = await startParty(colyseus, 4);
    setPhase(m, Phase.day);
    teleport(m, m.bots[0]!, 'forest', 3, 3);
    teleport(m, m.bots[1]!, 'forest', 3 + Math.floor(RANGE), 3); // within range
    teleport(m, m.bots[2]!, 'forest', 3 + Math.ceil(RANGE) + 3, 3); // out of range
    teleport(m, m.bots[3]!, 'forest', 30, 20);
    sim(m, 0).bloodyUntilTick = m.room.state.tick + 6000;
    expect(await until(() => bloodyFor(m, 1))).toBe(true);
    await sleep(300);
    expect(heldOf0(m, 2)).toBeDefined(); // the figure itself is seen by day
    expect(bloodyFor(m, 2)).toBe(false);
    expect(bloodyFor(m, 3)).toBe(false);
    for (const i of [1, 2, 3]) expect((heldOf0(m, i)?.statusBits ?? 0) & StatusBit.bloody).toBe(0);
    // The own presence still carries it for the killer's own client.
    expect(m.room.state.players.get(idOf(m, 0))!.presence.statusBits & StatusBit.bloody).toBe(
      StatusBit.bloody,
    );

    teleport(m, m.bots[1]!, 'forest', 30, 3);
    expect(await until(() => !bloodyFor(m, 1))).toBe(true);
    teleport(m, m.bots[2]!, 'forest', 4, 3);
    expect(await until(() => bloodyFor(m, 2))).toBe(true);
  });

  it('Blood washed off out of range never reads on the way back in', async () => {
    const m = await startParty(colyseus, 4);
    setPhase(m, Phase.day);
    teleport(m, m.bots[0]!, 'forest', 3, 3);
    teleport(m, m.bots[1]!, 'forest', 4, 3);
    sim(m, 0).bloodyUntilTick = m.room.state.tick + 6000;
    expect(await until(() => bloodyFor(m, 1))).toBe(true);
    teleport(m, m.bots[1]!, 'forest', 30, 3);
    expect(await until(() => !bloodyFor(m, 1))).toBe(true);
    sim(m, 0).bloodyUntilTick = 0;
    await sleep(200);
    teleport(m, m.bots[1]!, 'forest', 4, 3);
    await sleep(500);
    expect(heldOf0(m, 1)).toBeDefined();
    expect(bloodyFor(m, 1)).toBe(false);
  });

  it('the encoded patches an out-of-range client decodes never carry the bit, not even for one change', async () => {
    const m = await startParty(colyseus, 4);
    setPhase(m, Phase.day);
    teleport(m, m.bots[0]!, 'forest', 3, 3);
    teleport(m, m.bots[1]!, 'forest', 4, 3); // within range: the control
    teleport(m, m.bots[2]!, 'forest', 3 + Math.ceil(RANGE) + 3, 3);
    // Every change the client's decoder reads from the raw patch bytes, before any state is folded or replaced.
    const bloodyChanges = (i: number) => {
      const seen: unknown[] = [];
      const decoder = (m.bots[i]!.room as unknown as { serializer: { decoder: Decoded } }).serializer.decoder;
      const prev = decoder.triggerChanges;
      decoder.triggerChanges = (changes) => {
        for (const c of changes)
          if (
            typeof c.value === 'number' &&
            c.value & StatusBit.bloody &&
            /^(statusBits|nearBits)$/.test(c.field)
          )
            seen.push(c);
        prev?.(changes);
      };
      return seen;
    };
    const near = bloodyChanges(1);
    const far = bloodyChanges(2);
    expect(await until(() => heldOf0(m, 2) !== undefined)).toBe(true);
    sim(m, 0).bloodyUntilTick = m.room.state.tick + 6000;
    expect(await until(() => near.length > 0)).toBe(true);
    await sleep(500);
    expect(far).toEqual([]);
  });

  it('a ghost holds the bit at any distance', async () => {
    const m = await startParty(colyseus, 4);
    setPhase(m, Phase.day);
    teleport(m, m.bots[0]!, 'forest', 3, 3);
    teleport(m, m.bots[2]!, 'forest', 30, 20);
    murder(m, 2, 1);
    sim(m, 0).bloodyUntilTick = m.room.state.tick + 6000;
    expect(await until(() => bloodyFor(m, 2))).toBe(true);
  });
});
