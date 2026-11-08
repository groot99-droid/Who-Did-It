import { ColyseusTestServer, boot } from '@colyseus/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { abilities, roles } from '@wdi/content';
import { AutopsyCause, ClueKind, NotebookStatus, NoteKind, TICK_RATE } from '@wdi/shared';
import { createServer } from '../src/server';
import { addStack } from '../src/sim/Inventory';
import { attachable } from '../src/sim/law/Petition';
import { act, eventsOf, playerOf, readyKnife, setPhase, simOfBot, sleep, teleport } from './killHelpers';
import { type Match, startMatch } from './simHelpers';
import { Phase } from '@wdi/shared';
import { handleOf as h } from './avatarHelpers';

// Round 10, V1b (10V; GDD 3.2, seams.md 3 row 24): Dust, Compare and Autopsy.

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

const ROW = 22;
const hold = (action: string, targetId: string, on = true) => ({ action, targetId, on });
const reasons = (m: Match, i: number) =>
  eventsOf(m.bots[i]!, 'error').map((e) => (e as { reason?: string }).reason);
const book = (m: Match, i: number) => playerOf(m, m.bots[i]!).priv.notebook;

/** Killer 0, Detective 1, Doctor 2, townsfolk 3 and 4; the Detective and Doctor beside the killer's victim 3. */
async function party(): Promise<Match> {
  const m = await startMatch(colyseus, 5, {
    Bot0: 'killer',
    Bot1: 'detective',
    Bot2: 'doctor',
    Bot3: 'townsfolk',
    Bot4: 'townsfolk',
  });
  setPhase(m, Phase.night);
  for (const bot of m.bots) {
    const player = playerOf(m, bot);
    player.priv.inventory.slots.clear();
    for (const k of roles.roles[player.priv.role.roleId]?.startKit ?? []) addStack(player, k.item, k.qty);
  }
  readyKnife(m, m.bots[0]!);
  teleport(m, m.bots[0]!, 'overworld', 30, ROW);
  teleport(m, m.bots[3]!, 'overworld', 31, ROW);
  teleport(m, m.bots[1]!, 'overworld', 32, ROW);
  teleport(m, m.bots[2]!, 'overworld', 31, ROW + 1);
  teleport(m, m.bots[4]!, 'overworld', 12, 12);
  await sleep(300);
  return m;
}

/** The killer strikes seat 3 and the body lies at its tile. */
async function kill(m: Match): Promise<string> {
  await act(m.bots[0]!, 'act.ability', { abilityId: 'kill', targetId: h(m, m.bots[3]!) });
  expect(simOfBot(m, m.bots[3]!).dead).toBe(true);
  return `body_${m.bots[3]!.id}`;
}
const skip = (m: Match, i: number) => {
  const h = simOfBot(m, m.bots[i]!).hold;
  if (h) h.startTick -= 20 * TICK_RATE; // the cast has run
};
describe('Autopsy', () => {
  it('reads the cause and an estimated death tick into the Doctor only, once per body', async () => {
    const m = await party();
    const bodyId = await kill(m);
    const died = m.room.state.tick;
    await act(m.bots[2]!, 'act.hold', hold('autopsy', bodyId));
    skip(m, 2);
    await sleep(150);
    const entry = book(m, 2)[0]!;
    expect(entry).toMatchObject({
      note: NoteKind.autopsy,
      clueKind: ClueKind.timeOfDeath,
      value: AutopsyCause.knife,
      status: NotebookStatus.verified,
      of: m.bots[3]!.id,
    });
    const err = (abilities.abilities.autopsy?.params?.timeOfDeathErrorS ?? 0) * TICK_RATE;
    expect(Math.abs(entry.tick - died)).toBeLessThanOrEqual(err + 40);
    expect(attachable(entry)).toBe(false);
    await act(m.bots[2]!, 'act.hold', hold('autopsy', bodyId));
    expect(reasons(m, 2)).toEqual(['ALREADY_DONE']);
    expect(book(m, 1)).toHaveLength(0);
    // Not the Detective's power.
    await act(m.bots[1]!, 'act.hold', hold('autopsy', bodyId));
    expect(reasons(m, 1)).toEqual(['NOT_YOUR_POWER']);
  }, 20000);

  it('names a shot, a creature and other causes without a knife', async () => {
    const m = await party();
    const { markDead } = await import('../src/sim/Death');
    const { spawnBody } = await import('../src/sim/Bodies');
    markDead(m.room, m.bots[3]!.id, 'wolf');
    spawnBody(m.room, 'overworld', m.bots[3]!.id, 31, ROW);
    await act(m.bots[2]!, 'act.hold', hold('autopsy', `body_${m.bots[3]!.id}`));
    skip(m, 2);
    await sleep(150);
    expect(book(m, 2)[0]).toMatchObject({ value: AutopsyCause.creature });
  }, 20000);
});
