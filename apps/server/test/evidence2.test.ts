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
const DOOR = { id: 'ov.bakery', x: 42, y: 19 };
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
async function lift(m: Match, i: number, targetId: string) {
  await act(m.bots[i]!, 'act.hold', hold('dust', targetId));
  skip(m, i);
  await sleep(150);
}

describe('Dust and Compare', () => {
  it("lifts the knife killer's print from the body and from a door it crossed; Compare says match only for the same hand", async () => {
    const m = await party();
    const bodyId = await kill(m);
    await lift(m, 1, bodyId);
    expect(book(m, 1)).toHaveLength(1);
    expect(book(m, 1)[0]).toMatchObject({
      note: NoteKind.lift,
      clueKind: ClueKind.fingerprint,
      status: NotebookStatus.verified,
      of: m.bots[3]!.id,
    });
    // The killer, then a townsperson, cross the bakery door.
    const crossAt = async (i: number) => {
      teleport(m, m.bots[i]!, 'overworld', DOOR.x, DOOR.y + 1);
      await act(m.bots[i]!, 'act.enterPortal', { portalId: DOOR.id }, 700);
      teleport(m, m.bots[i]!, 'overworld', 12, 12 + i);
    };
    await crossAt(0);
    teleport(m, m.bots[1]!, 'overworld', DOOR.x, DOOR.y + 1);
    await lift(m, 1, DOOR.id);
    const [a, b] = [book(m, 1)[0]!, book(m, 1)[1]!];
    expect(b).toMatchObject({ note: NoteKind.lift, of: '' });
    await act(m.bots[1]!, 'act.ability', { abilityId: 'dustCompare', targetId: a.id, with: b.id });
    const cmp = book(m, 1)[2]!;
    expect(cmp).toMatchObject({ note: NoteKind.comparison, value: 1, of: `${a.id},${b.id}` });
    // Another hand at the door: no match, and still no name.
    await crossAt(4);
    teleport(m, m.bots[1]!, 'overworld', DOOR.x, DOOR.y + 1);
    await act(m.bots[1]!, 'act.hold', hold('dust', DOOR.id));
    expect(reasons(m, 1)).toEqual(['SPENT']); // two lifts per match
    expect(JSON.stringify(book(m, 1))).not.toContain(m.bots[0]!.id);
    expect(book(m, 0)).toHaveLength(0);
    expect(book(m, 3)).toHaveLength(0);
    // No reading is a clue entry: a petition and the Tribunal take none (row 13).
    for (const e of book(m, 1)) expect(attachable(e)).toBe(false);
  }, 20000);

  it('a body with no knife killer carries a print of its own; a lift never tells the cause', async () => {
    const m = await party();
    const { markDead } = await import('../src/sim/Death');
    const { spawnBody } = await import('../src/sim/Bodies');
    markDead(m.room, m.bots[3]!.id, 'poison');
    spawnBody(m.room, 'overworld', m.bots[3]!.id, 31, ROW);
    await lift(m, 1, `body_${m.bots[3]!.id}`);
    await lift(m, 1, `body_${m.bots[3]!.id}`);
    const [a, b] = [book(m, 1)[0]!, book(m, 1)[1]!];
    expect(a.clueKind).toBe(b.clueKind);
    await act(m.bots[1]!, 'act.ability', { abilityId: 'dustCompare', targetId: a.id, with: b.id });
    expect(book(m, 1)[2]).toMatchObject({ value: 1 });
    // Only the Detective's card dusts or compares.
    await act(m.bots[2]!, 'act.hold', hold('dust', `body_${m.bots[3]!.id}`));
    await act(m.bots[2]!, 'act.ability', { abilityId: 'dustCompare', targetId: a.id, with: b.id });
    expect(reasons(m, 2)).toEqual(['NOT_YOUR_POWER', 'NOT_YOUR_POWER']);
  }, 20000);

  it('refuses a door only the duster crossed, an entry that is not its own lift, and nothing in reach', async () => {
    const m = await party();
    const dust = (id: string) => act(m.bots[1]!, 'act.hold', hold('dust', id));
    teleport(m, m.bots[1]!, 'overworld', DOOR.x, DOOR.y + 1);
    await act(m.bots[1]!, 'act.enterPortal', { portalId: DOOR.id }, 700);
    teleport(m, m.bots[1]!, 'overworld', DOOR.x, DOOR.y + 1);
    await dust(DOOR.id); // only its own print there
    await dust('nothing');
    await act(m.bots[1]!, 'act.ability', { abilityId: 'dustCompare', targetId: 'entry_1', with: 'entry_2' });
    expect(reasons(m, 1)).toEqual(['NOTHING_THERE', 'NOTHING_THERE', 'NOTHING_THERE']);
    expect(book(m, 1)).toHaveLength(0);
  }, 20000);
});

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
