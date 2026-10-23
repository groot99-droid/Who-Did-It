import { ColyseusTestServer, boot } from '@colyseus/testing';
import { Phase, S2C } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from '../src/server';
import { markDead } from '../src/sim/Death';
import { flowOf, resetFlow } from '../src/sim/Flow';
import { MEMORIAL_VICAR } from '../src/sim/Memorial';
import { eventsOf, playerOf, setPhase, sleep } from './killHelpers';
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

/**
 * Bot0 is dealt `card` and walks as `look` (white-box: the debug start publishes no look); Bot1 holds the Knife; the
 * other seats are Villagers, enough that the deaths end no match.
 */
async function deal(n: number, card: string, look: string): Promise<Match> {
  const m = await startMatch(colyseus, n, { Bot0: card, Bot1: 'killer' });
  playerOf(m, m.bots[0]!).look = look;
  return m;
}

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

const knifeBot0 = (m: Match) => () => markDead(m.room, m.bots[0]!.id, 'knife', m.bots[1]!.id);

describe("the Vicar's memorial (GDD 3.20)", () => {
  it('plays to every seat at the reveal after the Vicar dies by the Knife, once per match', async () => {
    const m = await deal(4, 'vicar', 'vicar');
    const vicar = m.bots[0]!;
    await nightThenReveal(m, knifeBot0(m));
    expect(memorials(m)).toEqual([[MEMORIAL], [MEMORIAL], [MEMORIAL], [MEMORIAL]]);
    expect(flowOf(m.room).ascendedVicarCandidate).toBe(vicar.id);

    // The next meeting's reveal does not play it again.
    setPhase(m, Phase.day);
    await sleep(150);
    setPhase(m, Phase.reveal);
    await sleep(250);
    expect(memorials(m).flat()).toHaveLength(4);

    // The candidate outlives the match: the lobby's fresh flow keeps it for round 8.
    resetFlow(m.room);
    expect(flowOf(m.room).ascendedVicarCandidate).toBe(vicar.id);
  });

  it('stays silent for another cause or another look', async () => {
    const m = await startMatch(colyseus, 5, { Bot0: 'vicar', Bot1: 'killer', Bot2: 'doctor' });
    const [vicar, killer, doctor] = m.bots;
    playerOf(m, vicar!).look = 'vicar';
    playerOf(m, doctor!).look = 'doctor';
    await nightThenReveal(m, () => {
      markDead(m.room, vicar!.id, 'poison');
      markDead(m.room, doctor!.id, 'knife', killer!.id);
    });
    expect(memorials(m).flat()).toEqual([]);
    expect(flowOf(m.room).ascendedVicarCandidate).toBeNull();
  });

  it('follows the public look: a cover in the Vicar look is mourned, a Vicar in another look is not', async () => {
    // A Drifter wearing the Vicar's look as its cover: the film plays, and nobody becomes the candidate.
    const cover = await deal(4, 'drifter', 'vicar');
    await nightThenReveal(cover, knifeBot0(cover));
    expect(memorials(cover)).toEqual([[MEMORIAL], [MEMORIAL], [MEMORIAL], [MEMORIAL]]);
    expect(flowOf(cover.room).ascendedVicarCandidate).toBeNull();

    // The seat dealt the Vicar walking as the Doctor: no film, the candidacy stays private, and every seat receives
    // exactly the messages it would for a true Doctor knifed in its place.
    const hidden = await deal(4, 'vicar', 'doctor');
    const plain = await deal(4, 'doctor', 'doctor');
    const before = (m: Match) => m.bots.map((b) => b.events.length);
    const marks = [before(hidden), before(plain)];
    await nightThenReveal(hidden, knifeBot0(hidden));
    await nightThenReveal(plain, knifeBot0(plain));
    expect(memorials(hidden).flat()).toEqual([]);
    expect(flowOf(hidden.room).ascendedVicarCandidate).toBe(hidden.bots[0]!.id);
    const kinds = (m: Match, mark: number[]) =>
      m.bots.map((b, i) => b.events.slice(mark[i]).map((e) => e.type));
    expect(kinds(hidden, marks[0]!)).toEqual(kinds(plain, marks[1]!));
  });
});
