import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { balance } from '@wdi/content';
import { Phase, TILE_PX } from '@wdi/shared';
import { TOWN, balanceOf, movePurse } from '../src/sim/economy/purse';
import { onSim, type SimEvent } from '../src/sim/events/bus';
import { npcMemory } from '../src/sim/npc/memory';
import { needsOf } from '../src/sim/npc/needs';
import { simOf } from '../src/sim/RoomSim';
import { type Figure, figuresOf, rehandleFigure } from '../src/sim/townsfolk/figures';
import { type MugFactors, aloneTarget, mugChance } from '../src/sim/townsfolk/mug';
import { sceneIndex } from '../src/sim/World';
import { openRun } from './killHelpers';
import {
  type Party,
  advance,
  allTownsfolk,
  bootNpcServer,
  holdPhase,
  lobbyOf,
  npcSeats,
  pauseClock,
  placeSeat,
  start,
  toWorld,
} from './npcHelpers';

/**
 * The mugging roll (round 8, GDD 3.24, docs/round8/townsfolk.md 3; Session 8E): the chance rises with the purse
 * band and the mood and falls with fear and a lit light, and the one seat alone with the mugger is found by A100's
 * room rule with the figures as company too.
 */

/** The cellar is not the hub, is dark by day and has no creature spawner. */
const RUN = openRun('cellar', 6);
const m = balance.moods.mug;

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => {
  ({ colyseus, release } = await bootNpcServer());
});
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

/** Stands a figure on a tile of a scene and keeps it there (an idle that never ends), under a fresh handle. */
function placeFigure(party: Party, f: Figure, sceneId: 'cellar' | 'overworld', tx: number, ty: number): void {
  f.sceneIdx = sceneIndex(sceneId);
  f.x = (tx + 0.5) * TILE_PX;
  f.y = (ty + 0.5) * TILE_PX;
  f.brain.path = null;
  f.act = {
    kind: 'idle',
    untilTick: Number.POSITIVE_INFINITY,
    station: null,
    goal: { scene: sceneId, x: f.x, y: f.y },
  };
  rehandleFigure(party.room, f);
}

/**
 * 1 human + 3 NPCs by day, every other seat a ghost, one Hungry figure `mugger` in the cellar `apart` tiles from the
 * target (the rest of the townsfolk parked on the overworld), the target carrying a purse of `purse`. The target is
 * the human, or with `npcTarget` one NPC seat held still (the human a ghost on the overworld).
 */
async function world(
  opts: { apart?: number; purse?: number; npcTarget?: boolean } = {},
): Promise<{ party: Party; human: string; target: string; mugger: Figure; heard: SimEvent[] }> {
  const { apart = 4, purse = 30, npcTarget = false } = opts;
  const party = await lobbyOf(colyseus, 1);
  await start(party);
  await toWorld(party);
  pauseClock(party.room);
  allTownsfolk(party.room);
  const room = party.room;
  const human = party.humans[0]!.id;
  const target = npcTarget ? npcSeats(room)[0]!.id : human;
  for (const [id, p] of simOf(room).players) p.dead = id !== target;
  holdPhase(party, Phase.day, 3600);
  const figures = [...figuresOf(room).values()];
  const mugger = figures[0]!;
  for (const f of figures.slice(1)) placeFigure(party, f, 'overworld', 2, 2);
  if (npcTarget) {
    placeSeat(party, human, 'overworld', 3, 3);
    npcMemory(room).brain(target).pauseUntilTick = Number.POSITIVE_INFINITY;
  }
  placeSeat(party, target, 'cellar', RUN.x, RUN.y);
  placeFigure(party, mugger, 'cellar', RUN.x + apart, RUN.y);
  needsOf(mugger.brain).hunger = 1;
  // The stake of the look is paid on the first world ticks (8C): then the purse is set to exactly `purse`.
  advance(party, 2);
  movePurse(room, target, TOWN, balanceOf(room, target), 'buy');
  if (purse > 0) movePurse(room, TOWN, target, purse, 'stake');
  const heard: SimEvent[] = [];
  for (const kind of ['mug.start', 'mug.end', 'rob']) onSim(room, kind, (e) => heard.push(e));
  advance(party, 1);
  return { party, human, target, mugger, heard };
}

const BASE: MugFactors = {
  band: 'light',
  strength: 0.6,
  fear: 0,
  night: false,
  weak: false,
  longAlone: false,
  light: false,
};

describe('the mugging roll', () => {
  it('rises with the purse band, the mood, the night, a weak target and a long time alone; falls with fear and a light', () => {
    const light = mugChance(BASE);
    const heavy = mugChance({ ...BASE, band: 'heavy' });
    expect(light).toBeGreaterThan(0);
    expect(heavy).toBeGreaterThan(light);
    expect(mugChance({ ...BASE, strength: 1 })).toBeGreaterThan(light);
    expect(mugChance({ ...BASE, night: true })).toBeCloseTo(light * m.nightMul, 9);
    expect(mugChance({ ...BASE, weak: true })).toBeCloseTo(light * m.weakMul, 9);
    // The long wait counts only beside a heavy purse.
    expect(mugChance({ ...BASE, longAlone: true })).toBe(light);
    expect(mugChance({ ...BASE, band: 'heavy', longAlone: true })).toBeCloseTo(heavy * m.longAloneMul, 9);
    expect(mugChance({ ...BASE, fear: 1 })).toBeLessThan(light);
    expect(mugChance({ ...BASE, light: true })).toBeCloseTo(light * m.lightMul, 9);
    expect(mugChance({ ...BASE, band: 'heavy', strength: 1, night: true, weak: true })).toBeLessThanOrEqual(
      1,
    );
  });

  it('is zero with company (a seat or another figure), in the hub, and for the Watchman look', async () => {
    const { party, human, mugger } = await world();
    const room = party.room;
    const who = {
      id: mugger.id,
      figure: mugger,
      brain: mugger.brain,
      sceneIdx: mugger.sceneIdx,
      x: mugger.x,
      y: mugger.y,
    };
    expect(aloneTarget(room, who)).toBe(human);
    // A second living seat in the scene.
    const other = npcSeats(room)[0]!.id;
    simOf(room).players.get(other)!.dead = false;
    placeSeat(party, other, 'cellar', RUN.x + 1, RUN.y);
    expect(aloneTarget(room, who)).toBeNull();
    simOf(room).players.get(other)!.dead = true;
    expect(aloneTarget(room, who)).toBe(human);
    // Another figure in the scene.
    const bystander = [...figuresOf(room).values()][1]!;
    placeFigure(party, bystander, 'cellar', RUN.x + 2, RUN.y);
    expect(aloneTarget(room, who)).toBeNull();
    placeFigure(party, bystander, 'overworld', 2, 2);
    expect(aloneTarget(room, who)).toBe(human);
    // The look everyone sees is the Watchman's.
    room.state.players.get(human)!.look = 'watchman';
    expect(aloneTarget(room, who)).toBeNull();
    room.state.players.get(human)!.look = '';
    // The hub (the overworld square) is never alone.
    placeSeat(party, human, 'overworld', 3, 3);
    placeFigure(party, mugger, 'overworld', 4, 3);
    expect(aloneTarget(room, { ...who, sceneIdx: mugger.sceneIdx, x: mugger.x, y: mugger.y })).toBeNull();
  });
});
