import { balance, mobs } from '@wdi/content';
import { type StudioSpawn, TILE_PX } from '@wdi/shared';
import { describe, expect, it } from 'vitest';
import {
  type StudioSim,
  createStudio,
  parseStudio,
  stepStudio,
  studioSnapshot,
} from '../src/sim/studio/Studio';
import { STANDIN_LEASH_TILES } from '../src/sim/studio/standins';

/** Parses and queues each message, then runs one room tick (as `studio.test.ts`). */
function send(sim: StudioSim, ...msgs: [string, unknown][]): string[] {
  const out: string[] = [];
  for (const [type, payload] of msgs) {
    const cmd = parseStudio(type, payload);
    if (typeof cmd === 'string') out.push(cmd);
    else sim.commands.push(cmd);
  }
  return [...out, ...stepStudio(sim)];
}

/** The overworld with the admin figure on an open tile and the given stand-ins placed. */
function world(admin: [number, number], ...spawns: [string, string, number, number][]): StudioSim {
  const sim = createStudio('overworld');
  expect(send(sim, ['studio.teleport', { sceneId: 'overworld', x: admin[0], y: admin[1] }])).toEqual([]);
  for (const [kind, ref, x, y] of spawns)
    expect(send(sim, ['studio.spawn', { kind, ref, x, y }])).toEqual([]);
  return sim;
}

const run = (sim: StudioSim, ticks: number, each?: (s: StudioSpawn[]) => void): StudioSpawn[] => {
  for (let i = 0; i < ticks; i++) {
    stepStudio(sim);
    each?.(studioSnapshot(sim).spawns);
  }
  return studioSnapshot(sim).spawns;
};
const tiles = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by) / TILE_PX;
const centre = (t: number) => (t + 0.5) * TILE_PX;

describe('the Studio stand-ins (S4)', () => {
  it('a mob chases the admin figure it sees, stops short of it and never bites', () => {
    const sim = world([30, 24], ['mob', 'wolf', 34, 24]);
    const states = new Set<string>();
    const [wolf] = run(sim, 80, (s) => states.add(s[0]!.state));
    expect(states).toContain('chase');
    const d = tiles(wolf!.px, wolf!.py, sim.x, sim.y);
    expect(d).toBeLessThan(2);
    expect(d).toBeGreaterThan(0.3);
    expect(wolf!.yaw).toBeCloseTo(-Math.PI / 2, 1); // facing west, toward the figure
  });

  it('a mob flees a burning flame by night and keeps to its leash', () => {
    // The lantern on its post at (22, 15) burns at dusk and night; the wolf flees within 4 tiles of it.
    const sim = world([40, 24], ['mob', 'wolf', 24, 17]);
    send(sim, ['studio.time', { phase: 'night' }]);
    const states = new Set<string>();
    let far = 0;
    const [wolf] = run(sim, 600, (s) => {
      states.add(s[0]!.state);
      far = Math.max(far, tiles(s[0]!.px, s[0]!.py, centre(24), centre(17)));
    });
    expect(states).toContain('flee');
    expect(tiles(wolf!.px, wolf!.py, centre(22), centre(15))).toBeGreaterThan(
      mobs.mobs.wolf!.fleeLightTiles - 1,
    );
    expect(far).toBeLessThanOrEqual(STANDIN_LEASH_TILES + 0.01);
  });

  it('a mob with nothing to chase or flee idles and roams inside its leash by day', () => {
    const sim = world([40, 24], ['mob', 'rat', 24, 24]);
    const states = new Set<string>();
    let far = 0;
    let moved = false;
    run(sim, 2000, (s) => {
      states.add(s[0]!.state);
      moved ||= s[0]!.moving;
      far = Math.max(far, tiles(s[0]!.px, s[0]!.py, centre(24), centre(24)));
    });
    expect([...states].sort()).toEqual(['idle', 'walk']);
    expect(moved).toBe(true);
    expect(far).toBeLessThanOrEqual(STANDIN_LEASH_TILES + 0.01);
  });

  it('a townsfolk figure walks its stations in route order and works at each', () => {
    // The clerk's route is ledger, notice board, window, pump: in the overworld the board (35, 20), then the pump (32, 21).
    const sim = world([40, 24], ['townsfolk', 'clerk', 30, 24]);
    const stops: [number, number][] = [];
    let last = '';
    const dwell = balance.townsfolk.stationDwellS.max * 20;
    run(sim, 3 * dwell + 600, (s) => {
      const c = s[0]!;
      if (c.state === 'work' && last !== 'work') stops.push([c.px, c.py]);
      last = c.state;
    });
    expect(stops.length).toBeGreaterThanOrEqual(3);
    expect(tiles(...stops[0]!, centre(35), centre(20))).toBeLessThan(1.5);
    expect(tiles(...stops[1]!, centre(32), centre(21))).toBeLessThan(1.5);
    expect(tiles(...stops[2]!, centre(35), centre(20))).toBeLessThan(1.5);
  });

  it('a look and a fixed stallholder stand; a paused clock freezes every stand-in', () => {
    const sim = world([30, 24], ['look', 'villager', 26, 24], ['townsfolk', 'stallholder', 27, 24]);
    const still = run(sim, 100);
    expect(still.map((s) => [s.state, s.x, s.y, s.moving])).toEqual([
      ['stand', 26, 24, false],
      ['stand', 27, 24, false],
    ]);
    const chase = world([30, 24], ['mob', 'wolf', 34, 24]);
    send(chase, ['studio.clock', { paused: true }]);
    const before = studioSnapshot(chase).spawns;
    expect(run(chase, 50)).toEqual(before);
    send(chase, ['studio.clock', { step: 5 }]);
    expect(studioSnapshot(chase).spawns[0]!.px).not.toBe(before[0]!.px);
  });

  it('replays the same: equal placements give equal stand-ins, tick for tick', () => {
    const a = world([40, 24], ['mob', 'rat', 24, 24], ['townsfolk', 'villager', 30, 24]);
    const b = world([40, 24], ['mob', 'rat', 24, 24], ['townsfolk', 'villager', 30, 24]);
    expect(run(a, 700)).toEqual(run(b, 700));
  });
});
