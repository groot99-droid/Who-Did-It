import { ColyseusTestServer, boot } from '@colyseus/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { roles } from '@wdi/content';
import { ClueKind, DoorState } from '@wdi/shared';
import { createServer } from '../src/server';
import { spawnBody } from '../src/sim/Bodies';
import { spawnClue } from '../src/sim/Clues';
import { AnimId } from '../src/sim/constants';
import { addStack, count } from '../src/sim/Inventory';
import { simOf } from '../src/sim/RoomSim';
import { dragSpeedFactor } from '../src/sim/verbs/coverup';
import { act, eventsOf, playerOf, simOfBot, sleep, teleport, tilePx, toDay } from './killHelpers';
import { type Match, startMatch } from './simHelpers';

// Round 10, V2 (10V; GDD 3.2 and 3.4): Drag body, the Bloody Rag, the Bucket, the Skeleton Key and the Crowbar.

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

const hold = (action: string, targetId: string, on = true) => ({ action, targetId, on });
const reasons = (m: Match, i: number) =>
  eventsOf(m.bots[i]!, 'error').map((e) => (e as { reason?: string }).reason);
const noisesOf = (m: Match, i: number) =>
  eventsOf(m.bots[i]!, 'noise').map((n) => (n as { kind: string }).kind);

/** Killer 0, Accomplice 1, two townsfolk; each with its card's own kit. */
async function party(): Promise<Match> {
  const m = await startMatch(colyseus, 4, {
    Bot0: 'killer',
    Bot1: 'accomplice',
    Bot2: 'townsfolk',
    Bot3: 'townsfolk',
  });
  toDay(m);
  for (const bot of m.bots) {
    const player = playerOf(m, bot);
    player.priv.inventory.slots.clear();
    for (const k of roles.roles[player.priv.role.roleId]?.startKit ?? []) addStack(player, k.item, k.qty);
  }
  await sleep(200);
  return m;
}

describe('Drag body', () => {
  it('moves a body behind the dragger at half speed, lays smears, and shows only a hold', async () => {
    const m = await party();
    const k = m.bots[0]!;
    teleport(m, k, 'overworld', 20, 20);
    teleport(m, m.bots[2]!, 'overworld', 21, 20);
    spawnBody(m.room, 'overworld', 'victim', 20, 20);
    await sleep(200);
    const scene = m.room.state.scenes.get('overworld')!;
    const avatar = () => scene.avatars.get(playerOf(m, k).priv.avatar)!;
    const heard = m.bots.map((_, i) => noisesOf(m, i).length);
    await act(k, 'act.hold', hold('drag', 'body_victim'));
    expect(simOfBot(m, k).hold).toMatchObject({ action: 'drag', targetId: 'body_victim' });
    expect(dragSpeedFactor(simOfBot(m, k))).toBe(0.5);
    expect(avatar().animId).toBe(AnimId.interact); // any hold's animation, whatever the hold
    const smears = () => [...scene.clues.values()].filter((c) => c.kind === ClueKind.dragSmear);
    expect(smears()).toHaveLength(1);
    for (let x = 21; x <= 27; x++) {
      teleport(m, k, 'overworld', x, 20);
      await sleep(120);
    }
    await sleep(300);
    const body = scene.bodies.get('body_victim')!;
    expect(Math.abs(body.x - tilePx(27))).toBeLessThan(2 * 32);
    expect(body.x).toBeGreaterThan(tilePx(21));
    expect(body.toJSON()).toEqual({ id: 'body_victim', of: 'victim', x: body.x, y: body.y, hidden: false });
    expect(smears().length).toBeGreaterThan(1);
    expect(smears().every((c) => c.value === 0)).toBe(true);
    expect(m.bots.map((_, i) => noisesOf(m, i).length)).toEqual(heard); // a drag rings nothing
    await act(k, 'act.hold', hold('drag', 'body_victim', false));
    expect(simOfBot(m, k).hold).toBeNull();
    expect(scene.bodies.has('body_victim')).toBe(true); // dropped in the open: it lies where it is
    expect(dragSpeedFactor(simOfBot(m, k))).toBe(1);
  }, 20000);

  it('hides a body released beside a body spot: the scene just loses it', async () => {
    const m = await party();
    const k = m.bots[0]!;
    teleport(m, k, 'barn', 3, 9);
    spawnBody(m.room, 'barn', 'victim', 3, 9);
    await sleep(200);
    await act(k, 'act.hold', hold('drag', 'body_victim'));
    await act(k, 'act.hold', hold('drag', 'body_victim', false));
    const scene = m.room.state.scenes.get('barn')!;
    expect(scene.bodies.has('body_victim')).toBe(false);
    expect(simOf(m.room).hiddenBodies.get('body_victim')).toMatchObject({
      sceneId: 'barn',
      spotId: 'ba.hay_body',
    });
  });

  it('is the Killer card only, needs a body in reach, and one dragger a body', async () => {
    const m = await party();
    teleport(m, m.bots[0]!, 'overworld', 20, 20);
    teleport(m, m.bots[1]!, 'overworld', 20, 21);
    teleport(m, m.bots[2]!, 'overworld', 30, 30);
    spawnBody(m.room, 'overworld', 'victim', 20, 20);
    await sleep(200);
    await act(m.bots[1]!, 'act.hold', hold('drag', 'body_victim'));
    expect(reasons(m, 1)).toEqual(['NOT_YOUR_POWER']);
    await act(m.bots[0]!, 'act.hold', hold('drag', 'body_nobody'));
    expect(reasons(m, 0)).toEqual(['NOTHING_THERE']);
    await act(m.bots[0]!, 'act.hold', hold('drag', 'body_victim'));
    expect(simOfBot(m, m.bots[0]!).hold?.action).toBe('drag');
  });
});

describe('Clean, the Bloody Rag', () => {
  it('erases one clue after the cast, spends one Rag and rings noise 4', async () => {
    const m = await party();
    const k = m.bots[0]!;
    teleport(m, k, 'overworld', 20, 20);
    teleport(m, m.bots[2]!, 'overworld', 22, 20);
    teleport(m, m.bots[3]!, 'overworld', 40, 40);
    const id = spawnClue(m.room, 'overworld', { kind: ClueKind.thread, value: 1, dir: 0, tx: 21, ty: 20 })!;
    await sleep(200);
    expect(count(playerOf(m, k), 'bloodyRag')).toBe(2);
    await act(k, 'act.hold', hold('clean', id));
    expect(m.room.state.scenes.get('overworld')!.clues.has(id)).toBe(true);
    await sleep(3300);
    expect(m.room.state.scenes.get('overworld')!.clues.has(id)).toBe(false);
    expect(simOf(m.room).clueMeta.has(id)).toBe(false);
    expect(count(playerOf(m, k), 'bloodyRag')).toBe(1);
    expect(noisesOf(m, 2)).toContain('rag');
    expect(noisesOf(m, 3)).not.toContain('rag');
    expect(noisesOf(m, 0)).not.toContain('rag');
  }, 15000);

  it('is refused without a Rag or beyond reach, and moving cancels it', async () => {
    const m = await party();
    teleport(m, m.bots[2]!, 'overworld', 20, 20);
    teleport(m, m.bots[0]!, 'overworld', 30, 30);
    const id = spawnClue(m.room, 'overworld', { kind: ClueKind.thread, value: 1, dir: 0, tx: 21, ty: 20 })!;
    await sleep(200);
    await act(m.bots[2]!, 'act.hold', hold('clean', id));
    await act(m.bots[0]!, 'act.hold', hold('clean', id));
    expect(reasons(m, 2)).toEqual(['NEED_ITEM']);
    expect(reasons(m, 0)).toEqual(['TOO_FAR']);
  });
});

describe('Wash, the Bucket', () => {
  it('washes Blood off at a basin, keeps the Bucket and leaves a Wet Bucket clue', async () => {
    const m = await party();
    const k = m.bots[0]!;
    teleport(m, k, 'bakery', 17, 6);
    await sleep(200);
    await act(k, 'act.hold', hold('wash', 'bk.basin'));
    expect(reasons(m, 0)).toEqual(['NOTHING_THERE']); // clean hands: nothing to wash
    simOfBot(m, k).bloodyUntilTick = m.room.state.tick + 1000;
    await act(k, 'act.hold', hold('wash', 'bk.basin'));
    await sleep(3300);
    expect(simOfBot(m, k).bloodyUntilTick).toBe(0);
    expect(count(playerOf(m, k), 'bucket')).toBe(1);
    const kinds = [...m.room.state.scenes.get('bakery')!.clues.values()].map((c) => c.kind);
    expect(kinds).toEqual([ClueKind.wetBucket]);
  }, 15000);

  it('needs the Bucket and water in reach', async () => {
    const m = await party();
    teleport(m, m.bots[2]!, 'bakery', 17, 6);
    teleport(m, m.bots[0]!, 'bakery', 5, 12);
    simOfBot(m, m.bots[2]!).bloodyUntilTick = m.room.state.tick + 1000;
    simOfBot(m, m.bots[0]!).bloodyUntilTick = m.room.state.tick + 1000;
    await sleep(200);
    await act(m.bots[2]!, 'act.hold', hold('wash', 'bk.basin'));
    await act(m.bots[0]!, 'act.hold', hold('wash', 'bk.basin'));
    expect(reasons(m, 2)).toEqual(['NEED_ITEM']);
    expect(reasons(m, 0)).toEqual(['NOTHING_THERE']);
  });
});

describe('the keyed door', () => {
  const SEA = { x: 19, y: 4 };
  const doorOf = (m: Match) => m.room.state.scenes.get('cave_entry')!.doors.get('ce.sea')!;

  it('the Skeleton Key opens it, rings noise 5 and leaves a print on the door', async () => {
    const m = await party();
    const k = m.bots[0]!;
    teleport(m, k, 'cave_entry', SEA.x, SEA.y + 1);
    teleport(m, m.bots[2]!, 'cave_entry', SEA.x - 2, SEA.y + 1);
    await sleep(200);
    expect(doorOf(m).state).toBe(DoorState.locked);
    await act(k, 'act.hold', hold('unlock', 'ce.sea'));
    await sleep(3300);
    expect(doorOf(m).state).toBe(DoorState.open);
    expect(simOf(m.room).doorTouches.get('cave_entry/ce.sea')).toEqual([m.room.state.players.get(k.id)!.id]);
    expect(noisesOf(m, 2)).toContain('skeletonKey');
    await act(k, 'act.hold', hold('unlock', 'ce.sea'));
    expect(reasons(m, 0)).toEqual(['ALREADY_DONE']);
  }, 15000);

  it('the Crowbar breaks it for good, rings noise 10, and a pass-through no longer finds it locked', async () => {
    const m = await party();
    const a = m.bots[1]!;
    teleport(m, a, 'cave_entry', SEA.x, SEA.y + 1);
    teleport(m, m.bots[2]!, 'cave_entry', SEA.x - 4, SEA.y + 1);
    await sleep(200);
    await act(a, 'act.enterPortal', { portalId: 'ce.sea' });
    expect(reasons(m, 1)).toEqual(['LOCKED']);
    await act(a, 'act.hold', hold('crowbar', 'ce.sea'));
    await sleep(2500);
    expect(doorOf(m).state).toBe(DoorState.locked); // 5 s cast
    await sleep(3000);
    expect(doorOf(m).state).toBe(DoorState.broken);
    expect(noisesOf(m, 2)).toContain('crowbar');
    await act(a, 'act.enterPortal', { portalId: 'ce.sea' });
    expect(reasons(m, 1).filter((r) => r === 'LOCKED')).toHaveLength(1);
  }, 20000);

  it('needs the item, and a door that is not locked is nothing to open', async () => {
    const m = await party();
    teleport(m, m.bots[2]!, 'cave_entry', SEA.x, SEA.y + 1);
    teleport(m, m.bots[1]!, 'cave_entry', SEA.x, SEA.y + 1);
    await sleep(200);
    await act(m.bots[2]!, 'act.hold', hold('unlock', 'ce.sea'));
    await act(m.bots[2]!, 'act.hold', hold('crowbar', 'ce.sea'));
    await act(m.bots[1]!, 'act.hold', hold('unlock', 'ce.sea'));
    await act(m.bots[1]!, 'act.hold', hold('crowbar', 'nothing_here'));
    expect(reasons(m, 2)).toEqual(['NEED_KEY', 'NEED_TOOL']);
    expect(reasons(m, 1)).toEqual(['NEED_KEY', 'NOTHING_THERE']);
  });
});
