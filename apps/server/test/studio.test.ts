import { TILE_PX } from '@wdi/shared';
import { describe, expect, it } from 'vitest';
import {
  MAX_STUDIO_SPAWNS,
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

const bakery = () => {
  const sim = createStudio('bakery');
  expect(send(sim, ['studio.teleport', { sceneId: 'bakery', spawnId: 'door' }])).toEqual([]);
  return sim;
};

describe('the Studio sim', () => {
  it('opens on the first scene of the frozen list, on its first spawn, at 1x by day', () => {
    const snap = studioSnapshot(createStudio());
    expect(snap).toMatchObject({ sceneId: STUDIO_START_SCENE, profile: 'large', noclip: false, scale: 1 });
    expect(snap.paused).toBe(false);
    expect(snap.time.phase).toBe('day');
    expect(snap.spawns).toEqual([]);
  });

  it('walks into a wall and stops; with noclip it walks through to the edge of the scene', () => {
    const sim = bakery();
    expect(studioSnapshot(sim)).toMatchObject({ tx: 8, ty: 9 });
    hold(sim, -1, 0, 80);
    // Row 9 of the bakery is `###.....S...`: tile 3 is the last floor.
    expect(studioSnapshot(sim).tx).toBe(3);
    send(sim, ['studio.noclip', { on: true }]);
    hold(sim, -1, 0, 80);
    expect(studioSnapshot(sim).tx).toBe(0);
    expect(sim.x).toBeGreaterThanOrEqual(0);
  });

  it('teleports to a spawn of any scene or a tile; a wall tile only under noclip', () => {
    const sim = createStudio();
    expect(send(sim, ['studio.teleport', { sceneId: 'bakery', spawnId: 'oven_room' }])).toEqual([]);
    expect(studioSnapshot(sim)).toMatchObject({ sceneId: 'bakery', tx: 5, ty: 1 });
    expect(send(sim, ['studio.teleport', { x: 3, y: 9 }])).toEqual([]);
    expect(studioSnapshot(sim)).toMatchObject({ sceneId: 'bakery', tx: 3, ty: 9 });
    expect(send(sim, ['studio.teleport', { x: 0, y: 0 }])).toEqual(['cannot stand there']);
    expect(send(sim, ['studio.teleport', { x: 99, y: 0 }])).toEqual(['cannot stand there']);
    expect(send(sim, ['studio.teleport', { sceneId: 'bakery', spawnId: 'nowhere' }])).toEqual([
      'cannot stand there',
    ]);
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

  it('pauses the figure, single-steps exactly, and runs 10 ticks a tick at 10x', () => {
    const sim = bakery();
    send(sim, ['studio.clock', { paused: true }]);
    const frozen = sim.tick;
    const x = sim.x;
    hold(sim, 1, 0, 5);
    expect(sim.tick).toBe(frozen);
    expect(sim.x).toBe(x);
    send(sim, ['studio.clock', { step: 3 }]);
    expect(sim.tick).toBe(frozen + 3);
    // Commands still apply while paused.
    expect(send(sim, ['studio.teleport', { x: 3, y: 9 }])).toEqual([]);
    expect(studioSnapshot(sim).tx).toBe(3);
    send(sim, ['studio.clock', { paused: false, scale: 10 }]);
    const t = sim.tick;
    stepStudio(sim);
    expect(sim.tick).toBe(t + 10);
  });

  it('sets the time of day and the profile', () => {
    const sim = createStudio();
    send(sim, ['studio.time', { phase: 'dusk', t: 0.25 }], ['studio.profile', { profile: 'small' }]);
    expect(studioSnapshot(sim)).toMatchObject({ time: { phase: 'dusk', t: 0.25 }, profile: 'small' });
  });

  it('places stand-ins of every kind on the current scene, gives items, and clears', () => {
    const sim = bakery();
    expect(
      send(
        sim,
        ['studio.spawn', { kind: 'mob', ref: 'wolf' }],
        ['studio.spawn', { kind: 'townsfolk', ref: 'clerk', x: 4, y: 8 }],
        ['studio.spawn', { kind: 'look', ref: 'detective', x: 5, y: 8 }],
        ['studio.spawn', { kind: 'look', ref: 'villager', x: 6, y: 8 }],
        ['studio.give', { itemId: 'knife' }],
      ),
    ).toEqual([]);
    const snap = studioSnapshot(sim);
    expect(snap.spawns.map((s) => [s.kind, s.ref, s.x, s.y])).toEqual([
      ['mob', 'wolf', 8, 9],
      ['townsfolk', 'clerk', 4, 8],
      ['look', 'detective', 5, 8],
      ['look', 'villager', 6, 8],
    ]);
    expect(new Set(snap.spawns.map((s) => s.id)).size).toBe(4);
    expect(snap.items).toEqual(['knife']);
    // Stand-ins belong to their scene.
    send(sim, ['studio.portal', { portalId: 'bk.door' }]);
    expect(studioSnapshot(sim).spawns).toEqual([]);
    send(sim, ['studio.teleport', { sceneId: 'bakery', spawnId: 'door' }]);
    expect(studioSnapshot(sim).spawns).toHaveLength(4);
    send(sim, ['studio.clearSpawns', {}]);
    expect(studioSnapshot(sim).spawns).toEqual([]);
  });

  it('caps the stand-ins of a scene', () => {
    const sim = bakery();
    for (let i = 0; i < MAX_STUDIO_SPAWNS; i++)
      sim.commands.push({ kind: 'spawn', spawn: 'mob', ref: 'rat' });
    expect(stepStudio(sim)).toEqual([]);
    expect(send(sim, ['studio.spawn', { kind: 'mob', ref: 'rat' }])).toEqual(['too many spawns']);
  });

  it('refuses bad shapes and unknown ids, and changes nothing', () => {
    const sim = bakery();
    const before = studioSnapshot(sim);
    const bad: [string, unknown][] = [
      ['studio.noclip', { on: 'yes' }],
      ['studio.noclip', null],
      ['studio.teleport', { sceneId: 'atlantis', spawnId: 'door' }],
      ['studio.teleport', { x: 1.5, y: 2 }],
      ['studio.teleport', { x: -1, y: 2 }],
      ['studio.teleport', {}],
      ['studio.portal', { portalId: 7 }],
      ['studio.profile', { profile: 'huge' }],
      ['studio.time', { phase: 'noon' }],
      ['studio.time', { phase: 'day', t: 2 }],
      ['studio.clock', { scale: 3 }],
      ['studio.clock', { step: 1e9 }],
      ['studio.clock', {}],
      ['studio.spawn', { kind: 'dragon', ref: 'wolf' }],
      ['studio.spawn', { kind: 'mob', ref: 'unicorn' }],
      ['studio.spawn', { kind: 'look', ref: 'wolf' }],
      ['studio.spawn', { kind: 'mob', ref: 'wolf', x: 1 }],
      ['studio.give', { itemId: 'lightsaber' }],
      ['studio.give', { itemId: 'toString' }],
      ['studio.spawn', { kind: 'mob', ref: 'constructor' }],
      ['studio.profile', { profile: '__proto__' }],
      ['studio.nope', {}],
    ];
    const refusals = send(sim, ...bad);
    expect(refusals).toHaveLength(bad.length);
    expect(studioSnapshot(sim)).toEqual({ ...before, tick: before.tick + 1 });
    expect(sim.x).toBe(before.x);
  });

  it('logs each applied and refused command with its tick', () => {
    const sim = bakery();
    sim.log.length = 0;
    send(sim, ['studio.noclip', { on: true }], ['studio.portal', { portalId: 'bk.oven_room' }]);
    expect(sim.log).toEqual([`t${sim.tick - 1} noclip on`, `t${sim.tick - 1} refused portal: too far`]);
  });

  it('keeps world-frame facing from the input', () => {
    const sim = bakery();
    hold(sim, 0, -1, 2);
    expect(studioSnapshot(sim).yaw).toBeCloseTo(0);
    hold(sim, 1, 0, 2);
    expect(studioSnapshot(sim).yaw).toBeCloseTo(Math.PI / 2);
    expect(studioSnapshot(sim).x).toBe(Math.round(sim.x));
    expect(studioSnapshot(sim).tx).toBe(Math.floor(sim.x / TILE_PX));
  });
});
