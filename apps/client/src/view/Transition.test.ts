import { afterEach, describe, expect, it } from 'vitest';
import balance from '@wdi/content/data/balance.json';
import { scenes } from '@wdi/content';
import {
  domHost,
  pickTransition,
  portalTransition,
  transition,
  type PortalRow,
  type TransitionHost,
  type TransitionKind,
  type TransitionLayer,
} from './Transition';

/** A host with a hand-driven clock and layers whose `transitionend` the test fires. */
function fakeHost(reduced = false) {
  const timers: Array<{ at: number; fn: () => void; live: boolean }> = [];
  const layers: Array<{
    kind: TransitionKind;
    halfMs: number;
    removed: boolean;
    pending: Array<() => void>;
  }> = [];
  let now = 0;
  const host: TransitionHost = {
    reduced: () => reduced,
    mount: (kind, halfMs): TransitionLayer => {
      const state = { kind, halfMs, removed: false, pending: [] as Array<() => void> };
      layers.push(state);
      return {
        cover: (done) => state.pending.push(done),
        reveal: (done) => state.pending.push(done),
        remove: () => {
          state.removed = true;
        },
      };
    },
    after: (fn, ms) => {
      const t = { at: now + ms, fn, live: true };
      timers.push(t);
      return () => {
        t.live = false;
      };
    },
  };
  const tick = (ms: number) => {
    now += ms;
    for (const t of timers) {
      if (t.live && t.at <= now) {
        t.live = false;
        t.fn();
      }
    }
  };
  return { host, layers, tick };
}

afterEach(() => {
  // Flush any transition a test left running, so the module's single slot starts clean.
  transition('fade', 0, () => undefined, fakeHost().host);
});

describe('transition', () => {
  it('runs then at once at 0 ms and mounts nothing', () => {
    const { host, layers } = fakeHost();
    let ran = 0;
    transition('fade', 0, () => ran++, host);
    expect(ran).toBe(1);
    expect(layers).toHaveLength(0);
  });

  it('runs then at once under reduced motion', () => {
    const { host, layers } = fakeHost(true);
    let ran = 0;
    transition('iris', 600, () => ran++, host);
    expect(ran).toBe(1);
    expect(layers).toHaveLength(0);
  });

  it('runs then on transitionend, once, and removes the layer after the lift', () => {
    const { host, layers } = fakeHost();
    let ran = 0;
    transition('wipe', 700, () => ran++, host);
    expect(ran).toBe(0);
    expect(layers[0]?.halfMs).toBe(350);
    layers[0]?.pending.shift()?.();
    expect(ran).toBe(1);
    expect(layers[0]?.removed).toBe(false);
    layers[0]?.pending.shift()?.();
    expect(layers[0]?.removed).toBe(true);
    expect(ran).toBe(1);
  });

  it('runs then on the timeout when transitionend never comes', () => {
    const { host, layers, tick } = fakeHost();
    let ran = 0;
    transition('fade', 400, () => ran++, host);
    tick(200);
    expect(ran).toBe(0);
    tick(130);
    expect(ran).toBe(1);
    tick(400);
    expect(layers[0]?.removed).toBe(true);
  });

  it('does not run then twice when the event and the timer both arrive', () => {
    const { host, layers, tick } = fakeHost();
    let ran = 0;
    transition('fade', 400, () => ran++, host);
    layers[0]?.pending.shift()?.();
    tick(1000);
    expect(ran).toBe(1);
  });

  it('drops the older then when a newer transition starts', () => {
    const { host, layers } = fakeHost();
    const order: string[] = [];
    transition('iris', 600, () => order.push('meeting'), host);
    transition('fade', 400, () => order.push('world'), host);
    expect(layers[0]?.removed).toBe(true);
    layers[1]?.pending.shift()?.();
    expect(order).toEqual(['world']);
  });
});

describe('domHost', () => {
  it('reports reduced motion without a document, so the router stays synchronous in tests', () => {
    expect(domHost().reduced()).toBe(true);
  });
});

describe('balance.ui.transitionS', () => {
  it('sets a short, non-zero duration for each kind', () => {
    for (const kind of ['fade', 'iris', 'wipe'] as const) {
      expect(balance.ui.transitionS[kind]).toBeGreaterThan(0);
      expect(balance.ui.transitionS[kind]).toBeLessThanOrEqual(1);
    }
  });
});

describe('portal transitions (round 8, 8H)', () => {
  const portals: PortalRow[] = [
    { from: 'bakery', to: 'overworld', toSpawn: 'bakery', kind: 'door' },
    { from: 'bp_mine', to: 'bp_deep', toSpawn: 'ladder', kind: 'shaft', elevationDelta: -8 },
    { from: 'bp_deep', to: 'bp_mine', toSpawn: 'winze', kind: 'shaft', elevationDelta: 8 },
    { from: 'barn', to: 'loft', toSpawn: 'stair', kind: 'stairs', elevationDelta: 0 },
    { from: 'overworld', to: 'woods', toSpawn: 'gate', kind: 'forest_gate' },
  ];
  const stations = new Set(['overworld.platform']);
  const enter = (sceneId: string, spawn: string) => ({ sceneId, spawn });

  it('wipes through a door, climbs a shaft either way, irises a level stair and fades through a gate', () => {
    expect(pickTransition('bakery', enter('overworld', 'bakery'), portals, stations)).toBe('wipe');
    expect(pickTransition('bp_mine', enter('bp_deep', 'ladder'), portals, stations)).toBe('climbDown');
    expect(pickTransition('bp_deep', enter('bp_mine', 'winze'), portals, stations)).toBe('climbUp');
    expect(pickTransition('barn', enter('loft', 'stair'), portals, stations)).toBe('iris');
    expect(pickTransition('overworld', enter('woods', 'gate'), portals, stations)).toBe('fade');
  });

  it('fades through the station on an arrival at a map station', () => {
    expect(pickTransition('elsewhere', enter('overworld', 'platform'), portals, stations)).toBe('station');
  });

  it('fades for the first spawn, a return to the same scene, and an unknown route', () => {
    expect(pickTransition(null, enter('overworld', 'bakery'), portals, stations)).toBe('fade');
    expect(pickTransition('overworld', enter('overworld', 'bakery'), portals, stations)).toBe('fade');
    expect(pickTransition('woods', enter('overworld', 'bakery'), portals, stations)).toBe('fade');
  });

  it('maps every portal kind the scenes use, and every door of the shipped scenes wipes', () => {
    const real = Object.values(scenes as Record<string, { portals: PortalRow[] }>).flatMap((s) => s.portals);
    const known = new Set(['door', 'stairs', 'hatch', 'shaft', 'drop', 'crawl', 'forest_gate', 'cave_mouth']);
    for (const p of real) expect(known, `${p.from} -> ${p.to}: ${p.kind}`).toContain(p.kind);
    const door = real.find((p) => p.kind === 'door')!;
    expect(pickTransition(door.from, enter(door.to, door.toSpawn), real, stations)).toBe('wipe');
  });

  it('remembers the scene it last saw, and answers fade until the graph loads', () => {
    expect(portalTransition(enter('bakery', 'door'))).toBe('fade');
  });
});
