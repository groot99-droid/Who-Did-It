import type { ColyseusTestServer } from '@colyseus/testing';
import { ErrorCode, Phase } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerNpcSeat } from '../src/sim/Npc';
import { npcMemory } from '../src/sim/npc/memory';
import { handleOf, settle } from './avatarHelpers';
import { bootFlowServer, idOf, seat, sim, startParty } from './flowHelpers';
import { act, errorCodes, openRun, setPhase, teleport } from './killHelpers';
import type { Bot, Match } from './simHelpers';

// Round 8 (GDD 3.22 "Inspect"; docs/round8/body.md 8), Session 8B.

vi.setConfig({ testTimeout: 40_000 });

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootFlowServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

/** Bot0 Killer, Bot1 Detective, Bot2 Doctor, Bot3 and Bot4 Townsfolk; all in a row in the overworld, by day. */
async function lineUp(): Promise<Match> {
  const m = await startParty(colyseus, 5);
  setPhase(m, Phase.day);
  const at = openRun('overworld', 5);
  m.bots.forEach((bot, i) => teleport(m, bot, 'overworld', at.x + i, at.y));
  settle(m, ...m.bots);
  const looks = ['baker', 'detective', 'doctor', 'fisher', 'tinner'];
  looks.forEach((look, i) => (seat(m, i).look = look));
  return m;
}

const inspect = (m: Match, by: number, of: number) =>
  act(m.bots[by]!, 'act.inspect', { targetId: handleOf(m, m.bots[of]!) }, 150);
const inspectEvents = (bot: Bot) => bot.events.filter((e) => e.type.startsWith('inspect.'));
const clearEvents = (m: Match) => m.bots.forEach((bot) => (bot.events.length = 0));
const clearCooldowns = (m: Match) =>
  m.bots.forEach((_, i) => seat(m, i).priv.cooldownEndTick.delete('inspect'));

describe('act.inspect', () => {
  it('tells the inspector only physical signs and bands, and the inspected seat only the look', async () => {
    const m = await lineUp();
    sim(m, 2).bloodyUntilTick = m.room.state.tick + 10_000;
    await inspect(m, 1, 2);
    const results = inspectEvents(m.bots[1]!);
    expect(results).toEqual([
      {
        type: 'inspect.result',
        payload: {
          targetId: handleOf(m, m.bots[2]!),
          lookId: 'doctor',
          signs: ['inspect.sign.bloody'],
          health: 'unhurt',
          purse: 'unknown',
          light: false,
        },
      },
    ]);
    expect(inspectEvents(m.bots[2]!)).toEqual([
      { type: 'inspect.noticed', payload: { lookId: 'detective' } },
    ]);
    for (const i of [0, 3, 4]) expect(inspectEvents(m.bots[i]!)).toEqual([]);
  });

  it('refuses self, a stranger handle, the far, the cooldown, the dead and the lobby', async () => {
    const m = await lineUp();
    const b = m.bots[1]!;
    await inspect(m, 1, 1);
    await act(b, 'act.inspect', { targetId: 'nobody' }, 150);
    await inspect(m, 1, 4); // three tiles away
    await inspect(m, 1, 2);
    await inspect(m, 1, 0); // on cooldown
    clearCooldowns(m);
    sim(m, 0).dead = true;
    await inspect(m, 1, 0);
    clearCooldowns(m);
    setPhase(m, Phase.lobby);
    await inspect(m, 1, 2);
    expect(errorCodes(b)).toEqual([
      ErrorCode.cannot,
      ErrorCode.cannot,
      ErrorCode.outOfRange,
      ErrorCode.cooldown,
      ErrorCode.cannot,
      ErrorCode.wrongPhase,
    ]);
    expect(inspectEvents(b).map((e) => e.type)).toEqual(['inspect.result']);
  });

  it('reads a cover-wearer and a true wearer of the same look alike', async () => {
    const m = await lineUp();
    seat(m, 0).look = 'detective'; // the Killer walks under the Detective's look
    const at = openRun('overworld', 5);
    [0, 3, 1, 2, 4].forEach((i, x) => teleport(m, m.bots[i]!, 'overworld', at.x + x, at.y));
    settle(m, ...m.bots);
    clearEvents(m);
    await inspect(m, 3, 0); // the cover-wearer, one tile west
    clearCooldowns(m);
    await inspect(m, 3, 1); // the true wearer, one tile east
    const [cover, truth] = inspectEvents(m.bots[3]!).map((e) => {
      const { targetId: _t, ...rest } = e.payload as Record<string, unknown>;
      return { type: e.type, ...rest };
    });
    expect(cover).toEqual({
      type: 'inspect.result',
      lookId: 'detective',
      signs: [],
      health: 'unhurt',
      purse: 'unknown',
      light: false,
    });
    expect(cover).toEqual(truth);
    expect(inspectEvents(m.bots[0]!)).toEqual(inspectEvents(m.bots[1]!));
  });

  it('raises the inspector in the suspicion of the NPCs who saw it, and hunches the inspected', async () => {
    const m = await lineUp();
    registerNpcSeat(m.room, idOf(m, 4)); // a witness
    clearEvents(m);
    await inspect(m, 0, 1); // the Cabal studies the Detective: `faction:cabal -> role:detective`
    expect(npcMemory(m.room).brain(idOf(m, 4)).suspicion.get(idOf(m, 0))).toBe(1);
    expect(inspectEvents(m.bots[1]!)).toEqual([
      { type: 'inspect.noticed', payload: { lookId: 'baker' } },
      { type: 'inspect.hunch', payload: { copyId: 'inspect.hunch.measured' } },
    ]);
    const matched = inspectEvents(m.bots[2]!);
    clearCooldowns(m);
    await inspect(m, 3, 2); // no row holds
    expect(npcMemory(m.room).brain(idOf(m, 4)).suspicion.get(idOf(m, 3))).toBeUndefined();
    expect(inspectEvents(m.bots[2]!).map((e) => e.type)).toEqual(['inspect.noticed']);
    // A third client receives nothing from either look, matched or not.
    expect(matched).toEqual([]);
  });
});
