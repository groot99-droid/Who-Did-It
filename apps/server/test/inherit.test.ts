import { ColyseusTestServer, boot } from '@colyseus/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { abilities, balance, clues } from '@wdi/content';
import { ClueKind, Phase, TICK_RATE } from '@wdi/shared';
import { createServer } from '../src/server';
import { markDead } from '../src/sim/Death';
import { nightOf } from '../src/sim/nightMemory';
import { simOf } from '../src/sim/RoomSim';
import { events, until } from './flowHelpers';
import { act, diffPaths, errorCodes, flatten, playerOf, sleep, teleport } from './killHelpers';
import { giveKit, nightfall, toPhase } from './nightHelpers';
import { type Match, move, startMatch, stateOf } from './simHelpers';

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

const id = (m: Match, i: number) => m.bots[i]!.id;
const ROW = 22;

// Seats: 0 Killer, 1 Accomplice, 2 Detective, 3 Doctor, 4 Townsfolk, 5 Townsfolk, 6 Townsfolk.
async function party(roles: Record<string, string> = {}): Promise<Match> {
  const m = await startMatch(colyseus, 7, {
    Bot0: 'killer',
    Bot1: 'accomplice',
    Bot2: 'detective',
    Bot3: 'doctor',
    Bot4: 'townsfolk',
    Bot5: 'townsfolk',
    Bot6: 'townsfolk',
    ...roles,
  });
  for (const b of m.bots) giveKit(m, b);
  return m;
}

describe('Inherit (GDD 3.2, 3.3)', () => {
  it.each(['poison', 'shot', 'ejected'] as const)(
    'passes the Knife to a living Accomplice when the last Killer falls (%s)',
    async (cause) => {
      const m = await party();
      await nightfall(m);
      const accomplice = m.bots[1]!;
      const before = flatten(JSON.parse(JSON.stringify(stateOf(m.bots[4]!))));
      const messages = m.bots.map((b) => events(b, 'inherit').length);
      const tick = m.room.state.tick;
      if (cause === 'ejected') simOf(m.room).players.get(id(m, 0))!.dead = true;
      else markDead(m.room, id(m, 0), cause);
      await until(() => playerOf(m, accomplice).priv.role.roleId === 'heir', 2000);

      const priv = playerOf(m, accomplice).priv;
      const bonus = abilities.abilities.inherit?.params?.killCooldownBonusS ?? 0;
      const want = tick + (balance.byCount['7'].killCooldownS + bonus) * TICK_RATE;
      expect(Math.abs(priv.cooldownEndTick.get('kill')! - want)).toBeLessThanOrEqual(8);
      expect(priv.inventory.slots.some((s) => s.defId === 'knife')).toBe(true);
      expect(nightOf(m.room).lastStrikeRound.get(id(m, 1))).toBe(m.room.state.round);
      // Only the Accomplice hears of it, privately; nothing public changes.
      m.bots.forEach((b, i) => expect(events(b, 'inherit').length - messages[i]!).toBe(i === 1 ? 1 : 0));
      await sleep(200);
      const after = flatten(JSON.parse(JSON.stringify(stateOf(m.bots[4]!))));
      const changed = diffPaths(before, after).filter(
        (p) => !/tick|phase|ends|Tick|alive|look|scenes\.overworld\.(bodies|clues)/i.test(p),
      );
      expect(changed.filter((p) => /role|team|heir|inherit/i.test(p))).toEqual([]);
    },
  );

  it('does not pass it while a Killer lives, to the dead, or to a seat that is not an Accomplice', async () => {
    const m = await party({ Bot2: 'killer' });
    await nightfall(m);
    markDead(m.room, id(m, 0), 'poison'); // a second Killer lives
    await sleep(200);
    expect(playerOf(m, m.bots[1]!).priv.role.roleId).toBe('accomplice');
    simOf(m.room).players.get(id(m, 1))!.dead = true; // the Accomplice falls first
    markDead(m.room, id(m, 2), 'poison');
    await sleep(200);
    expect(playerOf(m, m.bots[1]!).priv.role.roleId).toBe('accomplice');
    expect(events(m.bots[1]!, 'inherit')).toHaveLength(0);
  });

  it('lets the heir strike, and the strike counts for Hunger', async () => {
    const m = await party();
    await nightfall(m);
    markDead(m.room, id(m, 0), 'poison');
    await until(() => playerOf(m, m.bots[1]!).priv.role.roleId === 'heir', 2000);
    teleport(m, m.bots[1]!, 'overworld', 30, ROW);
    teleport(m, m.bots[4]!, 'overworld', 31, ROW);
    playerOf(m, m.bots[1]!).priv.cooldownEndTick.set('kill', 0);
    await act(m.bots[1]!, 'act.ability', { abilityId: 'kill', targetId: id(m, 4) });
    expect(errorCodes(m.bots[1]!)).toEqual([]);
    expect(simOf(m.room).players.get(id(m, 4))!.dead).toBe(true);
  });
});

/** Walks a seat back and forth along its row for `ms` (an input stays fresh for five ticks only). */
async function walk(m: Match, i: number, ms: number): Promise<void> {
  for (let t = 0, dx = 1; t < ms; t += 100) {
    if (t % 700 === 0) dx = -dx;
    move(m.bots[i]!, dx, 0);
    await sleep(100);
  }
  move(m.bots[i]!, 0, 0);
}

describe('Hunger (GDD 3.3)', () => {
  const prints = (m: Match) =>
    [...m.room.state.scenes.get('overworld')!.clues.values()].filter((c) => c.kind === ClueKind.hungerPrints);

  it('starts on the day of round 3 for a Killer that never struck, and leaves one footprint per second of walking', async () => {
    const m = await party();
    teleport(m, m.bots[0]!, 'overworld', 30, ROW);
    m.room.state.round = balance.hunger.cyclesWithoutKill; // the day below starts round 2: not hungry yet
    await toPhase(m, Phase.grace);
    m.room.state.round = balance.hunger.cyclesWithoutKill;
    await toPhase(m, Phase.day);
    await walk(m, 0, 1400);
    expect(prints(m)).toHaveLength(0);

    m.room.state.round = balance.hunger.cyclesWithoutKill + 1; // the next day starts round 3
    await toPhase(m, Phase.dusk);
    await toPhase(m, Phase.day);
    const height = playerOf(m, m.bots[0]!).traits.height;
    await walk(m, 0, 2400);
    await sleep(100);
    const found = prints(m);
    expect(found.length).toBeGreaterThanOrEqual(1);
    expect(found.length).toBeLessThanOrEqual(3);
    for (const c of found) {
      expect(c.value).toBe(height);
      expect(c.claimed).toBe(false);
    }
    const count = found.length;
    await sleep(1500); // standing still leaves none
    expect(prints(m)).toHaveLength(count);
    const first = [...simOf(m.room).clueMeta.entries()].find(([cid]) => found.some((c) => c.id === cid))![1];
    const decay = clues.clues.hungerPrints?.decay;
    expect(first.expiresTick! - m.room.state.tick).toBeLessThanOrEqual(
      (decay?.kind === 'seconds' ? decay.seconds : 0) * TICK_RATE,
    );
  }, 20000);

  it('ends at once with an accepted strike, and a strike in round r keeps the next two days clean', async () => {
    const m = await party();
    m.room.state.round = 3;
    await toPhase(m, Phase.day);
    expect(nightOf(m.room).hungry.has(id(m, 0))).toBe(true);
    nightOf(m.room).lastStrikeRound.set(id(m, 0), 3);
    await sleep(120);
    expect(nightOf(m.room).hungry.has(id(m, 0))).toBe(false);
    m.room.state.round = 5; // the day of round 5 is two rounds after the strike
    await toPhase(m, Phase.dusk);
    await toPhase(m, Phase.day);
    expect(nightOf(m.room).hungry.has(id(m, 0))).toBe(false);
    m.room.state.round = 6; // 6 - 1 - 2 = 3: the strike of round 3 is old enough
    await toPhase(m, Phase.dusk);
    await toPhase(m, Phase.day);
    expect(nightOf(m.room).hungry.has(id(m, 0))).toBe(true);
  });
});
