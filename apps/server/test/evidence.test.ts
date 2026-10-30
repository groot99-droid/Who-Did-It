import { ColyseusTestServer, boot } from '@colyseus/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { roles } from '@wdi/content';
import { ClueKind, NotebookStatus, Phase, besideTile, trailDir } from '@wdi/shared';
import { createServer } from '../src/server';
import { nearestPortalTile } from '../src/sim/Clues';
import { addStack, count, take } from '../src/sim/Inventory';
import { simOf } from '../src/sim/RoomSim';
import { navGrid } from '../src/sim/World';
import {
  act,
  eventsOf,
  playerOf,
  prop,
  setPhase,
  simOfBot,
  sleep,
  teleport,
  tilePx,
  toDay,
} from './killHelpers';
import { type Match, startMatch } from './simHelpers';

// Round 10, V1a (10V; GDD 3.2, 3.4): the Lens Inspect and Plant Clue.

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

const TEACH = prop('ov.teaching_clue');
const hold = (action: string, targetId: string, on = true) => ({ action, targetId, on });
const reasons = (m: Match, i: number) =>
  eventsOf(m.bots[i]!, 'error').map((e) => (e as { reason?: string }).reason);

/** Accomplice 0, Detective 1, two townsfolk; everyone beside the teaching clue. */
async function party(): Promise<Match> {
  const m = await startMatch(colyseus, 4, {
    Bot0: 'accomplice',
    Bot1: 'detective',
    Bot2: 'townsfolk',
    Bot3: 'townsfolk',
  });
  toDay(m);
  for (const bot of m.bots) {
    const player = playerOf(m, bot);
    player.priv.inventory.slots.clear(); // `debug.play` keeps the lobby deal's kit; give the forced card's own
    for (const k of roles.roles[player.priv.role.roleId]?.startKit ?? []) addStack(player, k.item, k.qty);
  }
  for (const [i, dx] of [
    [0, 0],
    [1, 1],
    [2, -1],
    [3, 2],
  ] as const)
    teleport(m, m.bots[i]!, 'overworld', TEACH.x + dx, TEACH.y + 1);
  await sleep(300);
  return m;
}
const notebook = (m: Match, i: number) => playerOf(m, m.bots[i]!).priv.notebook;

describe('the Lens Inspect', () => {
  it('verifies a true clue after the cast, spends one Lens and mirrors lensCharges', async () => {
    const m = await party();
    const det = playerOf(m, m.bots[1]!);
    expect(count(det, 'lens')).toBe(3);
    await act(m.bots[1]!, 'act.hold', hold('inspect', 'clue_teaching'));
    expect(simOfBot(m, m.bots[1]!).hold).toMatchObject({ action: 'inspect' });
    await sleep(3300);
    expect(notebook(m, 1)).toHaveLength(1);
    expect(notebook(m, 1)[0]).toMatchObject({
      clueKind: ClueKind.footprints,
      status: NotebookStatus.verified,
    });
    expect(count(det, 'lens')).toBe(2);
    expect(det.priv.lensCharges).toBe(2);
    // Inspecting it again is refused and spends nothing; collecting it is refused (already in the Notebook).
    await act(m.bots[1]!, 'act.hold', hold('inspect', 'clue_teaching'));
    await act(m.bots[1]!, 'act.hold', hold('collect', 'clue_teaching'));
    expect(reasons(m, 1)).toEqual(['ALREADY_DONE', 'ALREADY_DONE']);
    expect(count(det, 'lens')).toBe(2);
  });

  it("a Detective's collect is Claimed; a later Inspect updates that entry", async () => {
    const m = await party();
    const { spawnClue } = await import('../src/sim/Clues');
    const id = spawnClue(m.room, 'overworld', {
      kind: ClueKind.thread,
      value: 1,
      dir: 0,
      tx: TEACH.x + 1,
      ty: TEACH.y,
    })!;
    await act(m.bots[1]!, 'act.hold', hold('collect', id));
    await sleep(2300);
    expect(notebook(m, 1)[0]).toMatchObject({ value: 1, status: NotebookStatus.claimed });
    await act(m.bots[1]!, 'act.hold', hold('inspect', id));
    await sleep(3300);
    expect(notebook(m, 1)).toHaveLength(1);
    expect(notebook(m, 1)[0]!.status).toBe(NotebookStatus.verified);
  }, 15000);

  it('needs a Magnifier and a Lens; anyone holding a Magnifier inspects at the slower cast', async () => {
    const m = await party();
    await act(m.bots[2]!, 'act.hold', hold('inspect', 'clue_teaching'));
    const det = playerOf(m, m.bots[1]!);
    take(det, 'lens', 3);
    await act(m.bots[1]!, 'act.hold', hold('inspect', 'clue_teaching'));
    expect(reasons(m, 2)).toEqual(['NEED_TOOL']);
    expect(reasons(m, 1)).toEqual(['NEED_ITEM']);
    const town = playerOf(m, m.bots[2]!);
    addStack(town, 'magnifier', 1);
    addStack(town, 'lens', 1);
    await act(m.bots[2]!, 'act.hold', hold('inspect', 'clue_teaching'));
    await sleep(3300);
    expect(notebook(m, 2)).toHaveLength(0);
    await sleep(3000);
    expect(notebook(m, 2)[0]?.status).toBe(NotebookStatus.verified);
    expect(count(town, 'lens')).toBe(0);
  }, 15000);

  it('gives a card with Inspect its Lens back once a day, up to the max', async () => {
    const m = await party();
    const det = playerOf(m, m.bots[1]!);
    take(det, 'lens', 2);
    setPhase(m, Phase.dawn);
    await sleep(200);
    expect(count(det, 'lens')).toBe(1); // a phase alone refills nothing; the day counter does
    m.room.state.round++;
    await sleep(100);
    expect(count(det, 'lens')).toBe(2);
    m.room.state.round++;
    await sleep(100);
    m.room.state.round++;
    await sleep(100);
    expect(count(det, 'lens')).toBe(3);
    expect(det.priv.lensCharges).toBe(3);
    expect(count(playerOf(m, m.bots[2]!), 'lens')).toBe(0);
  });
});

describe('Plant Clue', () => {
  it('lays footprints no client can tell from true ones; a Lens reads them Forged, a collect Claimed', async () => {
    const m = await party();
    const scene = m.room.state.scenes.get('overworld')!;
    const before = new Set(scene.clues.keys());
    await act(m.bots[0]!, 'act.ability', { abilityId: 'plantClue', kind: 'footprints', value: 2 });
    const planted = [...scene.clues.values()].filter((c) => !before.has(c.id));
    expect(planted).toHaveLength(1);
    const clue = planted[0]!;
    const portal = nearestPortalTile('overworld', TEACH.x, TEACH.y + 1)!;
    expect(clue.toJSON()).toEqual({
      id: clue.id,
      kind: ClueKind.footprints,
      value: 2,
      dir: trailDir(TEACH.x, TEACH.y + 1, portal.x, portal.y),
      x: tilePx(TEACH.x),
      y: tilePx(TEACH.y + 1),
      claimed: false,
    });
    expect(clue.id).toMatch(/^clue_overworld_\d+$/);
    expect(count(playerOf(m, m.bots[0]!), 'plantKit')).toBe(2);
    expect(simOfBot(m, m.bots[0]!).busyUntilTick).toBeGreaterThan(m.room.state.tick);
    await act(m.bots[2]!, 'act.hold', hold('collect', clue.id));
    await act(m.bots[1]!, 'act.hold', hold('inspect', clue.id));
    await sleep(3300);
    expect(notebook(m, 2)[0]).toMatchObject({ value: 2, status: NotebookStatus.claimed });
    expect(notebook(m, 1)[0]).toMatchObject({ value: 2, status: NotebookStatus.forged });
    expect(simOf(m.room).clueMeta.get(clue.id)!.collectors.size).toBe(2);
  });

  it("lays a thread only within reach of a portal, beside it, as a kill's thread lies", async () => {
    const m = await party();
    const acc = m.bots[0]!;
    teleport(m, acc, 'overworld', TEACH.x, TEACH.y + 6);
    await sleep(200);
    const far = nearestPortalTile('overworld', TEACH.x, TEACH.y + 6)!;
    expect(Math.hypot(far.x - TEACH.x, far.y - TEACH.y - 6)).toBeGreaterThan(1.5);
    await act(acc, 'act.ability', { abilityId: 'plantClue', kind: 'thread', value: 1 });
    expect(reasons(m, 0)).toEqual(['TOO_FAR']);
    expect(count(playerOf(m, acc), 'plantKit')).toBe(3);
    teleport(m, acc, 'overworld', TEACH.x, TEACH.y);
    await sleep(200);
    const scene = m.room.state.scenes.get('overworld')!;
    const before = new Set(scene.clues.keys());
    await act(acc, 'act.ability', { abilityId: 'plantClue', kind: 'thread', value: 1 });
    const clue = [...scene.clues.values()].find((c) => !before.has(c.id))!;
    const portal = nearestPortalTile('overworld', TEACH.x, TEACH.y)!;
    const grid = navGrid('overworld', simOf(m.room).profile);
    const at = besideTile(portal, TEACH, (x, y) => !grid.solidAt(x, y));
    expect(clue.toJSON()).toMatchObject({
      kind: ClueKind.thread,
      value: 1,
      dir: 0,
      x: tilePx(at.x),
      y: tilePx(at.y),
    });
  });

  it('refuses another card, a bad trait, the cooldown and an empty kit', async () => {
    const m = await party();
    await act(m.bots[2]!, 'act.ability', { abilityId: 'plantClue', kind: 'footprints', value: 0 });
    expect(reasons(m, 2)).toEqual(['NOT_YOUR_POWER']);
    await act(m.bots[0]!, 'act.ability', { abilityId: 'plantClue', kind: 'felt', value: 0 });
    await act(m.bots[0]!, 'act.ability', { abilityId: 'plantClue', kind: 'footprints', value: 3 });
    await act(m.bots[0]!, 'act.ability', { abilityId: 'plantClue', kind: 'footprints', value: 0 });
    await sleep(2100);
    await act(m.bots[0]!, 'act.ability', { abilityId: 'plantClue', kind: 'footprints', value: 1 });
    expect(reasons(m, 0)).toEqual(['BAD_REQUEST', 'BAD_REQUEST', 'COOLDOWN']);
    const acc = playerOf(m, m.bots[0]!);
    acc.priv.cooldownEndTick.delete('plantClue');
    take(acc, 'plantKit', count(acc, 'plantKit'));
    await act(m.bots[0]!, 'act.ability', { abilityId: 'plantClue', kind: 'footprints', value: 1 });
    expect(reasons(m, 0).at(-1)).toBe('SPENT');
  });
});
