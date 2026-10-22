import { ColyseusTestServer, boot } from '@colyseus/testing';
import { Phase, S2C } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from '../src/server';
import { flowOf } from '../src/sim/Flow';
import { fixSeeds } from './seedHelpers';
import {
  clientState,
  commit,
  memory,
  onubLobby,
  phaseOf,
  startOnub,
  toPrep,
  until,
  type OnubParty,
} from './onubPrepHelpers';
import { sleep, type Bot } from './simHelpers';

// The privacy invariants of onub-contract.md 6 that belong to 5A: O1 (nothing an observer sees from dusk to the
// end of prep depends on when, or what, another seat commits) and O3 (at `endPrep` only proofing visitors get a
// message of their own).

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  colyseus = await boot(createServer({ ipBurst: 100_000, ipPerMin: 100_000_000, globalPerMin: 100_000_000 }));
});
afterAll(async () => colyseus.shutdown());
beforeEach(async () => colyseus.cleanup());

const DECK = ['champignon', 'champignon', 'levain', 'apprenti', 'ratDeCave', 'chef', 'aboyeur'];
const ROLES = { 0: 'champignon', 1: 'champignon', 2: 'levain', 3: 'apprenti' };
const TICKS = new Set(['tick', 'startTick', 'phaseEndsTick', 'endsTick']);

/** The observer's decoded state and messages, with session ids named by seat and every tick left out. */
function view(m: OnubParty, observer: number): string {
  const names = new Map(m.bots.map((b, i) => [b.id, `Bot${i}`]));
  const scrub = (key: string, v: unknown) => (TICKS.has(key) ? undefined : v);
  let text = JSON.stringify(
    {
      state: clientState(m.bots[observer] as Bot).toJSON(),
      events: (m.bots[observer] as Bot).events,
    },
    scrub,
  );
  for (const [id, name] of names) text = text.split(id).join(name);
  return text;
}

async function freshPrep(): Promise<OnubParty> {
  const m = await onubLobby(colyseus, 4, DECK);
  // Everything the deal draws is fixed, so two runs differ only in what the commits do.
  fixSeeds(m.room, {
    deal: [1, 2, 3, 4],
    traits: [5, 6, 7, 8],
    prepTimeout: [9, 10, 11, 12],
  });
  flowOf(m.room).fixedDeal = Object.fromEntries(
    Object.entries(ROLES).map(([i, r]) => [(m.bots[Number(i)] as Bot).id, r]),
  );
  await startOnub(m);
  await toPrep(m);
  return m;
}

describe('O1: prep leaks nothing to an observer', () => {
  it('looks the same whether a seat commits at once or late, good or sabotage', async () => {
    const seen: string[] = [];
    for (const how of [
      { wait: 0, station: 'fridge', card: 'pureDairy' },
      { wait: 400, station: 'oven', card: 'wetWood' },
      { wait: 400, station: 'proofing', card: 'time' },
    ]) {
      const m = await freshPrep();
      await sleep(how.wait);
      commit(m.bots[1] as Bot, how.station, how.card);
      await until(() => memory(m).commits.size === 1);
      await sleep(300);
      expect(phaseOf(m)).toBe(Phase.dusk);
      // Bot3 watches Bot1: nothing it receives names the commit, its timing or its card.
      seen.push(view(m, 3));
      await colyseus.cleanup();
    }
    expect(seen[1]).toBe(seen[0]);
    expect(seen[2]).toBe(seen[0]);
  });

  it('looks the same with a commit and with none, for an observer who sent nothing', async () => {
    const quiet = await freshPrep();
    await sleep(300);
    const before = view(quiet, 2);
    await colyseus.cleanup();
    const busy = await freshPrep();
    commit(busy.bots[0] as Bot, 'oven', 'charcoalAsh');
    commit(busy.bots[1] as Bot, 'fridge', 'thermostat');
    await until(() => memory(busy).commits.size === 2);
    await sleep(300);
    expect(view(busy, 2)).toBe(before);
  });
});

describe('O3: at endPrep only proofing visitors receive a message of their own', () => {
  // The last seat's commit completes the table, so prep ends on it: its messages start from there.
  const after = async (stations: [string, string][]) => {
    const m = await freshPrep();
    const last = stations.length - 1;
    stations.slice(0, last).forEach(([station, card], i) => commit(m.bots[i] as Bot, station, card));
    await until(() => memory(m).commits.size === last);
    await sleep(200);
    const seen = m.bots.map((b) => b.events.length);
    const [station, card] = stations[last] as [string, string];
    commit(m.bots[last] as Bot, station, card);
    await until(() => phaseOf(m) === Phase.prepReveal);
    // The phase is read from the server room; its phaseChange reaches every seat as a message.
    await until(() => m.bots.every((b, i) => b.events.length > (seen[i] as number)));
    await sleep(300);
    return m.bots.map((b, i) => b.events.slice(seen[i]).map((e) => e.type));
  };

  it('sends a non-visitor nothing but the public phase change', async () => {
    const got = await after([
      ['oven', 'wetWood'],
      ['fridge', 'thermostat'],
      ['mixer', 't55Flour'],
      ['oven', 'charcoalAsh'],
    ]);
    for (const types of got) expect(types).toEqual([S2C.phaseChange]);
  });

  it('adds one nightReveal for each proofing visitor, and for them alone', async () => {
    const got = await after([
      ['proofing', 'time'],
      ['oven', 'wetWood'],
      ['proofing', 'warmSteam'],
      ['mixer', 't55Flour'],
    ]);
    expect(got[0]?.sort()).toEqual([S2C.nightReveal, S2C.phaseChange].sort());
    expect(got[2]?.sort()).toEqual([S2C.nightReveal, S2C.phaseChange].sort());
    expect(got[1]).toEqual([S2C.phaseChange]);
    expect(got[3]).toEqual([S2C.phaseChange]);
  });

  it('adds nothing for anyone when the Proofing Drawer was sabotaged', async () => {
    const got = await after([
      ['proofing', 'time'],
      ['proofing', 'coldDraft'],
      ['oven', 'wetWood'],
      ['mixer', 't55Flour'],
    ]);
    for (const types of got) expect(types).toEqual([S2C.phaseChange]);
  });
});
