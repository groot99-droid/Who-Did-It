import { ColyseusTestServer, boot } from '@colyseus/testing';
import { balance } from '@wdi/content';
import { Phase, S2C, TICK_RATE, TaskEntry, Winner } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from '../src/server';
import { markDead } from '../src/sim/Death';
import { flowOf, resetFlow } from '../src/sim/Flow';
import { MEMORIAL_VICAR, martyrOf } from '../src/sim/Memorial';
import { recomputeTaskBar } from '../src/sim/Minigames';
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
async function nightThenReveal(m: Match, kill: () => void, meanwhile = () => {}): Promise<void> {
  setPhase(m, Phase.night);
  await sleep(150);
  kill();
  await sleep(150);
  expect(m.room.state.phase, 'the kill ends no match').toBe(Phase.night);
  meanwhile();
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

/** Four real tasks, none done, on every seat but the Killer (Bot1); returns the task count. */
function tasked(m: Match): number {
  for (const [i, bot] of m.bots.entries()) {
    const tasks = playerOf(m, bot).priv.tasks;
    tasks.clear();
    for (let k = 0; i !== 1 && k < 4; k++) tasks.push(Object.assign(new TaskEntry(), { id: `t${i}${k}` }));
  }
  return 4 * (m.bots.length - 1);
}
const finish = (m: Match, k: number) => {
  playerOf(m, m.bots[0]!).priv.tasks[k]!.done = true;
  recomputeTaskBar(m.room);
};
const bar = (total: number, counted: number) => Math.min(100, Math.floor((100 * counted) / total));
const { martyrWeight: weight, martyrS, ghostShareCap } = balance.tasks;

describe("the martyr's due (GDD 3.20)", () => {
  it('counts the martyr ghost tasks after the reveal martyrWeight times; a full bar wins for the Village', async () => {
    const m = await deal(6, 'vicar', 'vicar');
    const total = tasked(m);
    await nightThenReveal(m, knifeBot0(m), () => {
      finish(m, 0); // before the reveal, an ordinary ghost task
      expect(martyrOf(m.room)).toBeNull();
      expect(m.room.state.taskBar).toBe(bar(total, 1));
    });
    expect(martyrOf(m.room)).toMatchObject({ seat: m.bots[0]!.id, doneBefore: 1, doneAtEnd: null });
    finish(m, 1);
    expect(m.room.state.taskBar).toBe(bar(total, 1 + weight));
    expect(m.room.state.phase).toBe(Phase.reveal);
    finish(m, 2);
    expect(m.room.state).toMatchObject({ taskBar: 100, phase: Phase.gameOver, winner: Winner.village });
  });

  it('lasts martyrS seconds from the reveal; the ghost tasks after it count as any ghost (A121)', async () => {
    const m = await deal(6, 'vicar', 'vicar');
    const total = tasked(m);
    await nightThenReveal(m, knifeBot0(m));
    const martyr = martyrOf(m.room)!;
    const span = Math.round(martyrS * TICK_RATE);
    expect(martyr.untilTick).toBeGreaterThan(m.room.state.tick);
    expect(martyr.untilTick).toBeLessThanOrEqual(m.room.state.tick + span);
    expect(martyr.untilTick).toBeGreaterThan(m.room.state.tick + span - TICK_RATE);
    finish(m, 0);
    expect(m.room.state.taskBar).toBe(bar(total, weight));
    // White-box: the window ends now; the next step snapshots it.
    martyr.untilTick = m.room.state.tick;
    await sleep(150);
    expect(martyr.doneAtEnd).toBe(1);
    finish(m, 1);
    expect(m.room.state.taskBar).toBe(bar(total, weight + Math.min(1, ghostShareCap * total)));
    expect(m.room.state.phase).toBe(Phase.reveal);
  });

  it.each(['wolf', 'poison', 'shot'] as const)('gives nothing to a Vicar taken by %s', async (cause) => {
    const m = await deal(6, 'vicar', 'vicar');
    const total = tasked(m);
    await nightThenReveal(m, () => markDead(m.room, m.bots[0]!.id, cause));
    expect(martyrOf(m.room)).toBeNull();
    finish(m, 0);
    finish(m, 1);
    expect(m.room.state.taskBar).toBe(bar(total, Math.min(2, ghostShareCap * total)));
  });

  it('follows the public look: a cover in the Vicar look is the martyr, a Vicar in another look is not', async () => {
    const cover = await deal(6, 'drifter', 'vicar');
    const total = tasked(cover);
    await nightThenReveal(cover, knifeBot0(cover));
    finish(cover, 0);
    expect(cover.room.state.taskBar).toBe(bar(total, weight));
    const hidden = await deal(6, 'vicar', 'doctor');
    tasked(hidden);
    await nightThenReveal(hidden, knifeBot0(hidden));
    expect(martyrOf(hidden.room)).toBeNull();
    finish(hidden, 0);
    expect(hidden.room.state.taskBar).toBe(bar(total, 1));
  });

  it('ends the match at a full bar once, only in play, and not once an undo has lowered the bar', async () => {
    const m = await deal(6, 'doctor', 'doctor');
    tasked(m);
    const all = [...m.room.state.players.values()].flatMap((p) => [...p.priv.tasks]);
    for (const t of all) t.done = true;
    setPhase(m, Phase.lobby);
    recomputeTaskBar(m.room);
    expect(m.room.state).toMatchObject({ taskBar: 100, phase: Phase.lobby });
    setPhase(m, Phase.day);
    all[0]!.done = false; // a finished task undone, as 7H's sabotage does
    recomputeTaskBar(m.room);
    expect(m.room.state.taskBar).toBeLessThan(100);
    expect(m.room.state.phase).toBe(Phase.day);
    all[0]!.done = true;
    recomputeTaskBar(m.room);
    recomputeTaskBar(m.room);
    await sleep(150);
    expect(m.room.state).toMatchObject({ phase: Phase.gameOver, winner: Winner.village });
    for (const b of m.bots) expect(eventsOf(b, S2C.gameOver)).toHaveLength(1);
  });
});
