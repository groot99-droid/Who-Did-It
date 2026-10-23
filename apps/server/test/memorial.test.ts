import { ColyseusTestServer, boot } from '@colyseus/testing';
import { GameMode, Phase, S2C } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from '../src/server';
import { markDead } from '../src/sim/Death';
import { flowOf, resetFlow } from '../src/sim/Flow';
import { MEMORIAL_VICAR } from '../src/sim/Memorial';
import { eventsOf, setPhase, sleep } from './killHelpers';
import { type Match, startMatch } from './simHelpers';

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

const MEMORIAL = { id: MEMORIAL_VICAR, scope: 'all' };

/** Every memorial cutscene each bot received, in seat order. */
const memorials = (m: Match) =>
  m.bots.map((b) => eventsOf(b, S2C.cutscene).filter((c) => (c as { id: string }).id === MEMORIAL_VICAR));

/** The Vicar and a Killer to hold the Knife; the other seats are Villagers, enough that the deaths end no match. */
const SEATS = { Bot0: 'vicar', Bot1: 'killer' };

/** White-box: a night, then the meeting's reveal, with the bus delivering each change. */
async function nightThenReveal(m: Match, kill: () => void): Promise<void> {
  setPhase(m, Phase.night);
  await sleep(150);
  kill();
  await sleep(150);
  expect(m.room.state.phase, 'the kill ends no match').toBe(Phase.night);
  setPhase(m, Phase.meetingDiscussion);
  await sleep(150);
  expect(memorials(m).flat(), 'nothing before the reveal').toEqual([]);
  setPhase(m, Phase.reveal);
  await sleep(250);
}

describe("the Vicar's memorial (GDD 3.20)", () => {
  it('plays to every seat at the reveal after the Vicar dies by the Knife, once per match', async () => {
    const m = await startMatch(colyseus, 4, SEATS);
    const [vicar, killer] = m.bots;
    await nightThenReveal(m, () => markDead(m.room, vicar!.id, 'knife', killer!.id));
    expect(memorials(m)).toEqual([[MEMORIAL], [MEMORIAL], [MEMORIAL], [MEMORIAL]]);
    expect(flowOf(m.room).ascendedVicarCandidate).toBe(vicar!.id);

    // The next meeting's reveal does not play it again.
    setPhase(m, Phase.day);
    await sleep(150);
    setPhase(m, Phase.reveal);
    await sleep(250);
    expect(memorials(m).flat()).toHaveLength(4);

    // The candidate outlives the match: the lobby's fresh flow keeps it for round 8.
    resetFlow(m.room);
    expect(flowOf(m.room).ascendedVicarCandidate).toBe(vicar!.id);
  });

  it('stays silent for another cause, another card, or the quick mode', async () => {
    const m = await startMatch(colyseus, 5, SEATS);
    const [vicar, killer, villager] = m.bots;
    await nightThenReveal(m, () => {
      markDead(m.room, vicar!.id, 'poison');
      markDead(m.room, villager!.id, 'knife', killer!.id);
    });
    expect(memorials(m).flat()).toEqual([]);
    expect(flowOf(m.room).ascendedVicarCandidate).toBeNull();

    const q = await startMatch(colyseus, 4, SEATS);
    q.room.state.settings.mode = GameMode.onub;
    await nightThenReveal(q, () => markDead(q.room, q.bots[0]!.id, 'knife', q.bots[1]!.id));
    q.room.state.settings.mode = GameMode.main;
    expect(memorials(q).flat()).toEqual([]);
    expect(flowOf(q.room).ascendedVicarCandidate).toBeNull();
  });
});
