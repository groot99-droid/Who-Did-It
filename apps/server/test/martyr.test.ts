import { ColyseusTestServer, boot } from '@colyseus/testing';
import { balance } from '@wdi/content';
import { type DeathCause, Phase, type PlayerState, TaskEntry, Winner } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from '../src/server';
import { markDead } from '../src/sim/Death';
import { martyrOf } from '../src/sim/Memorial';
import { recomputeTaskBar } from '../src/sim/Minigames';
import { playerOf, setPhase, sleep } from './killHelpers';
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

const TASKS_EACH = 4;

/**
 * Six seats: Bot0 is dealt the Vicar, Bot1 holds the Knife, the rest are Villagers. Every seat but the Killer gets
 * four real tasks (twenty in all), none done.
 */
async function deal(): Promise<{ m: Match; vicar: PlayerState; total: number }> {
  const m = await startMatch(colyseus, 6, { Bot0: 'vicar', Bot1: 'killer' });
  let total = 0;
  for (const [i, bot] of m.bots.entries()) {
    const p = playerOf(m, bot);
    p.priv.tasks.clear();
    if (i === 1) continue;
    for (let k = 0; k < TASKS_EACH; k++) {
      const t = new TaskEntry();
      t.id = `t${i}${k}`;
      t.done = false;
      t.fake = false;
      p.priv.tasks.push(t);
      total++;
    }
  }
  return { m, vicar: playerOf(m, m.bots[0]!), total };
}

/** White-box: Bot0 dies at night by `cause`; `meanwhile` runs before the meeting; then the meeting's reveal. */
async function dieThenReveal(m: Match, cause: DeathCause, meanwhile = () => {}): Promise<void> {
  setPhase(m, Phase.night);
  await sleep(150);
  markDead(m.room, m.bots[0]!.id, cause, cause === 'knife' ? m.bots[1]!.id : undefined);
  await sleep(150);
  meanwhile();
  setPhase(m, Phase.meetingDiscussion);
  await sleep(150);
  setPhase(m, Phase.reveal);
  await sleep(250);
}

const finish = (m: Match, p: PlayerState, k: number) => {
  p.priv.tasks[k]!.done = true;
  recomputeTaskBar(m.room);
};
const bar = (total: number, counted: number) => Math.min(100, Math.floor((100 * counted) / total));

describe('the martyred Vicar (GDD 3.20)', () => {
  it("counts the martyr's ghost tasks after the reveal martyrWeight times, and a full bar wins for the Village", async () => {
    const weight = balance.tasks.martyrWeight;
    const { m, vicar, total } = await deal();
    // Before the reveal the ghost's task is an ordinary ghost task.
    await dieThenReveal(m, 'knife', () => {
      finish(m, vicar, 0);
      expect(martyrOf(m.room)).toBeNull();
      expect(m.room.state.taskBar).toBe(bar(total, 1));
    });
    expect(martyrOf(m.room)).toEqual({ seat: m.bots[0]!.id, doneBefore: 1 });

    finish(m, vicar, 1);
    expect(m.room.state.taskBar).toBe(bar(total, 1 + weight));
    expect(m.room.state.phase).toBe(Phase.reveal);
    finish(m, vicar, 2);
    expect(m.room.state.taskBar).toBe(100);
    expect(m.room.state.phase).toBe(Phase.gameOver);
    expect(m.room.state.winner).toBe(Winner.village);
  });

  it.each(['wolf', 'poison', 'shot'] as const)('gives nothing to a Vicar taken by %s', async (cause) => {
    const { m, vicar, total } = await deal();
    await dieThenReveal(m, cause);
    expect(martyrOf(m.room)).toBeNull();
    finish(m, vicar, 0);
    finish(m, vicar, 1);
    // Two ghost tasks of twenty, under the ghost cap.
    expect(m.room.state.taskBar).toBe(bar(total, Math.min(2, balance.tasks.ghostShareCap * total)));
    expect(m.room.state.phase).toBe(Phase.reveal);
  });
});
