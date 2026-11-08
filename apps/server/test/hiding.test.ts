import { ColyseusTestServer, boot } from '@colyseus/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { roles, scenes } from '@wdi/content';
import { ClueKind, NotebookStatus, NoteKind } from '@wdi/shared';
import { createServer } from '../src/server';
import { addStack } from '../src/sim/Inventory';
import { bodyOf } from '../src/sim/body/state';
import { avatarMemory } from '../src/sim/Avatars';
import { simOf } from '../src/sim/RoomSim';
import { act, eventsOf, playerOf, simOfBot, sleep, teleport, toDay } from './killHelpers';
import { type Match, startMatch } from './simHelpers';

// Round 10, V3 (10V; GDD 3.2, 3.7): Hide, Check, Burst Out, Chalk, Act Shifty and Fake Blood.

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

const SCENE = 'widow_bedroom';
const WARDROBE = scenes.widow_bedroom.spots.find((s) => s.id === 'wb.wardrobe')!;
const reasons = (m: Match, i: number) =>
  eventsOf(m.bots[i]!, 'error').map((e) => (e as { reason?: string }).reason);

/** Drifter 0, Child 1, Detective 2, townsfolk 3; everyone beside the wardrobe. */
async function party(): Promise<Match> {
  const m = await startMatch(colyseus, 4, {
    Bot0: 'drifter',
    Bot1: 'child',
    Bot2: 'detective',
    Bot3: 'townsfolk',
  });
  toDay(m);
  for (const bot of m.bots) {
    const player = playerOf(m, bot);
    player.priv.inventory.slots.clear();
    for (const k of roles.roles[player.priv.role.roleId]?.startKit ?? []) addStack(player, k.item, k.qty);
  }
  for (const [i, dx] of [
    [0, 0],
    [1, 1],
    [2, 0],
    [3, 1],
  ] as const) {
    teleport(m, m.bots[i]!, SCENE, WARDROBE.x + dx, WARDROBE.y + 1);
  }
  await sleep(300);
  return m;
}
const hiding = (m: Match, i: number) => playerOf(m, m.bots[i]!).priv.hiding;
/** The avatar handles bot `i`'s own decoded view holds in the scene. */
const seenBy = (m: Match, i: number): string[] => {
  const state = m.bots[i]!.room.state as unknown as {
    scenes?: Map<string, { avatars: Map<string, unknown> }>;
  };
  return [...(state.scenes?.get(SCENE)?.avatars.keys() ?? [])];
};

describe('Hide, Check and Burst Out', () => {
  it('hides a seat after the cast, out of every other view, and Burst Out stuns the checker', async () => {
    const m = await party();
    await act(m.bots[2]!, 'act.hide', { spotId: WARDROBE.id }, 100);
    expect(simOfBot(m, m.bots[2]!).hold).toMatchObject({ action: 'hide' });
    await sleep(1300);
    expect(hiding(m, 2)).toBe(WARDROBE.id);
    const handle = avatarMemory(m.room).handleOf.get(m.bots[2]!.id)!;
    // Nobody else holds its avatar; it cannot be named.
    await sleep(200);
    for (const i of [0, 3]) expect(seenBy(m, i)).not.toContain(handle);
    // A second hider is refused; a checker's cast is cancelled by the burst and the checker is stunned.
    await act(m.bots[3]!, 'act.hide', { spotId: WARDROBE.id });
    expect(reasons(m, 3)).toEqual(['BUSY']);
    await act(m.bots[3]!, 'act.check', { spotId: WARDROBE.id }, 100);
    expect(simOfBot(m, m.bots[3]!).hold).toMatchObject({ action: 'check' });
    await act(m.bots[2]!, 'act.burst', { spotId: WARDROBE.id }, 100);
    expect(hiding(m, 2)).toBe('');
    expect(simOfBot(m, m.bots[3]!).hold).toBeNull();
    expect(bodyOf(m.room, m.bots[3]!.id)?.effects.has('stunned')).toBe(true);
    expect(playerOf(m, m.bots[2]!).priv.notebook).toHaveLength(0);
  });

  it('a completed Check gives the hider up and writes its Verified entry naming the face it saw', async () => {
    const m = await party();
    await act(m.bots[2]!, 'act.hide', { spotId: WARDROBE.id }, 1400);
    expect(hiding(m, 2)).toBe(WARDROBE.id);
    await act(m.bots[3]!, 'act.check', { spotId: WARDROBE.id }, 2400);
    expect(hiding(m, 2)).toBe('');
    const [entry] = playerOf(m, m.bots[2]!).priv.notebook;
    expect(entry).toMatchObject({ note: NoteKind.checked, status: NotebookStatus.verified });
    expect(entry?.of).toBe(m.bots[3]!.id);
    expect(playerOf(m, m.bots[3]!).priv.notebook).toHaveLength(0);
  });

  it('the Child hides at once and without noise; an adult cannot hide in or check a crawlspace', async () => {
    const m = await party();
    const child = { ...WARDROBE, childOnly: true };
    (scenes.widow_bedroom.spots as unknown[]).push({ ...child, id: 'wb.crawl_test' });
    try {
      await act(m.bots[1]!, 'act.hide', { spotId: 'wb.crawl_test' }, 100);
      expect(hiding(m, 1)).toBe('wb.crawl_test');
      await act(m.bots[2]!, 'act.check', { spotId: 'wb.crawl_test' });
      expect(reasons(m, 2)).toEqual(['NOTHING_THERE']);
    } finally {
      (scenes.widow_bedroom.spots as unknown[]).pop();
    }
  });

  it('refuses a far, unknown or taken spot and a hider that walks stays put', async () => {
    const m = await party();
    teleport(m, m.bots[3]!, SCENE, 9, 7);
    await act(m.bots[3]!, 'act.hide', { spotId: WARDROBE.id });
    await act(m.bots[3]!, 'act.hide', { spotId: 'nope' });
    expect(reasons(m, 3)).toEqual(['TOO_FAR', 'NOTHING_THERE']);
    await act(m.bots[2]!, 'act.hide', { spotId: WARDROBE.id }, 1400);
    const p = simOfBot(m, m.bots[2]!);
    const x0 = p.x;
    m.bots[2]!.room.send('input.move', { seq: 999, dx: 1, dy: 0 });
    await sleep(400);
    expect(p.x).toBe(x0);
  });
});

describe('Chalk, Act Shifty and Fake Blood', () => {
  it('Chalk lays a public mark and takes a cooldown; Act Shifty rings and cools; Fake Blood once', async () => {
    const m = await party();
    // Townsfolk 3 chalks.
    await act(m.bots[3]!, 'act.ability', { abilityId: 'chalk', value: 2 });
    const clues = [...simOf(m.room).clueMeta.keys()];
    const mark = m.room.state.scenes.get(SCENE)?.clues.get(clues[clues.length - 1]!);
    expect(mark).toMatchObject({ kind: ClueKind.chalk, value: 2, dir: 0 });
    await act(m.bots[3]!, 'act.ability', { abilityId: 'chalk', value: 2 });
    await act(m.bots[3]!, 'act.ability', { abilityId: 'chalk', value: 9 });
    await act(m.bots[2]!, 'act.ability', { abilityId: 'chalk', value: 0 });
    expect(reasons(m, 3)).toEqual(['COOLDOWN', 'BAD_REQUEST']);
    expect(reasons(m, 2)).toEqual(['NOT_YOUR_POWER']);
    // The Drifter.
    await act(m.bots[0]!, 'act.ability', { abilityId: 'actShifty' });
    await act(m.bots[0]!, 'act.ability', { abilityId: 'actShifty' });
    expect(reasons(m, 0)).toEqual(['COOLDOWN']);
    expect(eventsOf(m.bots[3]!, 'noise').length).toBeGreaterThan(0);
    await act(m.bots[0]!, 'act.ability', { abilityId: 'fakeBlood' });
    expect(simOfBot(m, m.bots[0]!).bloodyUntilTick).toBeGreaterThan(m.room.state.tick);
    await act(m.bots[0]!, 'act.ability', { abilityId: 'fakeBlood' });
    expect(reasons(m, 0)).toEqual(['COOLDOWN', 'SPENT']);
  });
});
