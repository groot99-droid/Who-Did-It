import { TILE_PX } from '@wdi/shared';
import { describe, expect, it } from 'vitest';
import {
  STUDIO_START_SCENE,
  type StudioSim,
  createStudio,
  parseStudio,
  stepStudio,
  studioSnapshot,
} from '../src/sim/studio/Studio';

/** Parses and queues each message, then runs one room tick; the refusals of parsing and of the step, in order. */
function send(sim: StudioSim, ...msgs: [string, unknown][]): string[] {
  const out: string[] = [];
  for (const [type, payload] of msgs) {
    const cmd = parseStudio(type, payload);
    if (typeof cmd === 'string') out.push(cmd);
    else sim.commands.push(cmd);
  }
  return [...out, ...stepStudio(sim)];
}

let seq = 0;
/** Holds a direction for `ticks` room ticks (the client resends its input every tick, as in the game). */
function hold(sim: StudioSim, dx: number, dy: number, ticks: number): void {
  for (let i = 0; i < ticks; i++) send(sim, ['studio.move', { seq: ++seq, dx, dy }]);
}

describe('the Studio sim', () => {
  it('opens on the first scene of the frozen list, on its first spawn, at 1x by day', () => {
    const snap = studioSnapshot(createStudio());
    expect(snap).toMatchObject({ sceneId: STUDIO_START_SCENE, profile: 'large', noclip: false, scale: 1 });
    expect(snap.paused).toBe(false);
    expect(snap.time.phase).toBe('day');
    expect(snap.spawns).toEqual([]);
    expect(snap.items).toEqual([]);
  });

  it('walks with the swept box and stops at a wall', () => {
    const sim = createStudio('bakery');
    expect(studioSnapshot(sim)).toMatchObject({ tx: 8, ty: 9 });
    hold(sim, -1, 0, 80);
    // Row 9 of the bakery is `###.....S...`: tile 3 is the last floor.
    expect(studioSnapshot(sim)).toMatchObject({ tx: 3, ty: 9 });
  });

  it('stops when the input goes stale, keeps the newest seq only, and faces in the world frame', () => {
    const sim = createStudio('bakery');
    hold(sim, 1, 0, 2);
    expect(studioSnapshot(sim).moving).toBe(true);
    expect(studioSnapshot(sim).yaw).toBeCloseTo(Math.PI / 2);
    const x = sim.x;
    send(sim, ['studio.move', { seq: 1, dx: -1, dy: 0 }]);
    expect(sim.x).toBeGreaterThan(x);
    for (let i = 0; i < 10; i++) stepStudio(sim);
    const still = sim.x;
    stepStudio(sim);
    expect(sim.x).toBe(still);
    expect(studioSnapshot(sim)).toMatchObject({
      moving: false,
      x: Math.round(sim.x),
      tx: Math.floor(sim.x / TILE_PX),
    });
  });

  it('refuses a payload that is not an object, and changes nothing', () => {
    const sim = createStudio('bakery');
    const before = studioSnapshot(sim);
    expect(send(sim, ['studio.give', null], ['studio.noclip', [1]], ['studio.nope', {}])).toEqual([
      'bad payload',
      'bad payload',
      'unknown command',
    ]);
    send(sim, ['studio.move', 'garbage']);
    expect(studioSnapshot(sim)).toEqual({ ...before, tick: before.tick + 2 });
  });
});
