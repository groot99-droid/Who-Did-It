import { ColyseusTestServer, boot } from '@colyseus/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { balance, clues, scenes } from '@wdi/content';
import { ClueKind, DIRECTIONS, TICK_RATE, TILE_PX, trailDir } from '@wdi/shared';
import { createServer } from '../src/server';
import { spawnClue } from '../src/sim/Clues';
import { handleKill } from '../src/sim/Kill';
import { simOf } from '../src/sim/RoomSim';
import { playerOf, prop, readyKnife, sleep, teleport, tilePx } from './killHelpers';
import { toNight } from './phaseHelpers';
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

async function party(): Promise<Match> {
  const m = await startMatch(colyseus, 5, { Bot0: 'killer' });
  toNight(m);
  return m;
}

/** White-box kill of bot `v` by bot 0 in `scene` at a tile, bypassing the wire. */
function kill(
  m: Match,
  v: number,
  scene: 'overworld' | 'tavern_bar' | 'apoth_shop',
  tx: number,
  ty: number,
): void {
  const [k, victim] = [m.bots[0]!, m.bots[v]!];
  readyKnife(m, k);
  teleport(m, k, scene, tx, ty);
  teleport(m, victim, scene, tx + 1, ty);
  handleKill(m.room, k.id, { abilityId: 'kill', targetId: victim.id });
}

describe('kill clues', () => {
  it('spawns the teaching clue once at the prop, Footprints tall, with its fixed id', async () => {
    const m = await party();
    const at = prop('ov.teaching_clue');
    const clue = m.room.state.scenes.get('overworld')!.clues.get('clue_teaching')!;
    expect(clue).toMatchObject({ kind: ClueKind.footprints, value: 2, claimed: false });
    expect([clue.x, clue.y]).toEqual([Math.round(tilePx(at.x)), Math.round(tilePx(at.y))]);
    expect(simOf(m.room).clueSeq.get('overworld')).toBeUndefined();
    expect(m.room.state.scenes.get('overworld')!.clues.size).toBe(1);
  });

  it('puts Footprints one tile along the trail toward the nearest portal and a Thread beside it', async () => {
    const m = await party();
    const traits = playerOf(m, m.bots[0]!).traits;
    kill(m, 1, 'tavern_bar', 4, 4);
    const scene = m.room.state.scenes.get('tavern_bar')!;
    expect([...scene.clues.keys()].sort()).toEqual(['clue_tavern_bar_1', 'clue_tavern_bar_2']);
    const prints = scene.clues.get('clue_tavern_bar_1')!;
    const thread = scene.clues.get('clue_tavern_bar_2')!;
    expect(prints).toMatchObject({ kind: ClueKind.footprints, value: traits.height });
    // One tile off the body's tile (5,4) along `dir` (n, ne, e, ... clockwise), so the body never hides it.
    const STEP = [
      [0, -1],
      [1, -1],
      [1, 0],
      [1, 1],
      [0, 1],
      [-1, 1],
      [-1, 0],
      [-1, -1],
    ] as const;
    const [sx, sy] = STEP[prints.dir]!;
    expect([Math.floor(prints.x / TILE_PX), Math.floor(prints.y / TILE_PX)]).toEqual([5 + sx, 4 + sy]);
    expect(thread).toMatchObject({ kind: ClueKind.thread, value: traits.scarf });

    const portals = scenes.tavern_bar.portals;
    const near = [...portals].sort((a, b) => Math.hypot(a.x - 5, a.y - 4) - Math.hypot(b.x - 5, b.y - 4))[0]!;
    expect(prints.dir).toBe(DIRECTIONS.indexOf(DIRECTIONS[trailDir(5, 4, near.x, near.y)]!));
    expect(prints.dir).toBe(trailDir(5, 4, near.x, near.y));
    const [tx, ty] = [Math.floor(thread.x / TILE_PX), Math.floor(thread.y / TILE_PX)];
    expect(Math.max(Math.abs(tx - near.x), Math.abs(ty - near.y))).toBeLessThanOrEqual(1);
  });

  it('counts ids per scene, so a kill elsewhere never shifts them', async () => {
    const m = await party();
    kill(m, 1, 'tavern_bar', 4, 4);
    kill(m, 2, 'apoth_shop', 4, 4);
    kill(m, 3, 'tavern_bar', 6, 4);
    const ids = (s: string) => [...m.room.state.scenes.get(s)!.clues.keys()].sort();
    expect(ids('apoth_shop')).toEqual(['clue_apoth_shop_1', 'clue_apoth_shop_2']);
    expect(ids('tavern_bar')).toEqual([1, 2, 3, 4].map((n) => `clue_tavern_bar_${n}`));
  });

  it('decays Footprints after their seconds and never the Thread', async () => {
    const m = await party();
    const tick = m.room.state.tick;
    kill(m, 1, 'tavern_bar', 4, 4);
    const sim = simOf(m.room);
    const prints = sim.clueMeta.get('clue_tavern_bar_1')!;
    const thread = sim.clueMeta.get('clue_tavern_bar_2')!;
    const decay = clues.clues.footprints?.decay;
    expect(decay?.kind).toBe('seconds');
    expect(prints.expiresTick! - tick).toBeGreaterThanOrEqual(
      (decay?.kind === 'seconds' ? decay.seconds : 0) * TICK_RATE,
    );
    expect(thread.expiresTick).toBeNull();
    prints.expiresTick = m.room.state.tick + 2;
    await sleep(300);
    const scene = m.room.state.scenes.get('tavern_bar')!;
    expect([...scene.clues.keys()]).toEqual(['clue_tavern_bar_2']);
    expect(sim.clueMeta.has('clue_tavern_bar_1')).toBe(false);
  });

  it('drops the oldest claimed clue first above the per-scene cap', async () => {
    const m = await party();
    const cap = balance.clues.capPerScene;
    const scene = m.room.state.scenes.get('tavern_bar')!;
    const spec = { kind: ClueKind.thread, value: 0, dir: 0, tx: 4, ty: 4 };
    const ids = Array.from({ length: cap }, () => spawnClue(m.room, 'tavern_bar', spec)!);
    expect(scene.clues.size).toBe(cap);
    scene.clues.get(ids[5]!)!.claimed = true;
    scene.clues.get(ids[9]!)!.claimed = true;
    const newest = spawnClue(m.room, 'tavern_bar', spec)!;
    expect(scene.clues.size).toBe(cap);
    expect(scene.clues.has(ids[5]!)).toBe(false); // oldest claimed
    expect(scene.clues.has(ids[9]!)).toBe(true);
    expect(scene.clues.has(ids[0]!)).toBe(true);
    expect(scene.clues.has(newest)).toBe(true);
    spawnClue(m.room, 'tavern_bar', spec);
    expect(scene.clues.has(ids[9]!)).toBe(false);
    spawnClue(m.room, 'tavern_bar', spec);
    expect(scene.clues.has(ids[0]!)).toBe(false); // none claimed left: the oldest overall
    expect(scene.clues.size).toBe(cap);
  });

  it('keeps the kill invisible to a client in another scene (no body, no clue, no scene state)', async () => {
    const m = await party();
    const outsider = m.bots[4]!;
    teleport(m, outsider, 'overworld', 30, 22);
    kill(m, 1, 'tavern_bar', 4, 4);
    await sleep(700);
    const state = outsider.room.state as unknown as {
      scenes: Map<string, { bodies: Map<string, unknown>; clues: Map<string, unknown> }>;
    };
    expect([...state.scenes.keys()]).toEqual(['overworld']);
    expect(state.scenes.get('overworld')!.bodies.size).toBe(0);
    expect([...state.scenes.get('overworld')!.clues.keys()]).toEqual(['clue_teaching']);
  });
});
