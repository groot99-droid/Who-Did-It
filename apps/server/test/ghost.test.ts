import { ColyseusTestServer, boot } from '@colyseus/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { navs, scenes } from '@wdi/content';
import { ErrorCode, NavGrid, TILE_PX } from '@wdi/shared';
import { createServer } from '../src/server';
import { handleKill } from '../src/sim/Kill';
import {
  act,
  errorCodes,
  eventsOf,
  playerOf,
  readyKnife,
  simOfBot,
  sleep,
  teleport,
  tilePx,
  toDay,
} from './killHelpers';
import { type Match, move, startMatch } from './simHelpers';

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

/** Bot0 kills Bot1 at (30,22); Bot2 is a living bystander; Bot3 the Doctor. Returns the ghost. */
async function ghostParty(): Promise<{ m: Match; ghost: Match['bots'][0] }> {
  const m = await startMatch(colyseus, 4, { Bot0: 'killer', Bot3: 'doctor' });
  toDay(m);
  const [k, g] = [m.bots[0]!, m.bots[1]!];
  teleport(m, k, 'overworld', 29, 22);
  teleport(m, g, 'overworld', 30, 22);
  teleport(m, m.bots[2]!, 'overworld', 26, 18);
  teleport(m, m.bots[3]!, 'overworld', 30, 21);
  readyKnife(m, k);
  handleKill(m.room, k.id, { abilityId: 'kill', targetId: g.id });
  expect(simOfBot(m, g).dead).toBe(true);
  await sleep(300);
  return { m, ghost: g };
}

describe('ghosts', () => {
  it('walk through walls at walk speed and never past the edge of the scene', async () => {
    const { m, ghost } = await ghostParty();
    // Tile (27,23) is solid; walk the ghost straight into it from the west.
    teleport(m, ghost, 'overworld', 25, 23);
    const grid = new NavGrid(navs.overworld, 'small');
    expect(grid.solidAt(27, 23)).toBe(true);
    const p = simOfBot(m, ghost);
    for (let i = 0; i < 12; i++) {
      move(ghost, 1, 0);
      await sleep(80);
    }
    move(ghost, 0, 0);
    expect(p.x).toBeGreaterThan(27.5 * TILE_PX); // past the middle of the solid tile
    // Pushed into the corner it stops at the scene edge, inside the int16 range.
    teleport(m, ghost, 'overworld', 0, 0);
    for (let i = 0; i < 6; i++) {
      move(ghost, -1, -1);
      await sleep(80);
    }
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeGreaterThanOrEqual(0);
  });

  it('refuse every verb with 422 (hold, report, bell, bandage)', async () => {
    const { m, ghost } = await ghostParty();
    const body = `body_${ghost.id}`;
    teleport(m, ghost, 'overworld', 30, 22);
    await act(ghost, 'act.hold', { action: 'collect', targetId: 'clue_teaching', on: true });
    await act(ghost, 'act.reportBody', { bodyId: body });
    await act(ghost, 'act.bell', {});
    await act(ghost, 'act.ability', { abilityId: 'kill', targetId: m.bots[2]!.id });
    await act(ghost, 'act.ability', { abilityId: 'bandage', targetId: m.bots[2]!.id });
    expect(errorCodes(ghost)).toEqual(Array(5).fill(ErrorCode.cannot));
    // A ghost Doctor cannot bandage either.
    const doc = m.bots[3]!;
    simOfBot(m, doc).dead = true;
    await act(doc, 'act.ability', { abilityId: 'bandage', targetId: m.bots[2]!.id });
    expect(errorCodes(doc)).toEqual([ErrorCode.cannot]);
  });

  it('cross a locked door with no swing and no noise, moving only the sim scene', async () => {
    const { m, ghost } = await ghostParty();
    const portal = scenes.overworld.portals.find((q) => q.id === 'ov.tavern_front')!;
    const living = m.bots[2]!;
    const saved = portal.lock;
    portal.lock = { keyId: 'tavern_key' };
    try {
      teleport(m, ghost, 'overworld', portal.x, portal.y + 1);
      teleport(m, living, 'tavern_bar', 4, 4);
      // The same door refuses a living player (423) as a control.
      teleport(m, m.bots[3]!, 'overworld', portal.x, portal.y + 1);
      await act(m.bots[3]!, 'act.enterPortal', { portalId: portal.id });
      expect(errorCodes(m.bots[3]!)).toEqual([ErrorCode.locked]);
      const swings = () =>
        ['overworld', 'tavern_bar'].map(
          (s) =>
            m.room.state.scenes.get(s)!.doors.get(s === 'overworld' ? portal.id : 'tb.front')!.swingUntilTick,
        );
      const before = swings();
      const noiseBefore = eventsOf(living, 'noise').length;
      await act(ghost, 'act.enterPortal', { portalId: portal.id }, 700);
      expect(errorCodes(ghost)).toEqual([]);
      expect(simOfBot(m, ghost).sceneIdx).toBe(1); // tavern_bar
      expect(playerOf(m, ghost).sceneId).toBe(0); // the public scene stays frozen (A30)
      expect(simOfBot(m, ghost).busyUntilTick).toBe(0);
      expect(swings()).toEqual(before);
      expect(eventsOf(living, 'noise').length).toBe(noiseBefore);
      const enter = eventsOf(ghost, 'sceneEnter').pop() as { sceneId: string };
      expect(enter.sceneId).toBe('tavern_bar');
    } finally {
      portal.lock = saved;
    }
    expect(tilePx(1)).toBeGreaterThan(0);
  });
});
