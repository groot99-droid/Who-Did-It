import type { ColyseusTestServer } from '@colyseus/testing';
import { Phase, TILE_PX } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { canSee } from '../src/sim/Sight';
import { simOf } from '../src/sim/RoomSim';
import { sceneKey } from '../src/sim/World';
import { type Figure, figureOfHandle, figuresOf } from '../src/sim/townsfolk/figures';
import { avatarsHeld, handlesHeld, settle } from './avatarHelpers';
import { bootFlowServer, skipPhase, startParty, until } from './flowHelpers';
import { setPhase, teleport } from './killHelpers';
import { type Bot, type Match, sleep } from './simHelpers';

// Round 10, x5 (A353): a seat's view holds the living figures of its scene (A160's open line of Visibility.ts).

vi.setConfig({ testTimeout: 40_000 });

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootFlowServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

/** The handles of the living figures standing in `sceneIdx`, sorted. */
const figuresIn = (m: Match, sceneIdx: number): string[] =>
  [...figuresOf(m.room).values()]
    .filter((f) => !f.dead && f.handle !== null && f.sceneIdx === sceneIdx)
    .map((f) => f.handle as string)
    .sort();

/** The figure handles a bot's client holds, sorted. */
const figuresHeld = (m: Match, bot: Bot): string[] =>
  handlesHeld(bot).filter((h) => figureOfHandle(m.room, h) !== undefined);

const tileOf = (px: number) => Math.floor(px / TILE_PX);

async function dayWithFigures(): Promise<{ m: Match; viewer: Bot; constable: Figure }> {
  const m = await startParty(colyseus, 4);
  await skipPhase(m);
  setPhase(m, Phase.day);
  const constable = [...figuresOf(m.room).values()].find((f) => f.kind === 'constable' && !f.dead);
  expect(constable).toBeDefined();
  return { m, viewer: m.bots[1]!, constable: constable! };
}

describe("figures in a seat's view (round 10, x5, A353)", () => {
  it('holds the living figures of its scene, Constables included, and drops them on a scene change', async () => {
    const { m, viewer, constable } = await dayWithFigures();
    const sceneId = sceneKey(constable.sceneIdx);
    teleport(m, viewer, sceneId, tileOf(constable.x) + 1, tileOf(constable.y));
    settle(m, viewer);
    await sleep(400);
    const here = figuresIn(m, constable.sceneIdx);
    expect(here).toContain(constable.handle);
    expect(figuresHeld(m, viewer)).toEqual(here);
    for (const a of avatarsHeld(viewer)) {
      if (figureOfHandle(m.room, a.handle) === undefined) continue;
      expect(a.avatar.seat ?? '').toBe(''); // never a seat's field (tagged, so never sent), never the ghost tag
      expect(a.avatar.lookOf === 'constable' || a.avatar.lookOf.startsWith('villager')).toBe(true);
    }
    // Through to another scene: the old scene's figures leave, the new scene's arrive.
    const elsewhere = [...figuresOf(m.room).values()].find(
      (f) => !f.dead && f.handle !== null && f.sceneIdx !== constable.sceneIdx,
    );
    const next = elsewhere ? sceneKey(elsewhere.sceneIdx) : 'tavern_bar';
    teleport(m, viewer, next, elsewhere ? tileOf(elsewhere.x) + 1 : 6, elsewhere ? tileOf(elsewhere.y) : 6);
    settle(m, viewer);
    expect(await until(() => !figuresHeld(m, viewer).some((h) => here.includes(h)), 4000)).toBe(true);
    const there = figuresIn(m, simOf(m.room).players.get(viewer.id)!.sceneIdx);
    expect(figuresHeld(m, viewer)).toEqual(there);
    if (elsewhere) expect(there).toContain(elsewhere.handle);
  });

  it('reads a figure through the dark rule at night: beside it held, far off as the sight rule says', async () => {
    const { m, viewer, constable } = await dayWithFigures();
    setPhase(m, Phase.night);
    const sceneId = sceneKey(constable.sceneIdx);
    teleport(m, viewer, sceneId, tileOf(constable.x) + 1, tileOf(constable.y));
    settle(m, viewer);
    await sleep(400);
    expect(figuresHeld(m, viewer)).toContain(constable.handle);
    // Twelve tiles off along the row: out of the night radius unless a scene light pools over the post.
    teleport(m, viewer, sceneId, tileOf(constable.x) + 12, tileOf(constable.y));
    await sleep(400);
    const viewerSim = simOf(m.room).players.get(viewer.id)!;
    expect(figuresHeld(m, viewer).includes(constable.handle as string)).toBe(
      canSee(m.room, viewerSim, constable),
    );
    // Back beside it: held again.
    teleport(m, viewer, sceneId, tileOf(constable.x) + 1, tileOf(constable.y));
    await sleep(400);
    expect(figuresHeld(m, viewer)).toContain(constable.handle);
  });
});
