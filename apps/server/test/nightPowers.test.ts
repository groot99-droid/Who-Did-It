import { ColyseusTestServer, boot } from '@colyseus/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { abilities, balance, clues } from '@wdi/content';
import { ErrorCode, NoteKind, Phase, SPENT_TONIGHT, TICK_RATE, Team } from '@wdi/shared';
import { createServer } from '../src/server';
import { flowOf } from '../src/sim/Flow';
import { npcMemory } from '../src/sim/npc/memory';
import { registerNpcSeat } from '../src/sim/Npc';
import { simOf } from '../src/sim/RoomSim';
import {
  diffPaths,
  flatten,
  placeAtPx,
  playerOf,
  readyKnife,
  record,
  setPhase,
  sleep,
  teleport,
} from './killHelpers';
import { act } from './killHelpers';
import { handleOf, settle, withoutFigureRows } from './avatarHelpers';
import { errorCodes, giveKit, nightfall, notes, power, refusals, toPhase } from './nightHelpers';
import { type Match, startMatch, stateOf } from './simHelpers';

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  process.env.WDI_DEBUG = '1';
  colyseus = await boot(createServer({ ipBurst: 1e5, ipPerMin: 1e8, globalPerMin: 1e8 }));
});
afterAll(async () => {
  delete process.env.WDI_DEBUG;
  await colyseus.shutdown();
});
beforeEach(async () => colyseus.cleanup());

// Seats: 0 Killer, 1 Vicar, 2 Watchman, 3 Herbalist, 4 Gamekeeper, 5 Townsfolk, 6 Doctor.
async function party(): Promise<Match> {
  const m = await startMatch(colyseus, 7, {
    Bot0: 'killer',
    Bot1: 'vicar',
    Bot2: 'watchman',
    Bot3: 'herbalist',
    Bot4: 'gamekeeper',
    Bot5: 'townsfolk',
    Bot6: 'doctor',
  });
  for (const b of m.bots) giveKit(m, b);
  return m;
}
const id = (m: Match, i: number) => m.bots[i]!.id;
const ROW = 22;

describe('night powers: refusals in order (deck/wire.md 5)', () => {
  it('refuses a card without the power, the dead, a wrong phase, a second use, a gone bottle and a bad target', async () => {
    const m = await party();
    const [vicar, watchman] = [m.bots[1]!, m.bots[2]!];
    await power(watchman, 'confession', id(m, 5)); // the card lacks it
    await toPhase(m, Phase.day);
    await power(vicar, 'confession', id(m, 5)); // not now: 425
    await nightfall(m);
    for (const bad of ['nobody', id(m, 1), 7 as unknown as string]) await power(vicar, 'confession', bad);
    await power(vicar, 'confession', id(m, 5));
    await power(vicar, 'confession', id(m, 6)); // used tonight
    expect(errorCodes(watchman)).toEqual([ErrorCode.cannot]);
    expect(errorCodes(vicar)).toEqual([
      ErrorCode.wrongPhase,
      ErrorCode.cannot,
      ErrorCode.cannot,
      ErrorCode.cannot,
      ErrorCode.cannot,
    ]);
    expect(refusals(vicar).at(-1)).toMatchObject({ msg: 'used tonight', reason: 'SPENT' });

    const herbalist = m.bots[3]!;
    playerOf(m, herbalist).priv.inventory.slots.clear();
    await power(herbalist, 'poison', id(m, 5));
    expect(refusals(herbalist)).toEqual([
      { code: ErrorCode.cannot, msg: 'none left', reason: 'SPENT', args: { what: 'stock' } },
    ]);

    // The dead come first, whatever the phase.
    simOf(m.room).players.get(id(m, 1))!.dead = true;
    await toPhase(m, Phase.day);
    const before = refusals(vicar).length;
    await power(vicar, 'confession', id(m, 5));
    expect(refusals(vicar).slice(before)).toEqual([
      { code: ErrorCode.cannot, msg: 'not now', reason: 'NOT_IN_PLAY' },
    ]);
  });

  it('refuses a public ghost as a target, the Watchman himself, and the same soul two nights running', async () => {
    const m = await party();
    const watchman = m.bots[2]!;
    await nightfall(m);
    playerOf(m, m.bots[5]!).alive = false;
    await power(watchman, 'keepWatch', id(m, 5)); // publicly dead
    await power(watchman, 'keepWatch', id(m, 2)); // himself
    await power(watchman, 'keepWatch', id(m, 6));
    expect(errorCodes(watchman)).toEqual([ErrorCode.cannot, ErrorCode.cannot]);
    await toPhase(m, Phase.dusk); // the next night
    await power(watchman, 'keepWatch', id(m, 6));
    expect(refusals(watchman).at(-1)).toEqual({
      code: ErrorCode.cannot,
      msg: 'watched last night',
      reason: 'SPENT',
      args: { what: 'power' },
    });
    await power(watchman, 'keepWatch', id(m, 0));
    expect(notes(m, watchman).map((e) => e.of)).toEqual([id(m, 6), id(m, 0)]);
  });
});

describe('night powers: entries, spent marks and silence', () => {
  it('writes private Verified entries, marks the power spent and clears it at the next dusk', async () => {
    const m = await party();
    const [vicar, herb] = [m.bots[1]!, m.bots[3]!];
    await nightfall(m);
    const tick = m.room.state.tick;
    await power(vicar, 'confession', id(m, 0));
    const [entry] = notes(m, vicar);
    expect(entry).toMatchObject({
      note: NoteKind.confession,
      of: id(m, 0),
      value: Team.cabal,
      status: 1,
      clueKind: 0,
    });
    expect(entry!.tick).toBeGreaterThanOrEqual(tick);
    expect(playerOf(m, vicar).priv.cooldownEndTick.get('confession')).toBe(SPENT_TONIGHT);
    await power(herb, 'remedy', id(m, 3)); // self allowed
    expect(notes(m, herb).map((e) => [e.note, e.of])).toEqual([[NoteKind.remedyGiven, id(m, 3)]]);
    expect(playerOf(m, herb).priv.inventory.slots.some((s) => s.defId === 'remedy')).toBe(false);

    await toPhase(m, Phase.dusk);
    expect(playerOf(m, vicar).priv.cooldownEndTick.has('confession')).toBe(false);
    await power(vicar, 'confession', id(m, 5));
    expect(notes(m, vicar)).toHaveLength(2);
    expect(entry).toBeDefined();
  });

  it('changes no scene field and answers nobody but its actor (P15)', async () => {
    const m = await party();
    await nightfall(m);
    const watcher = m.bots[6]!;
    const before = flatten(JSON.parse(JSON.stringify(stateOf(watcher).scenes.get('overworld'))));
    const counts = m.bots.map((b) => b.events.length);
    await power(m.bots[1]!, 'confession', id(m, 0));
    await power(m.bots[2]!, 'keepWatch', id(m, 5));
    await power(m.bots[3]!, 'poison', id(m, 6));
    await sleep(200);
    expect(
      withoutFigureRows(
        m,
        diffPaths(before, flatten(JSON.parse(JSON.stringify(stateOf(watcher).scenes.get('overworld'))))),
      ),
    ).toEqual([]);
    m.bots.forEach((b, i) => {
      const fresh = b.events.slice(counts[i]!).filter((e) => !['phaseChange', 'noise'].includes(e.type));
      expect(fresh).toEqual([]);
    });
  });

  it('treats a secretly dead target as a living one (P18)', async () => {
    const m = await party();
    await nightfall(m);
    const [vicar, watchman, herb] = [m.bots[1]!, m.bots[2]!, m.bots[3]!];
    const live = id(m, 5);
    const dead = id(m, 6);
    simOf(m.room).players.get(dead)!.dead = true; // alive stays true until a meeting
    await power(vicar, 'confession', dead);
    await power(watchman, 'keepWatch', dead);
    await power(herb, 'remedy', dead);
    await power(herb, 'poison', dead);
    expect(errorCodes(vicar)).toEqual([]);
    expect(errorCodes(watchman)).toEqual([]);
    expect(errorCodes(herb)).toEqual([]);
    expect(notes(m, vicar)[0]).toMatchObject({ note: NoteKind.confession, value: Team.village });
    expect(notes(m, watchman).map((e) => e.note)).toEqual([NoteKind.watching]);
    expect(notes(m, herb).map((e) => e.note)).toEqual([NoteKind.remedyGiven, NoteKind.poisonGiven]);
    // The same powers on a living seat leave the same entries in shape.
    await toPhase(m, Phase.dusk);
    await power(vicar, 'confession', live);
    expect(notes(m, vicar).map((e) => Object.keys(e.toJSON()).sort())[0]).toEqual(
      notes(m, vicar).map((e) => Object.keys(e.toJSON()).sort())[1],
    );
    // Nightshade is spent and skipped: nobody new dies when the night turns to day.
    const rec = record(m);
    m.room.state.phase = Phase.night;
    await sleep(120);
    m.room.state.phase = Phase.day;
    await sleep(200);
    expect(rec.deaths).toEqual([]);
    expect(flowOf(m.room).poisoned.size).toBe(0);
  });
});

describe('protections and Nightshade (GDD 3.2)', () => {
  /** The Killer stands beside bot 5 on the overworld row; its Knife is ready. */
  async function standoff(): Promise<Match> {
    const m = await party();
    await nightfall(m);
    teleport(m, m.bots[0]!, 'overworld', 30, ROW);
    teleport(m, m.bots[5]!, 'overworld', 31, ROW);
    for (const i of [1, 2, 3, 4, 6]) teleport(m, m.bots[i]!, 'overworld', 36 + i, 18);
    return m;
  }
  const strike = async (m: Match) => {
    readyKnife(m, m.bots[0]!);
    settle(m, m.bots[0]!, m.bots[5]!);
    await act(m.bots[0]!, 'act.ability', { abilityId: 'kill', targetId: handleOf(m, m.bots[5]!) });
  };

  it('spends a Bandage, then a Watch, then a Remedy, each refused "nothing happens", then kills', async () => {
    const m = await standoff();
    const [killer, doctor, watchman, herb] = [m.bots[0]!, m.bots[6]!, m.bots[2]!, m.bots[3]!];
    const target = simOf(m.room).players.get(id(m, 5))!;
    target.bandagedUntilTick = m.room.state.tick + 2000;
    await power(watchman, 'keepWatch', id(m, 5));
    await power(herb, 'remedy', id(m, 5));
    expect(doctor).toBeDefined();
    // Each voided strike knocks the pair a tile apart (round 10, x10, A393), so they step back into reach first.
    const back = () => {
      teleport(m, killer, 'overworld', 30, ROW);
      teleport(m, m.bots[5]!, 'overworld', 31, ROW);
    };
    for (let i = 0; i < 3; i++) {
      back();
      await strike(m);
    }
    expect(refusals(killer).map((r) => r.reason)).toEqual(['VOIDED', 'VOIDED', 'VOIDED']);
    expect(target.dead).toBe(false);
    expect(target.bandagedUntilTick).toBe(0);
    expect(notes(m, watchman).map((e) => e.note)).toEqual([NoteKind.watching, NoteKind.watchHeld]);
    expect(notes(m, herb).map((e) => e.note)).toEqual([NoteKind.remedyGiven, NoteKind.remedyHeld]);
    back();
    await strike(m);
    expect(target.dead).toBe(true);
  });

  it('lets the Watch end with the night and the Remedy with the next meeting', async () => {
    const m = await standoff();
    await power(m.bots[2]!, 'keepWatch', id(m, 5));
    await power(m.bots[3]!, 'remedy', id(m, 5));
    await toPhase(m, Phase.day); // the night ends: the Watch is gone, the Remedy stays
    await toPhase(m, Phase.night);
    await strike(m);
    expect(notes(m, m.bots[3]!).map((e) => e.note)).toEqual([NoteKind.remedyGiven, NoteKind.remedyHeld]);
    expect(notes(m, m.bots[2]!).map((e) => e.note)).toEqual([NoteKind.watching]);
  });

  it('kills a poisoned seat where it stands when the night turns to day, with a body and no clue', async () => {
    const m = await standoff();
    const rec = record(m);
    await power(m.bots[3]!, 'poison', id(m, 5));
    expect(playerOf(m, m.bots[3]!).priv.inventory.slots.some((s) => s.defId === 'nightshade')).toBe(false);
    const sceneClues = m.room.state.scenes.get('overworld')!.clues.size;
    expect(simOf(m.room).players.get(id(m, 5))!.dead).toBe(false);
    m.room.state.phase = Phase.day;
    await sleep(250);
    expect(simOf(m.room).players.get(id(m, 5))!.dead).toBe(true);
    expect(rec.deaths).toEqual([{ playerId: id(m, 5), cause: 'poison', tick: expect.any(Number) }]);
    expect(m.room.state.scenes.get('overworld')!.bodies.has(`body_${id(m, 5)}`)).toBe(true);
    expect(m.room.state.scenes.get('overworld')!.clues.size).toBe(sceneClues);
    expect(clues.clues.footprints).toBeDefined();
  });

  it('resolves Nightshade at the moment a meeting opens, before the public flip', async () => {
    const m = await standoff();
    await power(m.bots[3]!, 'poison', id(m, 5));
    simOf(m.room).meetingRequests.push({ reason: 'bell', callerId: id(m, 1) });
    await sleep(250);
    expect(m.room.state.phase).toBe(Phase.meetingDiscussion);
    expect(simOf(m.room).players.get(id(m, 5))!.dead).toBe(true);
    expect(playerOf(m, m.bots[5]!).alive).toBe(false);
  });

  it('caps the Knife at the Final Night rest after a strike there (voided too)', async () => {
    const m = await standoff();
    await toPhase(m, Phase.finalNight);
    placeAtPx(m, m.bots[0]!, 30.5 * 16, 22.5 * 16);
    await strike(m);
    const left = playerOf(m, m.bots[0]!).priv.cooldownEndTick.get('kill')! - m.room.state.tick;
    expect(left).toBeLessThanOrEqual(balance.finalNight.killCooldownS * TICK_RATE);
    expect(abilities.abilities.kill?.phases).toContain('finalNight');
    setPhase(m, Phase.night);
  });
});

describe('NPC night powers (GDD 3.12)', () => {
  it('uses the power at brain.nightPowerAtTick, once, on the target its pick selects', async () => {
    const m = await party();
    const vicar = id(m, 1);
    registerNpcSeat(m.room, vicar);
    await nightfall(m);
    const brain = npcMemory(m.room).brain(vicar);
    brain.nightPowerAtTick = m.room.state.tick + 6;
    brain.nightPowerPick = 0;
    await sleep(700);
    const entries = notes(m, m.bots[1]!);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ note: NoteKind.confession });
    expect(entries[0]!.tick).toBe(brain.nightPowerAtTick);
    expect(entries[0]!.of).not.toBe(vicar);
    await sleep(300);
    expect(notes(m, m.bots[1]!)).toHaveLength(1);
  });

  it('never poisons: the NPC Herbalist remedies itself on its first night only', async () => {
    const m = await party();
    const herb = id(m, 3);
    registerNpcSeat(m.room, herb);
    await nightfall(m);
    const brain = npcMemory(m.room).brain(herb);
    brain.nightPowerAtTick = m.room.state.tick + 6;
    await sleep(700);
    expect(notes(m, m.bots[3]!).map((e) => [e.note, e.of])).toEqual([[NoteKind.remedyGiven, herb]]);
    expect(flowOf(m.room).poisoned.size).toBe(0);
    await toPhase(m, Phase.dusk); // night 2
    brain.nightPowerAtTick = m.room.state.tick + 6;
    await sleep(700);
    expect(notes(m, m.bots[3]!)).toHaveLength(1);
  });
});
