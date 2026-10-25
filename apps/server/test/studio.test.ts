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

describe('moving through the world (S1b)', () => {
  const bakery = () => {
    const sim = createStudio();
    expect(send(sim, ['studio.teleport', { sceneId: 'bakery', spawnId: 'door' }])).toEqual([]);
    return sim;
  };

  it('walks through walls to the edge of the scene under noclip', () => {
    const sim = bakery();
    send(sim, ['studio.noclip', { on: true }]);
    hold(sim, -1, 0, 80);
    expect(studioSnapshot(sim)).toMatchObject({ tx: 0, noclip: true });
    expect(sim.x).toBeGreaterThanOrEqual(0);
  });

  it('teleports to a spawn of any scene or a tile; a wall tile only under noclip', () => {
    const sim = createStudio();
    expect(send(sim, ['studio.teleport', { sceneId: 'bakery', spawnId: 'oven_room' }])).toEqual([]);
    expect(studioSnapshot(sim)).toMatchObject({ sceneId: 'bakery', tx: 5, ty: 1 });
    expect(send(sim, ['studio.teleport', { x: 3, y: 9 }])).toEqual([]);
    expect(studioSnapshot(sim)).toMatchObject({ sceneId: 'bakery', tx: 3, ty: 9 });
    for (const bad of [
      { x: 0, y: 0 },
      { x: 99, y: 0 },
      { sceneId: 'bakery', spawnId: 'nowhere' },
    ]) {
      expect(send(sim, ['studio.teleport', bad])).toEqual(['cannot stand there']);
    }
    expect(studioSnapshot(sim)).toMatchObject({ tx: 3, ty: 9 });
    send(sim, ['studio.noclip', { on: true }]);
    expect(send(sim, ['studio.teleport', { x: 0, y: 0 }])).toEqual([]);
    expect(studioSnapshot(sim)).toMatchObject({ tx: 0, ty: 0 });
  });

  it('goes through a door in reach to its target spawn, and refuses one out of reach', () => {
    const sim = bakery();
    expect(send(sim, ['studio.portal', { portalId: 'bk.oven_room' }])).toEqual(['too far']);
    expect(send(sim, ['studio.portal', { portalId: 'bk.nope' }])).toEqual(['no such door']);
    expect(sim.sceneId).toBe('bakery');
    expect(send(sim, ['studio.portal', { portalId: 'bk.door' }])).toEqual([]);
    expect(sim.sceneId).toBe('overworld');
    expect(sim.log.some((l) => l.endsWith('door bk.door'))).toBe(true);
  });

  it('sets the profile', () => {
    const sim = createStudio();
    send(sim, ['studio.profile', { profile: 'small' }]);
    expect(studioSnapshot(sim).profile).toBe('small');
  });

  it('refuses bad shapes and unknown ids, and changes nothing', () => {
    const sim = bakery();
    const before = studioSnapshot(sim);
    const bad: [string, unknown][] = [
      ['studio.noclip', { on: 'yes' }],
      ['studio.teleport', { sceneId: 'atlantis', spawnId: 'door' }],
      ['studio.teleport', { x: 1.5, y: 2 }],
      ['studio.teleport', { x: -1, y: 2 }],
      ['studio.teleport', { x: 1, y: 2, spawnId: 'door' }],
      ['studio.teleport', {}],
      ['studio.portal', { portalId: 7 }],
      ['studio.profile', { profile: 'huge' }],
      ['studio.profile', { profile: '__proto__' }],
    ];
    expect(send(sim, ...bad)).toHaveLength(bad.length);
    expect(studioSnapshot(sim)).toEqual({ ...before, tick: before.tick + 1 });
  });

  it('logs each applied and refused command with its tick', () => {
    const sim = bakery();
    sim.log.length = 0;
    send(sim, ['studio.noclip', { on: true }], ['studio.portal', { portalId: 'bk.oven_room' }]);
    expect(sim.log).toEqual([`t${sim.tick - 1} noclip on`, `t${sim.tick - 1} refused portal: too far`]);
  });
});
